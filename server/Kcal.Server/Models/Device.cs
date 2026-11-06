namespace Kcal.Server.Models;

public class Device
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public byte[] PublicKeySpki { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
}
