namespace Kcal.Server.Services;

/// <summary>Machine-readable error codes returned in the ProblemDetails "code" field (8.4).</summary>
public static class ErrorCodes
{
    public const string ValidationFailed = "validation_failed";
    public const string InvalidPairingCode = "invalid_pairing_code";
    public const string UnknownDevice = "unknown_device";
    public const string InvalidSignature = "invalid_signature";
    public const string ChallengeExpired = "challenge_expired";
    public const string InvalidToken = "invalid_token";
    public const string TokenExpired = "token_expired";
    public const string NotFound = "not_found";
    public const string RateLimited = "rate_limited";
}

/// <summary>
/// An expected API error. Thrown by services and turned into a ProblemDetails response
/// with the given status, title and code.
/// </summary>
public sealed class ApiException(int statusCode, string code, string title) : Exception(title)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;

    // The message deliberately never says whether the code was wrong, expired or used (7.3)
    public static ApiException InvalidPairingCode() =>
        new(StatusCodes.Status401Unauthorized, ErrorCodes.InvalidPairingCode, "Pairing code invalid or expired");

    public static ApiException UnknownDevice() =>
        new(StatusCodes.Status401Unauthorized, ErrorCodes.UnknownDevice, "Unknown device");

    public static ApiException InvalidSignature() =>
        new(StatusCodes.Status401Unauthorized, ErrorCodes.InvalidSignature, "Invalid signature");

    public static ApiException ChallengeExpired() =>
        new(StatusCodes.Status401Unauthorized, ErrorCodes.ChallengeExpired, "Challenge expired or already used");

    public static ApiException InvalidToken() =>
        new(StatusCodes.Status401Unauthorized, ErrorCodes.InvalidToken, "Invalid access token");

    public static ApiException TokenExpired() =>
        new(StatusCodes.Status401Unauthorized, ErrorCodes.TokenExpired, "Access token expired");
}
