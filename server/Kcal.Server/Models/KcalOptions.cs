namespace Kcal.Server.Models;

/// <summary>Options bound from the "Kcal" configuration section (8.2).</summary>
public class KcalOptions
{
    public const string SectionName = "Kcal";

    /// <summary>Absolute path of the directory holding kcal.db and backups/ (resolved at startup).</summary>
    public string DataDir { get; set; } = string.Empty;
    public int BackupRetention { get; set; } = 14;
    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromHours(1);
    public TimeSpan PairingCodeLifetime { get; set; } = TimeSpan.FromMinutes(10);
    public TimeSpan ChallengeLifetime { get; set; } = TimeSpan.FromMinutes(2);

    /// <summary>Requests per minute on /api/* per device (or per IP when unauthenticated).</summary>
    public int ApiRequestsPerMinute { get; set; } = 100;

    /// <summary>Requests per minute per IP on /api/v1/auth/* and /api/v1/devices/pair.</summary>
    public int AuthRequestsPerMinute { get; set; } = 10;
}
