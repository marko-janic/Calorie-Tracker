namespace Kcal.Server.Models;

public class PairingCode
{
    public Guid Id { get; set; }
    public byte[] CodeHash { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public string CreatedBy { get; set; } = null!; // "cli", "startup", or device id
}
