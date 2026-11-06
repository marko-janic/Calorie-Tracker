using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Kcal.Server.Auth;
using Kcal.Server.Models;
using Kcal.Server.Services;

namespace Kcal.Server.Endpoints;

/// <summary>Push (6.2, 6.3) and pull (6.4).</summary>
public static class SyncEndpoints
{
    public const int MaxPullLimit = 500;

    public static RouteGroupBuilder MapSyncEndpoints(this RouteGroupBuilder group)
    {
        var sync = group.MapGroup("/sync").RequireAuthorization();

        sync.MapPost("/push", async (PushRequestDTO request, ClaimsPrincipal user, SyncService syncService, CancellationToken cancellationToken) =>
            TypedResults.Ok(await syncService.PushAsync(request, user.GetDeviceId(), cancellationToken)));

        sync.MapGet("/pull", async (
                SyncService syncService,
                CancellationToken cancellationToken,
                [Range(0, long.MaxValue)] long cursor = 0,
                [Range(1, MaxPullLimit)] int limit = MaxPullLimit) =>
            TypedResults.Ok(await syncService.PullAsync(cursor, limit, cancellationToken)));

        return group;
    }
}
