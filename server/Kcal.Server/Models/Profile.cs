namespace Kcal.Server.Models;

public class Profile
{
    public int Id { get; set; } // Always 1
    public Sex Sex { get; set; }
    public int BirthYear { get; set; }
    public double HeightCm { get; set; }
    public double WeightKg { get; set; }
    public double? BodyFatPercent { get; set; }
    public ActivityLevel ActivityLevel { get; set; }
    public double GoalKgPerWeek { get; set; }
    public double? TargetKcal { get; set; }
    public double? TargetProteinG { get; set; }
    public double? TargetCarbsG { get; set; }
    public double? TargetFatG { get; set; }
    public double? TargetFibreG { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; }
    public Guid UpdatedByDeviceId { get; set; }
    public DateTimeOffset ServerUpdatedAt { get; set; }
}
