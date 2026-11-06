using Microsoft.AspNetCore.StaticFiles;

namespace Kcal.Server.Hosting;

/// <summary>Hosting of the web UI from wwwroot/ with its caching rules and fallbacks (8.5).</summary>
public static class StaticHosting
{
    private const string IndexFile = "index.html";
    private const string HashedAssetsPath = "/_expo/static";

    private static readonly StaticFileOptions FileOptions = CreateFileOptions();

    public static IApplicationBuilder UseWebUi(this IApplicationBuilder app) =>
        app.UseDefaultFiles().UseStaticFiles(FileOptions);

    /// <summary>
    /// Unknown /api/* paths return a 404 ProblemDetails, unknown /download and /openapi paths a plain 404,
    /// and everything else the single-page app.
    /// </summary>
    public static IEndpointRouteBuilder MapWebUiFallbacks(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapFallback("/api/{**path}", () => ApiProblemDetails.NotFound());
        endpoints.MapFallback("/download/{**path}", () => Results.NotFound());
        endpoints.MapFallback("/openapi/{**path}", () => Results.NotFound());
        endpoints.MapFallbackToFile(IndexFile, FileOptions);
        return endpoints;
    }

    private static StaticFileOptions CreateFileOptions()
    {
        var contentTypes = new FileExtensionContentTypeProvider();
        contentTypes.Mappings[".wasm"] = "application/wasm";

        return new StaticFileOptions
        {
            ContentTypeProvider = contentTypes,
            OnPrepareResponse = context =>
            {
                var headers = context.Context.Response.Headers;
                if (context.File.Name == IndexFile)
                {
                    headers.CacheControl = "no-cache";
                }
                else if (context.Context.Request.Path.StartsWithSegments(HashedAssetsPath))
                {
                    headers.CacheControl = "public, max-age=31536000, immutable";
                }
            }
        };
    }
}
