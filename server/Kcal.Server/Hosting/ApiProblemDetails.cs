using System.Text.Json;
using Kcal.Server.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Kcal.Server.Hosting;

/// <summary>
/// ProblemDetails responses with the machine-readable "code" extension (8.4).
/// </summary>
public static class ApiProblemDetails
{
    public const string CodeKey = "code";

    // Codes for responses produced by the framework (validation filter, rate limiter, fallbacks)
    private static readonly Dictionary<int, string> DefaultCodes = new()
    {
        [StatusCodes.Status400BadRequest] = ErrorCodes.ValidationFailed,
        [StatusCodes.Status404NotFound] = ErrorCodes.NotFound,
        [StatusCodes.Status429TooManyRequests] = ErrorCodes.RateLimited
    };

    public static IServiceCollection AddApiProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            var problem = context.ProblemDetails;
            if (!problem.Extensions.ContainsKey(CodeKey)
                && problem.Status is { } status
                && DefaultCodes.TryGetValue(status, out var code))
            {
                problem.Extensions[CodeKey] = code;
            }
        });
        services.AddExceptionHandler<ApiExceptionHandler>();

        // Malformed JSON bodies and unparsable parameters throw BadHttpRequestException
        // (instead of an empty 400), so ApiExceptionHandler can answer with validation_failed.
        services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
        return services;
    }

    /// <summary>A 404 not_found problem, used for unknown /api/* routes and unknown resources.</summary>
    public static ProblemHttpResult NotFound() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found");

    public static ValueTask WriteAsync(HttpContext httpContext, ApiException error) =>
        WriteAsync(httpContext, new ProblemDetails
        {
            Status = error.StatusCode,
            Title = error.Message,
            Extensions = { [CodeKey] = error.Code }
        });

    public static async ValueTask WriteAsync(HttpContext httpContext, ProblemDetails problem)
    {
        httpContext.Response.StatusCode = problem.Status ?? StatusCodes.Status500InternalServerError;
        await httpContext.RequestServices.GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = problem });
    }

    private sealed class ApiExceptionHandler : IExceptionHandler
    {
        public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
        {
            switch (exception)
            {
                case ApiException apiException:
                    await WriteAsync(httpContext, apiException);
                    return true;

                case BadHttpRequestException badRequest:
                    await WriteAsync(httpContext, new ProblemDetails
                    {
                        Status = badRequest.StatusCode,
                        Title = "Invalid request",
                        Detail = badRequest.InnerException is JsonException jsonException
                            ? Describe(jsonException)
                            : badRequest.Message
                    });
                    return true;

                default:
                    return false;
            }
        }

        // Converter errors carry a custom message without the JSON path; add it so clients can see which field failed.
        private static string Describe(JsonException exception) =>
            exception.Path is { } path && !exception.Message.Contains(path)
                ? $"{exception.Message} Path: {path}."
                : exception.Message;
    }
}
