using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Kcal.Server.Data;
using Kcal.Server.Migrations;
using Kcal.Server.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
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

    [Fact]
    public async Task Migration_AddPortionSize_KeepsExistingEntries()
    {
        var dir = TestWebApplicationFactory.CreateTempDir("kcal_migration");
        try
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite($"Data Source={Path.Combine(dir, "kcal.db")}")
                .Options;
            var id = Guid.CreateVersion7();
            var deviceId = Guid.CreateVersion7();

            // A database as the first release left it, with an entry that has no portion columns
            await using (var oldDb = new AppDbContext(options))
            {
                var initialCreate = typeof(InitialCreate).GetCustomAttribute<MigrationAttribute>()!.Id;
                await oldDb.GetService<IMigrator>().MigrateAsync(initialCreate);
                await oldDb.Database.ExecuteSqlAsync($"""
                    INSERT INTO Entries (
                        Id, Name, Kcal, ProteinG, CarbsG, FatG, FibreG, Quantity, MealType, Notes,
                        EatenAt, EatenLocalDate, LoggedAt, UpdatedAt, Deleted, Version, UpdatedByDeviceId, ServerUpdatedAt)
                    VALUES (
                        {id}, 'Oats (80 g)', 300, 10.5, 48, 5.6, 8, 2, 'breakfast', 'with milk',
                        '2026-11-03T07:30:00.000+01:00', '2026-11-03', '2026-11-03T06:31:00.000Z', '2026-11-03T06:32:00.000Z',
                        0, 5, {deviceId}, '2026-11-03T06:32:01.000Z')
                    """);
            }

            // The new release starts on that database
            await using (var upgradedDb = new AppDbContext(options))
            {
                Assert.Contains(await upgradedDb.Database.GetPendingMigrationsAsync(), m => m.EndsWith("_AddPortionSize"));
                await upgradedDb.Database.MigrateAsync();
            }

            await using var db = new AppDbContext(options);
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            var entry = await db.Entries.AsNoTracking().SingleAsync(e => e.Id == id);
            Assert.Equal("Oats (80 g)", entry.Name);
            Assert.Equal(300, entry.Kcal);
            Assert.Equal(10.5, entry.ProteinG);
            Assert.Equal(48, entry.CarbsG);
            Assert.Equal(5.6, entry.FatG);
            Assert.Equal(8, entry.FibreG);
            Assert.Equal(2, entry.Quantity);
            Assert.Equal(MealType.Breakfast, entry.MealType);
            Assert.Equal("with milk", entry.Notes);
            Assert.Equal(new DateTimeOffset(2026, 11, 3, 7, 30, 0, TimeSpan.FromHours(1)), entry.EatenAt);
            Assert.Equal(TimeSpan.FromHours(1), entry.EatenAt.Offset);
            Assert.Equal(new DateOnly(2026, 11, 3), entry.EatenLocalDate);
            Assert.Equal(new DateTimeOffset(2026, 11, 3, 6, 31, 0, TimeSpan.Zero), entry.LoggedAt);
            Assert.Equal(new DateTimeOffset(2026, 11, 3, 6, 32, 0, TimeSpan.Zero), entry.UpdatedAt);
            Assert.False(entry.Deleted);
            Assert.Equal(5, entry.Version);
            Assert.Equal(deviceId, entry.UpdatedByDeviceId);
            Assert.Equal(new DateTimeOffset(2026, 11, 3, 6, 32, 1, TimeSpan.Zero), entry.ServerUpdatedAt);
            Assert.Null(entry.PortionSize);
            Assert.Null(entry.PortionUnit);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            TestWebApplicationFactory.DeleteDir(dir);
        }
    }
}
