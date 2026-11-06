using Kcal.Server.Data;
using Kcal.Server.Models;

namespace Kcal.Server.Endpoints;

public static class HealthEndpoints
{
    public static RouteGroupBuilder MapHealthEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/health", async (AppDbContext db, CancellationToken cancellationToken) =>
            TypedResults.Ok(new HealthResponseDTO(
                Status: "ok",
                ServerId: await db.GetServerIdAsync(cancellationToken),
                ServerVersion: ServerInfo.Version,
                ApiVersion: ServerInfo.ApiVersion,
                MinAppVersion: ServerInfo.MinAppVersion)));
        return group;
    }
}
