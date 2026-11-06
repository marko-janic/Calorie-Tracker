using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kcal.Server.Converters;

/// <summary>
/// JSON converter for UTC timestamps (loggedAt, updatedAt, ...): yyyy-MM-ddTHH:mm:ss.fffZ.
/// Registered globally in <see cref="JsonConfig"/>.
/// </summary>
public class UtcDateTimeOffsetJsonConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.String && TimestampFormats.TryParseUtc(reader.GetString(), out var result)
            ? result
            : throw new JsonException(TimestampFormats.UtcRule);

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(TimestampFormats.FormatUtc(value));
}
