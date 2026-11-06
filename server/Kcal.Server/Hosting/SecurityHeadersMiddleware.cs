namespace Kcal.Server.Hosting;

/// <summary>
/// Adds the security headers to every response, plus the web UI headers (COOP/COEP/CORP, CSP)
/// to every response outside /api (7.6, 8.5).
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    public Task InvokeAsync(HttpContext context)
    {
        // OnStarting also covers responses written by the exception handler after it cleared the headers
        context.Response.OnStarting(() =>
        {
            AddHeaders(context);
            return Task.CompletedTask;
        });
        return next(context);
    }

    private static void AddHeaders(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers["Referrer-Policy"] = "no-referrer";
        headers.XFrameOptions = "DENY";
        if (context.Request.IsHttps)
        {
            headers.StrictTransportSecurity = "max-age=31536000";
        }

        if (!context.Request.Path.StartsWithSegments("/api"))
        {
            // Required by expo-sqlite on web (SharedArrayBuffer / OPFS)
            headers["Cross-Origin-Opener-Policy"] = "same-origin";
            headers["Cross-Origin-Embedder-Policy"] = "require-corp";
            headers["Cross-Origin-Resource-Policy"] = "same-origin";
            headers.ContentSecurityPolicy = ContentSecurityPolicy;
        }
    }
}
