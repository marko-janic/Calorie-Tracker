using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kcal.Server.Data;

/// <summary>Prepares the database at startup and for the CLI (8.3).</summary>
public sealed class DatabaseInitializer(AppDbContext db, IOptions<KcalOptions> options, TimeProvider time)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(options.Value.DataDir);
        await db.Database.MigrateAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", cancellationToken);

        if (!await db.ServerState.AnyAsync(cancellationToken))
        {
            db.ServerState.Add(new ServerState
            {
                Id = 1,
                ServerId = Guid.NewGuid(),
                LastSeq = 0,
                CreatedAt = time.GetUtcNow()
            });
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
