using Kcal.Server.Converters;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Kcal.Server.Models;

// Enums
public enum MealType
{
    Breakfast,
    Lunch,
    Dinner,
    Snack
}

public enum Sex
{
    Male,
    Female
}

public enum ActivityLevel
{
    Sedentary,
    Light,
    Moderate,
    Active,
    VeryActive
}

public enum PushStatus
{
    Applied,
    Rejected
}

public enum ConflictReason
{
    DeleteConflict,
    OlderEdit
}

// Health endpoint
public record HealthResponseDTO(
    string Status,
    Guid ServerId,
    string ServerVersion,
    int ApiVersion,
    string MinAppVersion
);

// Pairing
public record PairRequestDTO(
    // Users may type the code with or without the dash and with spaces; it is normalized (7.3)
    [Required][StringLength(32)] string Code,
    [Required][StringLength(100)] string DeviceName,
    [Required][StringLength(128)] string PublicKey,
    [Required][StringLength(96)] string Signature
);

public record PairResponseDTO(
    Guid DeviceId,
    Guid ServerId
);

// Authentication
public record ChallengeRequestDTO(
    [Required] Guid DeviceId
);

public record ChallengeResponseDTO(
    string Nonce,
    DateTimeOffset ExpiresAt
);

public record TokenRequestDTO(
    [Required] Guid DeviceId,
    [Required][StringLength(64)] string Nonce,
    [Required][StringLength(96)] string Signature
);

public record TokenResponseDTO(
    string AccessToken,
    DateTimeOffset ExpiresAt
);

// Devices
public record DeviceListItemDTO(
    Guid Id,
    string Name,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastSeenAt,
    bool IsCurrent
);

public record CreatePairingCodeResponseDTO(
    string Code,
    DateTimeOffset ExpiresAt
);

// Sync - Entry change
public record EntryChangeDTO(
    [Required] Guid Id,
    [Required] DateTimeOffset UpdatedAt,
    [Required][StringLength(200, MinimumLength = 1)] string Name,
    [Required][Range(0.0, 10000.0)] double Kcal,
    [Required][property: JsonConverter(typeof(LocalDateTimeOffsetJsonConverter))] DateTimeOffset EatenAt,
    [Required] DateTimeOffset LoggedAt,
    long? BaseVersion = null,
    bool Deleted = false,
    [Range(0.0, 2000.0)] double? ProteinG = null,
    [Range(0.0, 2000.0)] double? CarbsG = null,
    [Range(0.0, 2000.0)] double? FatG = null,
    [Range(0.0, 2000.0)] double? FibreG = null,
    [Range(0.01, 100.0)] double Quantity = 1,
    [EnumDataType(typeof(MealType))] MealType? MealType = null,
    [StringLength(1000)] string? Notes = null
) : IValidatableObject
{
    // Timestamp windows (7.6)
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var now = TimestampRules.UtcNow(validationContext);
        return new[]
        {
            TimestampRules.Check(nameof(EatenAt), EatenAt, latest: now.AddDays(2)),
            TimestampRules.Check(nameof(LoggedAt), LoggedAt, latest: now.AddDays(1)),
            TimestampRules.Check(nameof(UpdatedAt), UpdatedAt, latest: now.AddDays(1))
        }.OfType<ValidationResult>();
    }
}

// Sync - Profile change
public record ProfileChangeDTO(
    [Required] DateTimeOffset UpdatedAt,
    [Required][EnumDataType(typeof(Sex))] Sex Sex,
    [Required][Range(1900, 2100)] int BirthYear,
    [Required][Range(100.0, 250.0)] double HeightCm,
    [Required][Range(30.0, 300.0)] double WeightKg,
    [Required][EnumDataType(typeof(ActivityLevel))] ActivityLevel ActivityLevel,
    [Required][AllowedGoalKgPerWeek] double GoalKgPerWeek,
    long? BaseVersion = null,
    [Range(3.0, 60.0)] double? BodyFatPercent = null,
    TargetsDTO? Targets = null
) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var now = TimestampRules.UtcNow(validationContext);
        if (BirthYear > now.Year)
        {
            yield return new ValidationResult(
                $"BirthYear cannot be in the future (current year: {now.Year}).",
                [nameof(BirthYear)]
            );
        }

        if (TimestampRules.Check(nameof(UpdatedAt), UpdatedAt, latest: now.AddDays(1)) is { } updatedAtError)
        {
            yield return updatedAtError;
        }
    }
}

