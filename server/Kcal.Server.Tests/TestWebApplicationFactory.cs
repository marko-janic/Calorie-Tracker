using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Kcal.Server.Converters;
using Kcal.Server.Models;
using Kcal.Server.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Kcal.Server.Tests;

/// <summary>
/// The server with a temporary data directory and web root, a controllable clock and no
/// background maintenance (tests run it explicitly).
/// </summary>
public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    public static readonly JsonSerializerOptions Json = JsonConfig.CreateOptions();

    private readonly bool _ownsDataDir;

    public TestWebApplicationFactory() : this(CreateTempDir("kcal_test"), ownsDataDir: true)
    {
    }

    /// <summary>A server on an existing data directory, e.g. to simulate a restart.</summary>
    public static TestWebApplicationFactory OnDataDir(string dataDir) => new(dataDir, ownsDataDir: false);

    private TestWebApplicationFactory(string dataDir, bool ownsDataDir)
    {
        DataDir = dataDir;
        _ownsDataDir = ownsDataDir;
        WebRoot = CreateTempDir("kcal_wwwroot");
        File.WriteAllText(Path.Combine(WebRoot, "index.html"), "<!doctype html><title>Kcal</title>");
        Directory.CreateDirectory(Path.Combine(WebRoot, "_expo", "static", "js"));
        File.WriteAllText(Path.Combine(WebRoot, "_expo", "static", "js", "entry-abc123.js"), "console.log('kcal');");
        File.WriteAllBytes(Path.Combine(WebRoot, "wa-sqlite.wasm"), [0x00, 0x61, 0x73, 0x6d]);
    }

    public string DataDir { get; }
    public string WebRoot { get; }

    /// <summary>The server clock. Starts at the current time.</summary>
    public FakeTimeProvider Time { get; } = new(DateTimeOffset.UtcNow);

    /// <summary>Keep the production rate limits. Off by default so tests can make many requests.</summary>
    protected bool UseProductionRateLimits { get; init; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Test");
        builder.UseSetting("Kcal:DataDir", DataDir);
        builder.UseSetting(WebHostDefaults.WebRootKey, WebRoot);
        if (!UseProductionRateLimits)
        {
            builder.UseSetting("Kcal:ApiRequestsPerMinute", "100000");
            builder.UseSetting("Kcal:AuthRequestsPerMinute", "100000");
        }

        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(Time);
            services.Remove(services.Single(d => d.ImplementationType == typeof(MaintenanceService)));
        });
    }

    public async Task<Guid> GetServerIdAsync()
    {
        var health = await CreateClient().GetFromJsonAsync<HealthResponseDTO>("/api/v1/health", Json);
        return health!.ServerId;
    }

    /// <summary>A pairing code as the CLI creates it.</summary>
    public async Task<string> CreatePairingCodeAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var code = await scope.ServiceProvider.GetRequiredService<PairingService>().CreateCodeAsync(PairingService.CreatedByCli);
        return code.Code;
    }

    public async Task<HttpResponseMessage> PairAsync(HttpClient client, TestDevice device, string code, string? signature = null)
    {
        var serverId = await GetServerIdAsync();
        var normalized = PairingService.NormalizeCode(code) ?? code;
        var request = new PairRequestDTO(
            code,
            device.Name,
            device.PublicKey,
            signature ?? device.Sign($"kcal-pair-v1\n{serverId:D}\n{normalized}\n{device.PublicKey}"));
        return await client.PostAsJsonAsync("/api/v1/devices/pair", request, Json);
    }

    /// <summary>Pairs a new device with a fresh code; returns it with its device id set.</summary>
    public async Task<TestDevice> PairNewDeviceAsync(string name = "Test device")
    {
        var device = new TestDevice(name);
        var response = await PairAsync(CreateClient(), device, await CreatePairingCodeAsync());
        response.EnsureSuccessStatusCode();
        device.DeviceId = (await response.Content.ReadFromJsonAsync<PairResponseDTO>(Json))!.DeviceId;
        return device;
    }

    public async Task<ChallengeResponseDTO> CreateChallengeAsync(HttpClient client, Guid deviceId)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/challenge", new ChallengeRequestDTO(deviceId), Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChallengeResponseDTO>(Json))!;
    }

    public async Task<HttpResponseMessage> RequestTokenAsync(HttpClient client, TestDevice device, string nonce, string? signature = null)
    {
        var serverId = await GetServerIdAsync();
        var request = new TokenRequestDTO(
            device.DeviceId,
            nonce,
            signature ?? device.Sign($"kcal-auth-v1\n{serverId:D}\n{device.DeviceId:D}\n{nonce}"));
        return await client.PostAsJsonAsync("/api/v1/auth/token", request, Json);
    }

    /// <summary>Runs challenge → token and returns a client that sends the access token.</summary>
    public async Task<HttpClient> CreateAuthenticatedClientAsync(TestDevice device)
    {
        var client = CreateClient();
        var challenge = await CreateChallengeAsync(client, device.DeviceId);
        var response = await RequestTokenAsync(client, device, challenge.Nonce);
        response.EnsureSuccessStatusCode();
        var token = (await response.Content.ReadFromJsonAsync<TokenResponseDTO>(Json))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        return client;
    }

    /// <summary>Pairs a new device and returns an authenticated client for it.</summary>
    public async Task<HttpClient> CreateDeviceClientAsync(string name = "Test device") =>
        await CreateAuthenticatedClientAsync(await PairNewDeviceAsync(name));

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing)
        {
            return;
        }

        // Clear SQLite connection pools so the database files can be deleted
        SqliteConnection.ClearAllPools();
        DeleteDir(WebRoot);
        if (_ownsDataDir)
        {
            DeleteDir(DataDir);
        }
    }

    public static string CreateTempDir(string prefix)
    {
        var path = Path.Combine(Path.GetTempPath(), $"{prefix}_{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    public static void DeleteDir(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (IOException)
        {
            // Best effort: a file may still be locked on Windows
        }
    }
}

/// <summary>A factory with the production rate limits (7.6).</summary>
public sealed class RateLimitedWebApplicationFactory : TestWebApplicationFactory
{
    public RateLimitedWebApplicationFactory()
    {
        UseProductionRateLimits = true;
    }
}

public static class ProblemAssert
{
    /// <summary>Asserts the status and the machine-readable ProblemDetails code (8.4).</summary>
    public static async Task HasCodeAsync(HttpResponseMessage response, int status, string code)
    {
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
    }
}
