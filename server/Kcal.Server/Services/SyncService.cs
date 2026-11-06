using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace Kcal.Server.Services;

/// <summary>Push with the conflict rules of 6.3 and pull (6.4).</summary>
public sealed class SyncService(AppDbContext db, TimeProvider time)
{
    // All writes of a push run serialized within this (single-instance) process
    private static readonly SemaphoreSlim WriteLock = new(1, 1);

    public async Task<PushResponseDTO> PushAsync(PushRequestDTO request, Guid deviceId, CancellationToken cancellationToken = default)
    {
        await WriteLock.WaitAsync(cancellationToken);
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var push = new PushContext(
                await db.ServerState.SingleAsync(cancellationToken), deviceId, time.GetUtcNow());

            var ids = request.Entries.Select(e => e.Id).Distinct().ToList();
            var entries = await db.Entries.Where(e => ids.Contains(e.Id)).ToDictionaryAsync(e => e.Id, cancellationToken);
            var entryResults = request.Entries.Select(change => PushEntry(change, entries, push)).ToList();

            var profileResult = request.Profile is null ? null : await PushProfileAsync(request.Profile, push, cancellationToken);

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new PushResponseDTO(entryResults, profileResult);
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task<PullResponseDTO> PullAsync(long cursor, int limit, CancellationToken cancellationToken = default)
    {
        // One read transaction, so entries and profile come from the same snapshot
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entries = await db.Entries.AsNoTracking()
            .Where(e => e.Version > cursor)
            .OrderBy(e => e.Version)
            .Take(limit + 1)
            .ToListAsync(cancellationToken);
        var hasMore = entries.Count > limit;
        if (hasMore)
        {
            entries.RemoveAt(limit);
        }

        var profile = await db.Profiles.AsNoTracking()
            .SingleOrDefaultAsync(p => p.Version > cursor, cancellationToken);

        var nextCursor = entries.Count > 0
            ? entries[^1].Version
            : Math.Max(cursor, profile?.Version ?? 0);

        return new PullResponseDTO(entries.Select(ToDTO).ToList(), profile is null ? null : ToDTO(profile), nextCursor, hasMore);
    }

    private EntryPushResultDTO PushEntry(EntryChangeDTO change, Dictionary<Guid, Entry> entries, PushContext push)
    {
        // Rule 1: new id
        if (!entries.TryGetValue(change.Id, out var entry))
        {
            if (change.Deleted)
            {
                return Applied(change.Id, version: null);
            }

            entry = new Entry { Id = change.Id };
            db.Entries.Add(entry);
            entries.Add(entry.Id, entry);
            return Apply(entry, change, push);
        }

        // Rule 2: retry of a change that was already applied
        if (entry.UpdatedAt == change.UpdatedAt
            && entry.Deleted == change.Deleted
            && entry.UpdatedByDeviceId == push.DeviceId)
        {
            return Applied(entry.Id, entry.Version);
        }

        // Rule 3: no concurrent change
        if (change.BaseVersion == entry.Version)
        {
            return Apply(entry, change, push);
        }

        // Rule 4: concurrent change
        return (change.Deleted, entry.Deleted) switch
        {
            (true, false) => Rejected(entry, ConflictReason.DeleteConflict),
            (true, true) => Applied(entry.Id, entry.Version),
            (false, true) => Apply(entry, change, push),
            (false, false) => change.UpdatedAt > entry.UpdatedAt
                ? Apply(entry, change, push)
                : Rejected(entry, ConflictReason.OlderEdit)
        };
    }

    private async Task<ProfilePushResultDTO> PushProfileAsync(ProfileChangeDTO change, PushContext push, CancellationToken cancellationToken)
    {
        var profile = await db.Profiles.SingleOrDefaultAsync(cancellationToken);
        if (profile is null)
        {
            profile = new Profile { Id = 1 };
            db.Profiles.Add(profile);
            return Apply(profile, change, push);
        }

        // Same rules as entries, but a profile is never deleted (rule 5): retry, no conflict, last write wins
        if (profile.UpdatedAt == change.UpdatedAt && profile.UpdatedByDeviceId == push.DeviceId)
        {
            return new ProfilePushResultDTO(PushStatus.Applied, profile.Version);
        }

        return change.BaseVersion == profile.Version || change.UpdatedAt > profile.UpdatedAt
            ? Apply(profile, change, push)
            : new ProfilePushResultDTO(PushStatus.Rejected, profile.Version, ConflictReason.OlderEdit, ToDTO(profile));
    }

    private static EntryPushResultDTO Apply(Entry entry, EntryChangeDTO change, PushContext push)
    {
        entry.Name = change.Name;
        entry.Kcal = change.Kcal;
        entry.ProteinG = change.ProteinG;
        entry.CarbsG = change.CarbsG;
        entry.FatG = change.FatG;
        entry.FibreG = change.FibreG;
        entry.Quantity = change.Quantity;
        entry.MealType = change.MealType;
        entry.Notes = change.Notes;
        entry.EatenAt = change.EatenAt;
        // The day is the date part of the local eatenAt (5.2); DateTimeOffset.DateTime is the local clock time
        entry.EatenLocalDate = DateOnly.FromDateTime(change.EatenAt.DateTime);
        entry.LoggedAt = change.LoggedAt;
        entry.UpdatedAt = change.UpdatedAt;
        entry.Deleted = change.Deleted;
        entry.Version = push.NextVersion();
        entry.UpdatedByDeviceId = push.DeviceId;
        entry.ServerUpdatedAt = push.Now;
        return Applied(entry.Id, entry.Version);
    }

    private static ProfilePushResultDTO Apply(Profile profile, ProfileChangeDTO change, PushContext push)
    {
        profile.Sex = change.Sex;
        profile.BirthYear = change.BirthYear;
        profile.HeightCm = change.HeightCm;
        profile.WeightKg = change.WeightKg;
        profile.BodyFatPercent = change.BodyFatPercent;
        profile.ActivityLevel = change.ActivityLevel;
        profile.GoalKgPerWeek = change.GoalKgPerWeek;
        profile.TargetKcal = change.Targets?.Kcal;
        profile.TargetProteinG = change.Targets?.ProteinG;
        profile.TargetCarbsG = change.Targets?.CarbsG;
        profile.TargetFatG = change.Targets?.FatG;
        profile.TargetFibreG = change.Targets?.FibreG;
        profile.UpdatedAt = change.UpdatedAt;
        profile.Version = push.NextVersion();
        profile.UpdatedByDeviceId = push.DeviceId;
        profile.ServerUpdatedAt = push.Now;
        return new ProfilePushResultDTO(PushStatus.Applied, profile.Version);
    }

    private static EntryPushResultDTO Applied(Guid id, long? version) => new(id, PushStatus.Applied, version);

    private static EntryPushResultDTO Rejected(Entry entry, ConflictReason reason) =>
        new(entry.Id, PushStatus.Rejected, entry.Version, reason, ToDTO(entry));

    private static EntryDTO ToDTO(Entry entry) => new(
        entry.Id, entry.Version, entry.Deleted, entry.UpdatedAt, entry.Name, entry.Kcal,
        entry.ProteinG, entry.CarbsG, entry.FatG, entry.FibreG, entry.Quantity, entry.MealType,
        entry.Notes, entry.EatenAt, entry.LoggedAt);

    private static ProfileDTO ToDTO(Profile profile) => new(
        profile.Version, profile.UpdatedAt, profile.Sex, profile.BirthYear, profile.HeightCm,
        profile.WeightKg, profile.BodyFatPercent, profile.ActivityLevel, profile.GoalKgPerWeek,
        (profile.TargetKcal, profile.TargetProteinG, profile.TargetCarbsG, profile.TargetFatG, profile.TargetFibreG) is
            ({ } kcal, { } protein, { } carbs, { } fat, { } fibre)
            ? new TargetsDTO(kcal, protein, carbs, fat, fibre)
            : null);

    /// <summary>State shared by all changes of one push.</summary>
    private sealed class PushContext(ServerState state, Guid deviceId, DateTimeOffset now)
    {
        public Guid DeviceId { get; } = deviceId;
        public DateTimeOffset Now { get; } = now;

        /// <summary>Every applied change gets the next value of the global counter (6.1).</summary>
        public long NextVersion() => ++state.LastSeq;
    }
}
