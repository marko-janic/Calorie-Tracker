using System.Net.Http.Json;
using Kcal.Server.Models;
using Xunit;

namespace Kcal.Server.Tests;

public class HealthEndpointTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public HealthEndpointTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Health_ReportsServerIdAndVersions()
    {
        var health = await _factory.CreateClient()
            .GetFromJsonAsync<HealthResponseDTO>("/api/v1/health", TestWebApplicationFactory.Json);

        Assert.NotNull(health);
        Assert.Equal("ok", health.Status);
        Assert.NotEqual(Guid.Empty, health.ServerId);
        Assert.Equal(ReadVersionFile(), health.ServerVersion);
        Assert.Equal(1, health.ApiVersion);
        Assert.Equal(ServerInfo.MinAppVersion, health.MinAppVersion);
    }

    [Fact]
    public async Task Health_ServerIdStaysStableAcrossRestarts()
    {
        var dataDir = TestWebApplicationFactory.CreateTempDir("kcal_restart");
        try
        {
            Guid first;
            using (var server = TestWebApplicationFactory.OnDataDir(dataDir))
            {
                first = await server.GetServerIdAsync();
            }

            using var restarted = TestWebApplicationFactory.OnDataDir(dataDir);
            Assert.Equal(first, await restarted.GetServerIdAsync());
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            TestWebApplicationFactory.DeleteDir(dataDir);
        }
    }

    private static string ReadVersionFile()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "VERSION")))
        {
            dir = dir.Parent;
        }
        Assert.NotNull(dir);
        return File.ReadAllText(Path.Combine(dir.FullName, "VERSION")).Trim();
    }
}
