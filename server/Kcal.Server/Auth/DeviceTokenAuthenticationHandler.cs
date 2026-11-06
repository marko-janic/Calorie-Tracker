using System.Security.Claims;
using System.Text.Encodings.Web;
using Kcal.Server.Data;
using Kcal.Server.Hosting;
using Kcal.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kcal.Server.Auth;

/// <summary>
/// Authenticates "Authorization: Bearer &lt;token&gt;" against the stored SHA-256 token hashes (8.4).
/// Failures are answered with a 401 ProblemDetails (invalid_token or token_expired).
/// </summary>
public sealed class DeviceTokenAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db,
    TimeProvider time)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "DeviceToken";
    public const string DeviceIdClaim = "deviceId";

    private const string BearerPrefix = "Bearer ";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var authorization = Request.Headers.Authorization.ToString();
        if (!authorization.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return AuthenticateResult.NoResult();
        }

        var tokenHash = DeviceCrypto.Sha256(authorization[BearerPrefix.Length..].Trim());
        var token = await db.AccessTokens.AsNoTracking()
            .SingleOrDefaultAsync(t => t.TokenHash == tokenHash, Context.RequestAborted);
        if (token is null)
        {
            return AuthenticateResult.Fail(ApiException.InvalidToken());
        }
        if (token.ExpiresAt <= time.GetUtcNow())
        {
            return AuthenticateResult.Fail(ApiException.TokenExpired());
        }

        var identity = new ClaimsIdentity([new Claim(DeviceIdClaim, token.DeviceId.ToString())], SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        var result = await HandleAuthenticateOnceSafeAsync();
        var error = result.Failure as ApiException ?? ApiException.InvalidToken();
        Response.Headers.WWWAuthenticate = "Bearer";
        await ApiProblemDetails.WriteAsync(Context, error);
    }
}

public static class DeviceTokenAuthenticationExtensions
{
    public static IServiceCollection AddDeviceTokenAuthentication(this IServiceCollection services)
    {
        services.AddAuthentication(DeviceTokenAuthenticationHandler.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, DeviceTokenAuthenticationHandler>(
                DeviceTokenAuthenticationHandler.SchemeName, configureOptions: null);
        return services;
    }

    /// <summary>The id of the authenticated device (endpoints that call RequireAuthorization only).</summary>
    public static Guid GetDeviceId(this ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(DeviceTokenAuthenticationHandler.DeviceIdClaim)
            ?? throw new InvalidOperationException("The request is not authenticated with a device token."));
}
