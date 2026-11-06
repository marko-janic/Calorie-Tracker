using Kcal.Server.Data;
using Kcal.Server.Models;
using Kcal.Server.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kcal.Server.Tests;

public class MaintenanceTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public MaintenanceTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private string BackupDir => Path.Combine(_factory.DataDir, "backups");

    [Fact]
    public async Task Backup_IsCreatedOncePerDay()
    {
        var maintenance = CreateService();
        var today = Path.Combine(BackupDir, $"kcal-{_factory.Time.GetUtcNow():yyyy-MM-dd}.db");

        await maintenance.RunOnceAsync();
        var created = File.GetLastWriteTimeUtc(today);
        await maintenance.RunOnceAsync();

        Assert.True(File.Exists(today));
        Assert.Equal(created, File.GetLastWriteTimeUtc(today));
        Assert.True(new FileInfo(today).Length > 0);
    }

    [Fact]
    public async Task Backup_KeepsNewest14Snapshots()
    {
        Directory.CreateDirectory(BackupDir);
        var oldest = DateOnly.FromDateTime(_factory.Time.GetUtcNow().UtcDateTime).AddDays(-30);
        for (var day = 0; day < 20; day++)
        {
            await File.WriteAllTextAsync(Path.Combine(BackupDir, $"kcal-{oldest.AddDays(day):yyyy-MM-dd}.db"), "old");
        }
        _factory.Time.Advance(TimeSpan.FromDays(1)); // today's snapshot does not exist yet

        await CreateService().RunOnceAsync();

        var snapshots = Directory.GetFiles(BackupDir, "kcal-*.db").Select(Path.GetFileName).Order().ToList();
        Assert.Equal(14, snapshots.Count);
        Assert.Equal($"kcal-{_factory.Time.GetUtcNow():yyyy-MM-dd}.db", snapshots[^1]);
        Assert.DoesNotContain($"kcal-{oldest:yyyy-MM-dd}.db", snapshots);
    }

    [Fact]
    public async Task Cleanup_RemovesExpiredTokensAndExpiredOrUsedCodes()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = _factory.Time.GetUtcNow();
        var expiredToken = Token(now.AddMinutes(-1));
        var validToken = Token(now.AddMinutes(30));
        var expiredCode = Code(now.AddMinutes(-1), usedAt: null);
        var usedCode = Code(now.AddMinutes(5), usedAt: now.AddMinutes(-2));
        var validCode = Code(now.AddMinutes(5), usedAt: null);
        db.AccessTokens.AddRange(expiredToken, validToken);
        db.PairingCodes.AddRange(expiredCode, usedCode, validCode);
        await db.SaveChangesAsync();

        await CreateService().RunOnceAsync();

        var tokenIds = await db.AccessTokens.AsNoTracking().Select(t => t.Id).ToListAsync();
        var codeIds = await db.PairingCodes.AsNoTracking().Select(c => c.Id).ToListAsync();
        Assert.DoesNotContain(expiredToken.Id, tokenIds);
        Assert.Contains(validToken.Id, tokenIds);
        Assert.DoesNotContain(expiredCode.Id, codeIds);
        Assert.DoesNotContain(usedCode.Id, codeIds);
        Assert.Contains(validCode.Id, codeIds);
    }

    private MaintenanceService CreateService() => ActivatorUtilities.CreateInstance<MaintenanceService>(_factory.Services);

    private AccessToken Token(DateTimeOffset expiresAt) => new()
    {
        Id = Guid.NewGuid(),
        TokenHash = Guid.NewGuid().ToByteArray(),
        DeviceId = Guid.NewGuid(),
        CreatedAt = _factory.Time.GetUtcNow(),
        ExpiresAt = expiresAt
    };

    private PairingCode Code(DateTimeOffset expiresAt, DateTimeOffset? usedAt) => new()
    {
        Id = Guid.NewGuid(),
        CodeHash = Guid.NewGuid().ToByteArray(),
        CreatedAt = _factory.Time.GetUtcNow(),
        ExpiresAt = expiresAt,
        UsedAt = usedAt,
        CreatedBy = PairingService.CreatedByCli
    };
}
