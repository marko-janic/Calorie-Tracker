namespace Kcal.Server.Models;

public class Entry
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public double Kcal { get; set; }
    public double? ProteinG { get; set; }
    public double? CarbsG { get; set; }
    public double? FatG { get; set; }
    public double? FibreG { get; set; }
    public double Quantity { get; set; }
    public MealType? MealType { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset EatenAt { get; set; }
    public DateOnly EatenLocalDate { get; set; }
    public DateTimeOffset LoggedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public bool Deleted { get; set; }
    public long Version { get; set; }
    public Guid UpdatedByDeviceId { get; set; }
    public DateTimeOffset ServerUpdatedAt { get; set; }
}
