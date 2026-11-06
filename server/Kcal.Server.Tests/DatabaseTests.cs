using Microsoft.Extensions.DependencyInjection;
using Kcal.Server.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Kcal.Server.Tests;

public class DatabaseTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public DatabaseTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Database_MigrationsAreApplied()
    {
        // Arrange
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Act & Assert
        var pendingMigrations = await db.Database.GetPendingMigrationsAsync();
        Assert.Empty(pendingMigrations);
    }

    [Fact]
    public async Task Database_ServerStateExists()
    {
        // Arrange
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Act
        var serverState = await db.ServerState.FindAsync(1);

        // Assert
        Assert.NotNull(serverState);
        Assert.NotEqual(Guid.Empty, serverState.ServerId);
        Assert.Equal(0, serverState.LastSeq);
    }

    [Fact]
    public async Task Database_HasNoPendingModelChanges()
    {
        // Arrange
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Act
        var hasPendingChanges = db.Database.HasPendingModelChanges();

        // Assert
        Assert.False(hasPendingChanges, "Database model has pending changes. Run 'dotnet ef migrations add' to update the migration.");
    }
}
