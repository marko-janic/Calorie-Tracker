using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kcal.Server.Converters;

/// <summary>
/// JSON converter for local timestamps (eatenAt) that preserves the UTC offset.
/// Applied per property with [JsonConverter].
/// </summary>
public class LocalDateTimeOffsetJsonConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.String && TimestampFormats.TryParseLocal(reader.GetString(), out var result)
            ? result
            : throw new JsonException(TimestampFormats.LocalRule);

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(TimestampFormats.FormatLocal(value));
}
