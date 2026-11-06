using System.Net;
using Kcal.Server.Hosting;
using Kcal.Server.Services;
using Xunit;

namespace Kcal.Server.Tests;

public class StaticHostingTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public StaticHostingTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    public async Task IndexHtml_HasWebUiHeadersAndNoCache(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertWebUiHeaders(response);
        Assert.True(response.Headers.CacheControl?.NoCache);
    }

    [Theory]
    [InlineData("/settings/devices")]
    [InlineData("/entry/0193e7a2-5c1e-7b3a-9d4f-2a1b3c4d5e6f")]
    public async Task UnknownPath_FallsBackToIndexHtml(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<title>Kcal</title>", await response.Content.ReadAsStringAsync());
        AssertWebUiHeaders(response);
        Assert.True(response.Headers.CacheControl?.NoCache);
    }

    [Fact]
    public async Task HashedAssets_AreCachedImmutable()
    {
        var response = await _factory.CreateClient().GetAsync("/_expo/static/js/entry-abc123.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("public, max-age=31536000, immutable", response.Headers.CacheControl?.ToString());
        AssertWebUiHeaders(response);
    }

    [Fact]
    public async Task WasmFiles_HaveWasmContentType()
    {
        var response = await _factory.CreateClient().GetAsync("/wa-sqlite.wasm");

        Assert.Equal("application/wasm", response.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("/api/v1/unknown")]
    [InlineData("/api/v2/health")]
    [InlineData("/api")]
    public async Task UnknownApiPath_Returns404ProblemDetails(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        await ProblemAssert.HasCodeAsync(response, 404, ErrorCodes.NotFound);
    }

    [Theory]
    [InlineData("/download/kcal.apk")]
    [InlineData("/download/other.apk")]
    public async Task Download_WithoutApk_Returns404(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task OpenApiDocument_IsServed()
    {
        var response = await _factory.CreateClient().GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("/api/v1/sync/push", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ApiResponses_HaveSecurityHeadersButNoWebUiHeaders()
    {
        var response = await _factory.CreateClient().GetAsync("/api/v1/health");

        AssertSecurityHeaders(response);
        Assert.False(response.Headers.Contains("Cross-Origin-Embedder-Policy"));
        Assert.False(response.Headers.Contains("Content-Security-Policy"));
        Assert.False(response.Headers.Contains("Strict-Transport-Security"));
    }

    [Fact]
    public async Task ForwardedHttpsRequests_GetHsts()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Add("X-Forwarded-Proto", "https");
        request.Headers.Add("X-Forwarded-For", "192.168.1.20");

        var response = await _factory.CreateClient().SendAsync(request);

        Assert.Equal("max-age=31536000", string.Join(",", response.Headers.GetValues("Strict-Transport-Security")));
    }

    private static void AssertWebUiHeaders(HttpResponseMessage response)
    {
        AssertSecurityHeaders(response);
        Assert.Equal("same-origin", Header(response, "Cross-Origin-Opener-Policy"));
        Assert.Equal("require-corp", Header(response, "Cross-Origin-Embedder-Policy"));
        Assert.Equal("same-origin", Header(response, "Cross-Origin-Resource-Policy"));
        Assert.Equal(SecurityHeadersMiddleware.ContentSecurityPolicy, Header(response, "Content-Security-Policy"));
    }

    private static void AssertSecurityHeaders(HttpResponseMessage response)
    {
        Assert.Equal("nosniff", Header(response, "X-Content-Type-Options"));
        Assert.Equal("no-referrer", Header(response, "Referrer-Policy"));
        Assert.Equal("DENY", Header(response, "X-Frame-Options"));
    }

    private static string Header(HttpResponseMessage response, string name) =>
        string.Join(",", response.Headers.GetValues(name));
}
