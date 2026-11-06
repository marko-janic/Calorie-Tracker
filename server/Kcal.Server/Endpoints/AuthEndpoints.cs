using Kcal.Server.Hosting;
using Kcal.Server.Models;
using Kcal.Server.Services;

namespace Kcal.Server.Endpoints;

/// <summary>Challenge-response authentication (7.4).</summary>
public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder group)
    {
        var auth = group.MapGroup("/auth").RequireRateLimiting(RateLimiting.AuthPolicy);

        auth.MapPost("/challenge", async (ChallengeRequestDTO request, AuthService authService, CancellationToken cancellationToken) =>
            TypedResults.Ok(await authService.CreateChallengeAsync(request.DeviceId, cancellationToken)));

        auth.MapPost("/token", async (TokenRequestDTO request, AuthService authService, CancellationToken cancellationToken) =>
            TypedResults.Ok(await authService.IssueTokenAsync(request, cancellationToken)));

        return group;
    }
}