public record TargetsDTO(
    [Required][Range(0.0, 10000.0)] double Kcal,
    [Required][Range(0.0, 2000.0)] double ProteinG,
    [Required][Range(0.0, 2000.0)] double CarbsG,
    [Required][Range(0.0, 2000.0)] double FatG,
    [Required][Range(0.0, 2000.0)] double FibreG
);

// Push request and response
public record PushRequestDTO(
    [Required][MaxLength(500)] List<EntryChangeDTO> Entries,
    ProfileChangeDTO? Profile = null
);

/// <summary>Result of one entry change. Reason and Current are set only when rejected.</summary>
public record EntryPushResultDTO(
    Guid Id,
    PushStatus Status,
    long? Version,
    ConflictReason? Reason = null,
    EntryDTO? Current = null
);

/// <summary>Result of the profile change. Reason and Current are set only when rejected.</summary>
public record ProfilePushResultDTO(
    PushStatus Status,
    long Version,
    ConflictReason? Reason = null,
    ProfileDTO? Current = null
);

public record PushResponseDTO(
    List<EntryPushResultDTO> Entries,
    ProfilePushResultDTO? Profile
);

// Pull response
public record EntryDTO(
    Guid Id,
    long Version,
    bool Deleted,
    DateTimeOffset UpdatedAt,
    string Name,
    double Kcal,
    double? ProteinG,
    double? CarbsG,
    double? FatG,
    double? FibreG,
    double Quantity,
    MealType? MealType,
    string? Notes,
    [property: JsonConverter(typeof(LocalDateTimeOffsetJsonConverter))] DateTimeOffset EatenAt,
    DateTimeOffset LoggedAt
);

public record ProfileDTO(
    long Version,
    DateTimeOffset UpdatedAt,
    Sex Sex,
    int BirthYear,
    double HeightCm,
    double WeightKg,
    double? BodyFatPercent,
    ActivityLevel ActivityLevel,
    double GoalKgPerWeek,
    TargetsDTO? Targets
);

public record PullResponseDTO(
    List<EntryDTO> Entries,
    ProfileDTO? Profile,
    long NextCursor,
    bool HasMore
);

// Custom validation attribute for GoalKgPerWeek
public class AllowedGoalKgPerWeekAttribute : ValidationAttribute
{
    private static readonly double[] AllowedValues = { -0.5, -0.25, 0, 0.25 };

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is double doubleValue)
        {
            if (AllowedValues.Contains(doubleValue))
            {
                return ValidationResult.Success;
            }
        }

        return new ValidationResult($"GoalKgPerWeek must be one of: {string.Join(", ", AllowedValues)}");
    }
}

/// <summary>Timestamp windows shared by the change DTOs (7.6).</summary>
internal static class TimestampRules
{
    private static readonly DateTimeOffset Earliest = new(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>The server clock, taken from the request services so tests can substitute it.</summary>
    public static DateTimeOffset UtcNow(ValidationContext context) =>
        ((TimeProvider?)context.GetService(typeof(TimeProvider)) ?? TimeProvider.System).GetUtcNow();

    public static ValidationResult? Check(string member, DateTimeOffset value, DateTimeOffset latest) =>
        value < Earliest || value > latest
            ? new ValidationResult(
                $"{member} must lie between 2000-01-01 and {TimestampFormats.FormatUtc(latest)}.",
                [member])
            : null;
}
