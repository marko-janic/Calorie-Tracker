using System.Security.Claims;
using Kcal.Server.Auth;
using Kcal.Server.Hosting;
using Kcal.Server.Models;
using Kcal.Server.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Kcal.Server.Endpoints;

/// <summary>Pairing, the device list, revocation and pairing codes for additional devices (7.3, 7.5).</summary>
public static class DeviceEndpoints
{
    public static RouteGroupBuilder MapDeviceEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/devices/pair", async (PairRequestDTO request, PairingService pairingService, CancellationToken cancellationToken) =>
                TypedResults.Created((string?)null, await pairingService.PairAsync(request, cancellationToken)))
            .RequireRateLimiting(RateLimiting.AuthPolicy);

        var authorized = group.MapGroup("").RequireAuthorization();

        authorized.MapGet("/devices", (ClaimsPrincipal user, DeviceService deviceService, CancellationToken cancellationToken) =>
            deviceService.ListAsync(user.GetDeviceId(), cancellationToken));

        authorized.MapDelete("/devices/{id:guid}", async Task<Results<NoContent, ProblemHttpResult>> (
            Guid id, DeviceService deviceService, CancellationToken cancellationToken) =>
            await deviceService.RevokeAsync(id, cancellationToken)
                ? TypedResults.NoContent()
                : ApiProblemDetails.NotFound());

        authorized.MapPost("/pairing-codes", async (ClaimsPrincipal user, PairingService pairingService, CancellationToken cancellationToken) =>
            TypedResults.Ok(await pairingService.CreateCodeAsync(user.GetDeviceId().ToString(), cancellationToken)));

        return group;
    }
}
