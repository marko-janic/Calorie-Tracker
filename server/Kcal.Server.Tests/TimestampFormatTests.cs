using System.Text.Json;
using Kcal.Server.Converters;
using Kcal.Server.Models;
using Xunit;

namespace Kcal.Server.Tests;

public class TimestampFormatTests
{
    // Use the same JSON configuration as Program.cs to ensure tests match production behavior
    private static readonly JsonSerializerOptions JsonOptions = JsonConfig.CreateOptions();

    [Fact]
    public void EntryDTO_Serializes_UtcTimestamps_WithZSuffixAndMilliseconds()
    {
        // Arrange
        var entry = new EntryDTO(
            Id: Guid.NewGuid(),
            Version: 1,
            Deleted: false,
            UpdatedAt: new DateTimeOffset(2026, 11, 3, 11, 31, 2, 120, TimeSpan.Zero),
            Name: "Test Entry",
            Kcal: 100,
            ProteinG: 10,
            CarbsG: 20,
            FatG: 5,
            FibreG: 3,
            Quantity: 1,
            MealType: MealType.Lunch,
            Notes: null,
            EatenAt: new DateTimeOffset(2026, 11, 3, 12, 30, 0, 0, TimeSpan.FromHours(1)),
            LoggedAt: new DateTimeOffset(2026, 11, 3, 11, 30, 55, 4, TimeSpan.Zero)
        );

        // Act
        var json = JsonSerializer.Serialize(entry, JsonOptions);
        var parsed = JsonSerializer.Deserialize<Dictionary<string, object>>(json);

        // Assert
        Assert.NotNull(parsed);

        // UpdatedAt and LoggedAt should be UTC with Z suffix and 3 decimal places
        var updatedAtElement = (JsonElement)parsed["updatedAt"];
        var updatedAtStr = updatedAtElement.GetString();
        Assert.Equal("2026-11-03T11:31:02.120Z", updatedAtStr);

        var loggedAtElement = (JsonElement)parsed["loggedAt"];
        var loggedAtStr = loggedAtElement.GetString();
        Assert.Equal("2026-11-03T11:30:55.004Z", loggedAtStr);

        // EatenAt should preserve the offset and include milliseconds
        var eatenAtElement = (JsonElement)parsed["eatenAt"];
        var eatenAtStr = eatenAtElement.GetString();
        Assert.Equal("2026-11-03T12:30:00.000+01:00", eatenAtStr);

        // MealType should be serialized as camelCase string (from JsonStringEnumConverter)
        var mealTypeElement = (JsonElement)parsed["mealType"];
        var mealTypeStr = mealTypeElement.GetString();
        Assert.Equal("lunch", mealTypeStr);
    }

    [Fact]
    public void ProfileDTO_Serializes_UpdatedAt_WithZSuffixAndMilliseconds()
    {
        // Arrange
        var profile = new ProfileDTO(
            Version: 1,
            UpdatedAt: new DateTimeOffset(2026, 11, 3, 14, 22, 10, 567, TimeSpan.Zero),
            Sex: Sex.Male,
            BirthYear: 1990,
            HeightCm: 180,
            WeightKg: 80,
            BodyFatPercent: 15,
            ActivityLevel: ActivityLevel.Moderate,
            GoalKgPerWeek: -0.5,
            Targets: new TargetsDTO(2000, 150, 250, 65, 30)
        );

        // Act
        var json = JsonSerializer.Serialize(profile, JsonOptions);
        var parsed = JsonSerializer.Deserialize<Dictionary<string, object>>(json);

        // Assert
        Assert.NotNull(parsed);

        var updatedAtElement = (JsonElement)parsed["updatedAt"];
        var updatedAtStr = updatedAtElement.GetString();
        Assert.Equal("2026-11-03T14:22:10.567Z", updatedAtStr);
    }

