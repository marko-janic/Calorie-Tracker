namespace Kcal.Server.Models;

public class AccessToken
{
    public Guid Id { get; set; }
    public byte[] TokenHash { get; set; } = null!;
    public Guid DeviceId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
