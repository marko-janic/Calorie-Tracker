using System.Net.Http.Json;
using System.Text.Json;
using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kcal.Server.Tests;

/// <summary>Push, pull and the conflict table of 6.3.</summary>
public class SyncTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly DateTimeOffset _baseTime;

    public SyncTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        // Millisecond precision, as on the wire
        var now = factory.Time.GetUtcNow().AddHours(-6);
        _baseTime = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero);
    }

    [Fact]
    public async Task PushedNewEntry_IsReturnedByPull()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var cursor = await GetHeadCursorAsync(client);
        var change = NewEntry(minutes: 0) with { Notes = "Grilled", MealType = MealType.Lunch, ProteinG = 62 };

        var result = Assert.Single((await PushAsync(client, change)).Entries);

        Assert.Equal(PushStatus.Applied, result.Status);
        var pulled = await PullAsync(client, cursor);
        var entry = Assert.Single(pulled.Entries);
        Assert.Equal(result.Version, entry.Version);
        Assert.Equal(change.Name, entry.Name);
        Assert.Equal(change.EatenAt, entry.EatenAt);
        Assert.Equal(change.EatenAt.Offset, entry.EatenAt.Offset);
        Assert.Equal(change.UpdatedAt, entry.UpdatedAt);
        Assert.Equal(MealType.Lunch, entry.MealType);
        Assert.Null(entry.CarbsG);
        Assert.Equal(entry.Version, pulled.NextCursor);
        Assert.False(pulled.HasMore);
    }

    [Fact]
    public async Task Push_StoresEatenLocalDateFromLocalTime()
    {
        var client = await _factory.CreateDeviceClientAsync();
        // 23:30 at +01:00 is 22:30 UTC on the same day, 00:30 at +02:00 is the previous day in UTC
        var change = NewEntry(minutes: 0) with { EatenAt = new DateTimeOffset(2026, 3, 29, 0, 30, 0, TimeSpan.FromHours(2)) };

        await PushAsync(client, change);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = await db.Entries.SingleAsync(e => e.Id == change.Id);
        Assert.Equal(new DateOnly(2026, 3, 29), entry.EatenLocalDate);
    }

    [Fact]
    public async Task Pull_PagesAcrossMoreThan500Records()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var cursor = await GetHeadCursorAsync(client);
        await PushAsync(client, Enumerable.Range(0, 500).Select(i => NewEntry(i % 60)).ToArray());
        await PushAsync(client, Enumerable.Range(0, 20).Select(i => NewEntry(i)).ToArray());

        var first = await PullAsync(client, cursor);
        var second = await PullAsync(client, first.NextCursor);

        Assert.Equal(500, first.Entries.Count);
        Assert.True(first.HasMore);
        Assert.Equal(20, second.Entries.Count);
        Assert.False(second.HasMore);
        var versions = first.Entries.Concat(second.Entries).Select(e => e.Version).ToList();
        Assert.Equal(versions.Order(), versions);
        Assert.Equal(520, versions.Distinct().Count());
        Assert.Equal(versions[^1], second.NextCursor);
    }

    [Fact]
    public async Task Pull_RespectsLimit()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var cursor = await GetHeadCursorAsync(client);
        await PushAsync(client, NewEntry(1), NewEntry(2), NewEntry(3));

        var page = await PullAsync(client, cursor, limit: 2);

        Assert.Equal(2, page.Entries.Count);
        Assert.True(page.HasMore);
    }

    [Fact]
    public async Task Profile_LastWriteWins()
    {
        var a = await _factory.CreateDeviceClientAsync("A");
        var b = await _factory.CreateDeviceClientAsync("B");
        var cursor = await GetHeadCursorAsync(a);

        var created = (await PushAsync(a, profile: NewProfile(minutes: 0, weightKg: 80))).Profile!;
        Assert.Equal(PushStatus.Applied, created.Status);

        // B edits later with a stale base version: applied
        var later = (await PushAsync(b, profile: NewProfile(minutes: 10, weightKg: 79) with { BaseVersion = null })).Profile!;
        Assert.Equal(PushStatus.Applied, later.Status);

        // A edits earlier with a stale base version: rejected, A receives B's profile
        var older = (await PushAsync(a, profile: NewProfile(minutes: 5, weightKg: 81) with { BaseVersion = created.Version })).Profile!;
        Assert.Equal(PushStatus.Rejected, older.Status);
        Assert.Equal(ConflictReason.OlderEdit, older.Reason);
        Assert.Equal(79, older.Current!.WeightKg);

        // A edits on top of the current version: applied
        var current = (await PushAsync(a, profile: NewProfile(minutes: 6, weightKg: 82) with { BaseVersion = later.Version })).Profile!;
        Assert.Equal(PushStatus.Applied, current.Status);

        var pulled = await PullAsync(b, cursor);
        Assert.Equal(82, pulled.Profile!.WeightKg);
        Assert.Equal(current.Version, pulled.Profile.Version);
        Assert.Equal(new TargetsDTO(2210, 144, 227, 74, 31), pulled.Profile.Targets);
        Assert.Equal(current.Version, pulled.NextCursor);
    }

    [Fact]
    public async Task Pull_ReturnsProfileOnlyWhenNewerThanCursor()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var version = (await PushAsync(client, profile: NewProfile(minutes: 30, weightKg: 75))).Profile!.Version;

        Assert.NotNull((await PullAsync(client, version - 1)).Profile);
        Assert.Null((await PullAsync(client, version)).Profile);
    }

    // Portion size and unit

    public static TheoryData<double?, PortionUnit?> Portions => new()
    {
        { 150, PortionUnit.G },
        { 330.5, PortionUnit.Ml },
        { null, null }
    };

    [Theory]
    [MemberData(nameof(Portions))]
    public async Task Portion_RoundTripsThroughPushAndPull(double? size, PortionUnit? unit)
    {
        var client = await _factory.CreateDeviceClientAsync();
        var change = NewEntry(minutes: 0) with { PortionSize = size, PortionUnit = unit };

        await PushAsync(client, change);

        var entry = await GetAsync(client, change.Id);
        Assert.Equal(size, entry.PortionSize);
        Assert.Equal(unit, entry.PortionUnit);
    }

    [Fact]
    public async Task Edit_ReplacesStoredPortion()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var entry = NewEntry(minutes: 0) with { PortionSize = 150, PortionUnit = PortionUnit.G };
        var version = (await PushOneAsync(client, entry)).Version!.Value;

        async Task<EntryDTO> EditAsync(int seconds, double? size, PortionUnit? unit)
        {
            var edit = entry with { BaseVersion = version, UpdatedAt = At(seconds), PortionSize = size, PortionUnit = unit };
            var result = await PushOneAsync(client, edit);
            Assert.Equal(PushStatus.Applied, result.Status);
            version = result.Version!.Value;
            return await GetAsync(client, entry.Id);
        }

        var inMillilitres = await EditAsync(10, 330, PortionUnit.Ml);
        Assert.Equal(330, inMillilitres.PortionSize);
        Assert.Equal(PortionUnit.Ml, inMillilitres.PortionUnit);

        var cleared = await EditAsync(20, null, null);
        Assert.Null(cleared.PortionSize);
        Assert.Null(cleared.PortionUnit);

        var set = await EditAsync(30, 40, PortionUnit.G);
        Assert.Equal(40, set.PortionSize);
        Assert.Equal(PortionUnit.G, set.PortionUnit);
    }

    [Theory]
    [MemberData(nameof(Portions))]
    public async Task RejectedPush_CurrentCarriesPortionOfServerRecord(double? size, PortionUnit? unit)
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var entry = NewEntry(minutes: 0) with { PortionSize = 40, PortionUnit = PortionUnit.G };
        var v1 = (await PushOneAsync(a, entry)).Version!.Value;
        await PushOneAsync(b, entry with { BaseVersion = v1, UpdatedAt = At(600), PortionSize = size, PortionUnit = unit });

        var result = await PushOneAsync(a, entry with { BaseVersion = v1, UpdatedAt = At(540), PortionSize = 999, PortionUnit = PortionUnit.Ml });

        Assert.Equal(PushStatus.Rejected, result.Status);
        Assert.Equal(size, result.Current!.PortionSize);
        Assert.Equal(unit, result.Current.PortionUnit);
    }

    [Fact]
    public async Task Pull_SendsPortionUnitAsLowercaseTextAndMissingPortionAsNull()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var cursor = await GetHeadCursorAsync(client);
        var grams = NewEntry(minutes: 1) with { PortionSize = 150, PortionUnit = PortionUnit.G };
        var millilitres = NewEntry(minutes: 2) with { PortionSize = 330.5, PortionUnit = PortionUnit.Ml };
        var plain = NewEntry(minutes: 3);
        await PushAsync(client, grams, millilitres, plain);

        using var json = JsonDocument.Parse(await client.GetStringAsync($"/api/v1/sync/pull?cursor={cursor}"));

        var entries = json.RootElement.GetProperty("entries").EnumerateArray().ToDictionary(e => e.GetProperty("id").GetGuid());
        Assert.Equal(("150", "\"g\""), WirePortion(entries[grams.Id]));
        Assert.Equal(("330.5", "\"ml\""), WirePortion(entries[millilitres.Id]));
        Assert.Equal(("null", "null"), WirePortion(entries[plain.Id]));
    }

    [Fact]
    public async Task Push_StoresPortionUnitAsLowercaseText()
    {
        var client = await _factory.CreateDeviceClientAsync();
        var grams = NewEntry(minutes: 1) with { PortionSize = 150, PortionUnit = PortionUnit.G };
        var millilitres = NewEntry(minutes: 2) with { PortionSize = 330, PortionUnit = PortionUnit.Ml };
        var plain = NewEntry(minutes: 3);
        await PushAsync(client, grams, millilitres, plain);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        async Task<string?> StoredUnitAsync(Guid id) =>
            await db.Database.SqlQuery<string?>($"SELECT PortionUnit AS Value FROM Entries WHERE Id = {id}").SingleAsync();

        Assert.Equal("g", await StoredUnitAsync(grams.Id));
        Assert.Equal("ml", await StoredUnitAsync(millilitres.Id));
        Assert.Null(await StoredUnitAsync(plain.Id));
    }

    // Conflict table (6.3)

    [Fact]
    public async Task Case1_EditWithCurrentBase_IsApplied()
    {
        var a = await _factory.CreateDeviceClientAsync("A");
        var (entry, v5) = await CreateAsync(a);

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Name = "Edited", UpdatedAt = At(10) });

        Assert.Equal(PushStatus.Applied, result.Status);
        Assert.True(result.Version > v5);
    }

    [Fact]
    public async Task Case2_LaterConcurrentEdit_IsApplied()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        await PushOneAsync(b, entry with { BaseVersion = v5, Name = "B", UpdatedAt = At(600) });

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Name = "A", UpdatedAt = At(660) });

        Assert.Equal(PushStatus.Applied, result.Status);
        Assert.Equal("A", (await GetAsync(a, entry.Id)).Name);
    }

    [Fact]
    public async Task Case3_OlderConcurrentEdit_IsRejectedWithServerRecord()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        var v6 = (await PushOneAsync(b, entry with { BaseVersion = v5, Name = "B", UpdatedAt = At(600) })).Version;

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Name = "A", UpdatedAt = At(540) });

        Assert.Equal(PushStatus.Rejected, result.Status);
        Assert.Equal(ConflictReason.OlderEdit, result.Reason);
        Assert.Equal(v6, result.Version);
        Assert.Equal("B", result.Current!.Name);
        Assert.Equal(v6, result.Current.Version);
    }

    [Fact]
    public async Task ConcurrentEditWithEqualUpdatedAt_KeepsServerRecord()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        await PushOneAsync(b, entry with { BaseVersion = v5, Name = "B", UpdatedAt = At(600) });

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Name = "A", UpdatedAt = At(600) });

        Assert.Equal(PushStatus.Rejected, result.Status);
        Assert.Equal(ConflictReason.OlderEdit, result.Reason);
    }

    [Fact]
    public async Task Case4_DeleteWithCurrentBase_StoresTombstone()
    {
        var a = await _factory.CreateDeviceClientAsync("A");
        var (entry, v5) = await CreateAsync(a);

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Deleted = true, UpdatedAt = At(10) });

        Assert.Equal(PushStatus.Applied, result.Status);
        var tombstone = await GetAsync(a, entry.Id);
        Assert.True(tombstone.Deleted);
        Assert.Equal(result.Version, tombstone.Version);
    }

    [Fact]
    public async Task Case5_DeleteAfterConcurrentEdit_IsRejectedAndEntryStays()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        await PushOneAsync(b, entry with { BaseVersion = v5, Name = "B", UpdatedAt = At(600) });

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Deleted = true, UpdatedAt = At(700) });

        Assert.Equal(PushStatus.Rejected, result.Status);
        Assert.Equal(ConflictReason.DeleteConflict, result.Reason);
        Assert.False(result.Current!.Deleted);
        Assert.Equal("B", result.Current.Name);
        Assert.False((await GetAsync(a, entry.Id)).Deleted);
    }

    [Fact]
    public async Task Case6_EditAfterConcurrentDelete_RestoresEntry()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        await PushOneAsync(b, entry with { BaseVersion = v5, Deleted = true, UpdatedAt = At(600) });

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Name = "A", UpdatedAt = At(300) });

        Assert.Equal(PushStatus.Applied, result.Status);
        var restored = await GetAsync(a, entry.Id);
        Assert.False(restored.Deleted);
        Assert.Equal("A", restored.Name);
    }

    [Fact]
    public async Task Case7_DeleteAfterConcurrentDelete_IsNoOp()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        var v6 = (await PushOneAsync(b, entry with { BaseVersion = v5, Deleted = true, UpdatedAt = At(600) })).Version;

        var result = await PushOneAsync(a, entry with { BaseVersion = v5, Deleted = true, UpdatedAt = At(700) });

        Assert.Equal(PushStatus.Applied, result.Status);
        Assert.Equal(v6, result.Version);
        Assert.Equal(v6, (await GetAsync(a, entry.Id)).Version);
    }

    [Fact]
    public async Task Case8_RetryOfAppliedChange_IsIdempotent()
    {
        var a = await _factory.CreateDeviceClientAsync("A");
        var (entry, v5) = await CreateAsync(a);
        var edit = entry with { BaseVersion = v5, Name = "Edited", UpdatedAt = At(10) };
        var first = await PushOneAsync(a, edit);
        var lastSeq = await GetLastSeqAsync();

        var retry = await PushOneAsync(a, edit);

        Assert.Equal(PushStatus.Applied, retry.Status);
        Assert.Equal(first.Version, retry.Version);
        Assert.Equal(lastSeq, await GetLastSeqAsync());
    }

    [Fact]
    public async Task RetryFromAnotherDevice_IsNotTreatedAsRetry()
    {
        var (a, b) = (await _factory.CreateDeviceClientAsync("A"), await _factory.CreateDeviceClientAsync("B"));
        var (entry, v5) = await CreateAsync(a);
        var edit = entry with { BaseVersion = v5, Name = "Edited", UpdatedAt = At(10) };
        var applied = await PushOneAsync(a, edit);

        var fromB = await PushOneAsync(b, edit);

        Assert.Equal(PushStatus.Rejected, fromB.Status);
        Assert.Equal(applied.Version, fromB.Version);
    }

    [Fact]
    public async Task Case9_NewId_IsApplied()
    {
        var a = await _factory.CreateDeviceClientAsync("A");

        var result = await PushOneAsync(a, NewEntry(0));

        Assert.Equal(PushStatus.Applied, result.Status);
        Assert.NotNull(result.Version);
    }

    [Fact]
    public async Task Case10_DeleteOfUnknownId_IsAppliedAndStoresNothing()
    {
        var a = await _factory.CreateDeviceClientAsync("A");
        var lastSeq = await GetLastSeqAsync();
        var change = NewEntry(0) with { Deleted = true };

        var result = await PushOneAsync(a, change);

        Assert.Equal(PushStatus.Applied, result.Status);
        Assert.Null(result.Version);
        Assert.Equal(lastSeq, await GetLastSeqAsync());
        await using var scope = _factory.Services.CreateAsyncScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<AppDbContext>().Entries.AnyAsync(e => e.Id == change.Id));
    }

    private DateTimeOffset At(int seconds) => _baseTime.AddSeconds(seconds);

    private EntryChangeDTO NewEntry(int minutes) => new(
        Id: Guid.CreateVersion7(),
        UpdatedAt: At(minutes * 60),
        Name: "Chicken breast, grilled (200 g)",
        Kcal: 330,
        EatenAt: new DateTimeOffset(2026, 11, 3, 12, 30, 0, TimeSpan.FromHours(1)),
        LoggedAt: At(minutes * 60));

    private ProfileChangeDTO NewProfile(int minutes, double weightKg) => new(
        UpdatedAt: At(minutes * 60),
        Sex: Sex.Male,
        BirthYear: 1996,
        HeightCm: 180,
        WeightKg: weightKg,
        ActivityLevel: ActivityLevel.Moderate,
        GoalKgPerWeek: -0.5,
        Targets: new TargetsDTO(2210, 144, 227, 74, 31));

    private async Task<(EntryChangeDTO Entry, long Version)> CreateAsync(HttpClient client)
    {
        var entry = NewEntry(0);
        var result = await PushOneAsync(client, entry);
        return (entry, result.Version!.Value);
    }

    private static async Task<EntryPushResultDTO> PushOneAsync(HttpClient client, EntryChangeDTO change) =>
        Assert.Single((await PushAsync(client, change)).Entries);

    private static Task<PushResponseDTO> PushAsync(HttpClient client, params EntryChangeDTO[] entries) =>
        PushAsync(client, entries, profile: null);

    private static Task<PushResponseDTO> PushAsync(HttpClient client, ProfileChangeDTO profile) =>
        PushAsync(client, [], profile);

    private static async Task<PushResponseDTO> PushAsync(HttpClient client, EntryChangeDTO[] entries, ProfileChangeDTO? profile)
    {
        var response = await client.PostAsJsonAsync("/api/v1/sync/push", new PushRequestDTO([.. entries], profile), TestWebApplicationFactory.Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PushResponseDTO>(TestWebApplicationFactory.Json))!;
    }

    private static async Task<PullResponseDTO> PullAsync(HttpClient client, long cursor, int? limit = null)
    {
        var url = $"/api/v1/sync/pull?cursor={cursor}" + (limit is null ? "" : $"&limit={limit}");
        return (await client.GetFromJsonAsync<PullResponseDTO>(url, TestWebApplicationFactory.Json))!;
    }

    /// <summary>The cursor after pulling everything, so later pulls return only new changes.</summary>
    private static async Task<long> GetHeadCursorAsync(HttpClient client)
    {
        var page = await PullAsync(client, 0);
        while (page.HasMore)
        {
            page = await PullAsync(client, page.NextCursor);
        }
        return page.NextCursor;
    }

    /// <summary>The current server record, via pull.</summary>
    private static async Task<EntryDTO> GetAsync(HttpClient client, Guid id)
    {
        var cursor = 0L;
        while (true)
        {
            var page = await PullAsync(client, cursor);
            if (page.Entries.FirstOrDefault(e => e.Id == id) is { } entry)
            {
                return entry;
            }
            Assert.True(page.HasMore, $"Entry {id} not found");
            cursor = page.NextCursor;
        }
    }

    /// <summary>The raw JSON of both portion members. GetProperty throws when a member is omitted, so null must be sent explicitly.</summary>
    private static (string Size, string Unit) WirePortion(JsonElement entry) =>
        (entry.GetProperty("portionSize").GetRawText(), entry.GetProperty("portionUnit").GetRawText());

    private async Task<long> GetLastSeqAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().ServerState.Select(s => s.LastSeq).SingleAsync();
    }
}
