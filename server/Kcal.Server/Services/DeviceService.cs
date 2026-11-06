using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace Kcal.Server.Services;

/// <summary>Listing and revoking paired devices (7.5).</summary>
public sealed class DeviceService(AppDbContext db)
{
    public Task<List<DeviceListItemDTO>> ListAsync(Guid currentDeviceId, CancellationToken cancellationToken = default) =>
        db.Devices.AsNoTracking()
            .OrderBy(d => d.Id) // UUIDv7, i.e. pairing order
            .Select(d => new DeviceListItemDTO(d.Id, d.Name, d.CreatedAt, d.LastSeenAt, d.Id == currentDeviceId))
            .ToListAsync(cancellationToken);

    /// <summary>Removes the device and its access tokens. Returns false if the device does not exist.</summary>
    public async Task<bool> RevokeAsync(Guid deviceId, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.AccessTokens.Where(t => t.DeviceId == deviceId).ExecuteDeleteAsync(cancellationToken);
        var deleted = await db.Devices.Where(d => d.Id == deviceId).ExecuteDeleteAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return deleted > 0;
    }
}