    [Fact]
    public void UtcDateTimeOffsetJsonConverter_Deserializes_ValidUtcTimestamp()
    {
        // Arrange
        var json = """{"timestamp": "2026-11-03T11:31:02.120Z"}""";

        // Act
        var result = JsonSerializer.Deserialize<TimestampHolder>(json, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(new DateTimeOffset(2026, 11, 3, 11, 31, 2, 120, TimeSpan.Zero), result.Timestamp);
    }

    [Theory]
    [InlineData("""{"timestamp": "2026-11-03T11:31:02.120+01:00"}""")]  // UTC timestamp must have Z suffix
    [InlineData("""{"timestamp": "2026-11-03T11:31:02Z"}""")]  // UTC timestamp requires exactly 3 fractional digits
    [InlineData("""{"timestamp": "2026-11-03T11:31:02"}""")]  // UTC timestamp requires Z suffix
    [InlineData("""{"timestamp": "2026-11-03T11:31:02.12Z"}""")]  // Only 2 fractional digits
    [InlineData("""{"timestamp": "2026-11-03T11:31:02.1234Z"}""")]  // More than 3 fractional digits
    [InlineData("""{"timestamp": "11/03/2026"}""")]  // Non-ISO format
    [InlineData("""{"timestamp": ""}""")]  // Empty string
    [InlineData("""{"timestamp": 123456}""")]  // Number instead of string
    public void UtcDateTimeOffsetJsonConverter_Rejects_InvalidFormats(string json)
    {
        // Act & Assert
        var exception = Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<TimestampHolder>(json, JsonOptions));

        // The error message should indicate the problem
        Assert.NotEmpty(exception.Message);
    }

    [Fact]
    public void LocalDateTimeOffsetJsonConverter_Deserializes_ValidLocalTimestamp()
    {
        // Arrange
        var json = """{"eatenAt": "2026-11-03T12:30:00.000+01:00"}""";
        var options = JsonConfig.CreateOptions();

        // Act
        var result = JsonSerializer.Deserialize<LocalTimestampHolder>(json, options);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(new DateTimeOffset(2026, 11, 3, 12, 30, 0, 0, TimeSpan.FromHours(1)), result.EatenAt);
    }

    [Fact]
    public void LocalDateTimeOffsetJsonConverter_Deserializes_ZAsUtcOffset()
    {
        // Arrange - Z should now be accepted as a valid offset
        var json = """{"eatenAt": "2026-11-03T12:30:00.000Z"}""";
        var options = JsonConfig.CreateOptions();

        // Act
        var result = JsonSerializer.Deserialize<LocalTimestampHolder>(json, options);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(new DateTimeOffset(2026, 11, 3, 12, 30, 0, 0, TimeSpan.Zero), result.EatenAt);
    }

    [Theory]
    [InlineData("""{"eatenAt": "2026-11-03T12:30:00"}""")]  // Missing offset
    [InlineData("""{"eatenAt": "2026-11-03T12:30:00.1234567+01:00"}""")]  // More than 3 fractional digits
    [InlineData("""{"eatenAt": "11/03/2026 12:30"}""")]  // Non-ISO format
    [InlineData("""{"eatenAt": ""}""")]  // Empty string
    [InlineData("""{"eatenAt": 123456}""")]  // Number instead of string
    public void LocalDateTimeOffsetJsonConverter_Rejects_InvalidFormats(string json)
    {
        // Arrange
        var options = JsonConfig.CreateOptions();

        // Act & Assert
        var exception = Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<LocalTimestampHolder>(json, options));

        // The error message should indicate the problem
        Assert.NotEmpty(exception.Message);
    }

    [Fact]
    public void EntryChangeDTO_WithEatenAt_Deserializes_WithExplicitOffset()
    {
        // Arrange
        var json = """
        {
            "id": "0193e7a2-5c1e-7b3a-9d4f-2a1b3c4d5e6f",
            "updatedAt": "2026-11-03T11:31:02.120Z",
            "name": "Test Entry",
            "kcal": 100,
            "eatenAt": "2026-11-03T12:30:00.000+01:00",
            "loggedAt": "2026-11-03T11:30:55.004Z"
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<EntryChangeDTO>(json, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(new DateTimeOffset(2026, 11, 3, 12, 30, 0, 0, TimeSpan.FromHours(1)), result.EatenAt);
    }

    private record TimestampHolder(DateTimeOffset Timestamp);

    private record LocalTimestampHolder(
        [property: System.Text.Json.Serialization.JsonConverter(typeof(LocalDateTimeOffsetJsonConverter))]
        DateTimeOffset EatenAt
    );
}
