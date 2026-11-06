using Kcal.Server.Hosting;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Kcal.Server.Endpoints;

/// <summary>The Android app download (8.5).</summary>
public static class DownloadEndpoints
{
    private const string ApkContentType = "application/vnd.android.package-archive";

    public static IEndpointRouteBuilder MapDownloadEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/download/kcal.apk", Results<PhysicalFileHttpResult, ProblemHttpResult> (IWebHostEnvironment environment) =>
        {
            // CI bundles the APK into the image; local builds have none
            var path = Path.Combine(environment.ContentRootPath, "downloads", "kcal.apk");
            return File.Exists(path)
                ? TypedResults.PhysicalFile(path, ApkContentType, fileDownloadName: $"kcal-{ServerInfo.Version}.apk")
                : ApiProblemDetails.NotFound();
        });
        return endpoints;
    }
}
