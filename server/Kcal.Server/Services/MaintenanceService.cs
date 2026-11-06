using System.Globalization;
using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kcal.Server.Services;

/// <summary>Daily backups and cleanup of expired credentials, at startup and then every hour (8.6).</summary>
public sealed class MaintenanceService(
    IServiceScopeFactory scopeFactory,
    IOptions<KcalOptions> options,
    TimeProvider time,
    ILogger<MaintenanceService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private const string BackupPrefix = "kcal-";
    private const string BackupExtension = ".db";

    private string BackupDir => Path.Combine(options.Value.DataDir, "backups");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, time);
        do
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(exception, "Maintenance run failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task RunOnceAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await BackupAsync(db, cancellationToken);
        await CleanupAsync(db, cancellationToken);
    }

    /// <summary>Creates today's (UTC) snapshot if it is missing and keeps the newest BackupRetention snapshots.</summary>
    private async Task BackupAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        var path = Path.Combine(BackupDir, $"{BackupPrefix}{today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}{BackupExtension}");
        if (File.Exists(path))
        {
            return;
        }

        Directory.CreateDirectory(BackupDir);
        // The path is generated here, never user input, and is passed as a parameter
        await db.Database.ExecuteSqlAsync($"VACUUM INTO {path}", cancellationToken);
        logger.LogInformation("Created backup {BackupFile}", Path.GetFileName(path));

        // The date format sorts chronologically by name
        var expired = Directory.GetFiles(BackupDir, $"{BackupPrefix}*{BackupExtension}")
            .OrderDescending(StringComparer.Ordinal)
            .Skip(options.Value.BackupRetention);
        foreach (var file in expired)
        {
            File.Delete(file);
            logger.LogInformation("Deleted old backup {BackupFile}", Path.GetFileName(file));
        }
    }

    private async Task CleanupAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var tokens = await db.AccessTokens
            .Where(t => t.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);
        var codes = await db.PairingCodes
            .Where(c => c.UsedAt != null || c.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);
        logger.LogInformation("Removed {TokenCount} expired access tokens and {CodeCount} expired or used pairing codes", tokens, codes);
    }
}
