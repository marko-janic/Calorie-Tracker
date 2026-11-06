namespace Kcal.Server.Models;

public class ServerState
{
    public int Id { get; set; } // Always 1
    public Guid ServerId { get; set; }
    public long LastSeq { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
