using System.Globalization;
using System.Threading.RateLimiting;
using Kcal.Server.Auth;
using Kcal.Server.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Kcal.Server.Hosting;

/// <summary>
/// Rate limits on /api/* (7.6): sliding windows of one minute with 6 segments.
/// </summary>
public static class RateLimiting
{
    /// <summary>Policy for /api/v1/auth/* and /api/v1/devices/pair: per IP.</summary>
    public const string AuthPolicy = "auth";

    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private const int SegmentsPerWindow = 6;

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services)
    {
        // Limits come from KcalOptions, so configure RateLimiterOptions with access to them
        services.AddRateLimiter(_ => { });
        services.AddOptions<RateLimiterOptions>().Configure<IOptions<KcalOptions>>((options, kcal) =>
        {
            var apiLimit = kcal.Value.ApiRequestsPerMinute;
            var authLimit = kcal.Value.AuthRequestsPerMinute;

            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                context.Request.Path.StartsWithSegments("/api")
                    ? SlidingWindow(ClientPartitionKey(context), apiLimit)
                    : RateLimitPartition.GetNoLimiter(string.Empty));
            options.AddPolicy(AuthPolicy, context => SlidingWindow(IpPartitionKey(context), authLimit));
            options.OnRejected = OnRejectedAsync;
        });
        return services;
    }

    private static RateLimitPartition<string> SlidingWindow(string partitionKey, int permitLimit) =>
        RateLimitPartition.GetSlidingWindowLimiter(partitionKey, _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = Window,
            SegmentsPerWindow = SegmentsPerWindow,
            QueueLimit = 0
        });

    /// <summary>
    /// Per device when a bearer token is sent, otherwise per IP. The limiter runs before authentication
    /// (8.8), so the device is identified by a hash of the Authorization header; raw tokens never
    /// become partition keys.
    /// </summary>
    private static string ClientPartitionKey(HttpContext context) =>
        context.Request.Headers.Authorization.ToString() is { Length: > 0 } authorization
            ? "token:" + Convert.ToBase64String(DeviceCrypto.Sha256(authorization))
            : IpPartitionKey(context);

    private static string IpPartitionKey(HttpContext context) =>
        "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown");

    private static async ValueTask OnRejectedAsync(OnRejectedContext context, CancellationToken cancellationToken)
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
        }

        await ApiProblemDetails.WriteAsync(context.HttpContext, new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Too many requests"
        });
    }
}
