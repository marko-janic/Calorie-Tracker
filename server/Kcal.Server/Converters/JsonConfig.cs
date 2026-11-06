using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kcal.Server.Converters;

/// <summary>
/// JSON serialization configuration of the HTTP API (applied in Program.cs via ConfigureHttpJsonOptions).
/// </summary>
public static class JsonConfig
{
    public static void ConfigureOptions(JsonSerializerOptions options)
    {
        // UTC timestamps are written as yyyy-MM-ddTHH:mm:ss.fffZ;
        // eatenAt fields use [JsonConverter(typeof(LocalDateTimeOffsetJsonConverter))] instead.
        options.Converters.Add(new UtcDateTimeOffsetJsonConverter());
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
        // Constructor parameters without a default value must be present in the JSON
        options.RespectRequiredConstructorParameters = true;
    }

    /// <summary>New options with the API configuration, for code that serializes outside the HTTP pipeline.</summary>
    public static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ConfigureOptions(options);
        return options;
    }
}
