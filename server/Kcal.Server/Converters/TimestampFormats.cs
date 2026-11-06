using System.Globalization;

namespace Kcal.Server.Converters;

/// <summary>
/// The single definition of the timestamp formats used on the wire (JSON converters)
/// and in storage (EF value converters), so both always match.
/// </summary>
public static class TimestampFormats
{
    /// <summary>Rule for UTC timestamps (loggedAt, updatedAt, server timestamps).</summary>
    public const string UtcRule = "Expected a UTC timestamp in the format yyyy-MM-ddTHH:mm:ss.fffZ (exactly 3 fraction digits).";

    /// <summary>Rule for local timestamps (eatenAt).</summary>
    public const string LocalRule = "Expected an ISO 8601 local timestamp with an explicit offset (+hh:mm or -hh:mm) or Z and 0-3 fraction digits, e.g. 2026-11-03T12:30:00+01:00.";

    private const string UtcFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";
    private const string LocalFormat = "yyyy-MM-dd'T'HH:mm:ss.fffzzz";

    private static readonly string[] LocalParseFormats =
    [
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.f'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.ff'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
        "yyyy-MM-dd'T'HH:mm:sszzz",
        "yyyy-MM-dd'T'HH:mm:ss.fzzz",
        "yyyy-MM-dd'T'HH:mm:ss.ffzzz",
        "yyyy-MM-dd'T'HH:mm:ss.fffzzz"
    ];

    /// <summary>Formats a timestamp as UTC with milliseconds, e.g. 2026-11-03T11:31:02.120Z.</summary>
    public static string FormatUtc(DateTimeOffset value) =>
        value.UtcDateTime.ToString(UtcFormat, CultureInfo.InvariantCulture);

    public static bool TryParseUtc(string? value, out DateTimeOffset result) =>
        DateTimeOffset.TryParseExact(value, UtcFormat, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out result);

    public static DateTimeOffset ParseUtc(string value) =>
        TryParseUtc(value, out var result) ? result : throw new FormatException(UtcRule);

    /// <summary>Formats a timestamp with its own offset and milliseconds, e.g. 2026-11-03T12:30:00.000+01:00.</summary>
    public static string FormatLocal(DateTimeOffset value) =>
        value.ToString(LocalFormat, CultureInfo.InvariantCulture);

    /// <summary>Parses a local timestamp, keeping its offset. A trailing Z means offset +00:00.</summary>
    public static bool TryParseLocal(string? value, out DateTimeOffset result) =>
        DateTimeOffset.TryParseExact(value, LocalParseFormats, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal, out result);

    public static DateTimeOffset ParseLocal(string value) =>
        TryParseLocal(value, out var result) ? result : throw new FormatException(LocalRule);
}
