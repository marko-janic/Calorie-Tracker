using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Kcal.Server.Services;
using Xunit;

namespace Kcal.Server.Tests;

/// <summary>Every limit from 5.1, 5.5 and 7.6 returns 400 validation_failed.</summary>
public class ValidationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private HttpClient? _client;

    public ValidationTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    public static TheoryData<string, string?> InvalidEntryFields => new()
    {
        { "name", "" },
        { "name", new string('x', 201) },
        { "kcal", "-1" },
        { "kcal", "10001" },
        { "kcal", "10000.5" },
        { "proteinG", "-0.1" },
        { "carbsG", "2000.1" },
        { "fatG", "2001" },
        { "fibreG", "-1" },
        { "quantity", "0" },
        { "quantity", "100.5" },
        { "quantity", "0.009" },
        { "mealType", "\"brunch\"" },
        { "mealType", "1" },
        { "notes", new string('x', 1001) },
        { "eatenAt", "\"1999-12-31T23:59:00+01:00\"" },
        { "eatenAt", "\"FUTURE+3\"" },
        { "eatenAt", "\"2026-11-03T12:30:00\"" },
        { "loggedAt", "\"FUTURE+2\"" },
        { "loggedAt", "\"2026-11-03T11:30:55Z\"" },
        { "updatedAt", "\"FUTURE+2\"" },
        { "updatedAt", "\"2026-11-03T11:30:55.004+01:00\"" },
        { "id", "\"not-a-guid\"" },
        { "kcal", null },
        { "name", null },
        { "eatenAt", null }
    };

    [Theory]
    [MemberData(nameof(InvalidEntryFields))]
    public async Task Push_WithInvalidEntry_Returns400(string field, string? value)
    {
        var entry = ValidEntry();
        if (value is null)
        {
            entry.Remove(field);
        }
        else
        {
            entry[field] = field is "name" or "notes" ? JsonValue.Create(value) : ParseValue(value);
        }

        var response = await PushAsync(new JsonObject { ["entries"] = new JsonArray(entry) });

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
    }

    public static TheoryData<string, string?> InvalidProfileFields => new()
    {
        { "sex", "\"other\"" },
        { "birthYear", "1899" },
        { "birthYear", "NEXT_YEAR" },
        { "heightCm", "99" },
        { "heightCm", "251" },
        { "heightCm", "250.5" },
        { "weightKg", "29" },
        { "weightKg", "301" },
        { "weightKg", "29.9" },
        { "bodyFatPercent", "2" },
        { "bodyFatPercent", "61" },
        { "bodyFatPercent", "60.5" },
        { "activityLevel", "\"extreme\"" },
        { "goalKgPerWeek", "-1" },
        { "goalKgPerWeek", "0.5" },
        { "targets", """{ "kcal": 10001, "proteinG": 1, "carbsG": 1, "fatG": 1, "fibreG": 1 }""" },
        { "targets", """{ "kcal": 2000, "proteinG": 2001, "carbsG": 1, "fatG": 1, "fibreG": 1 }""" },
        { "targets", """{ "kcal": 2000, "proteinG": 1, "carbsG": 1, "fatG": -1, "fibreG": 1 }""" },
        { "updatedAt", "\"FUTURE+2\"" },
        { "sex", null }
    };

    [Theory]
    [MemberData(nameof(InvalidProfileFields))]
    public async Task Push_WithInvalidProfile_Returns400(string field, string? value)
    {
        var profile = ValidProfile();
        if (value is null)
        {
            profile.Remove(field);
        }
        else
        {
            profile[field] = ParseValue(value);
        }

        var response = await PushAsync(new JsonObject { ["entries"] = new JsonArray(), ["profile"] = profile });

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
    }

    [Fact]
    public async Task Push_WithValidBodies_Succeeds()
    {
        var response = await PushAsync(new JsonObject { ["entries"] = new JsonArray(ValidEntry()), ["profile"] = ValidProfile() });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Push_WithMoreThan500Entries_Returns400()
    {
        var entries = new JsonArray([.. Enumerable.Range(0, 501).Select(_ => (JsonNode)ValidEntry())]);

        var response = await PushAsync(new JsonObject { ["entries"] = entries });

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
    }

    [Fact]
    public async Task Push_WithOneInvalidChange_RejectsWholeRequest()
    {
        var valid = ValidEntry();
        var invalid = ValidEntry();
        invalid["kcal"] = -5;

        var response = await PushAsync(new JsonObject { ["entries"] = new JsonArray(valid, invalid) });

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
        var pull = await (await GetClientAsync()).GetFromJsonAsync<JsonObject>("/api/v1/sync/pull");
        Assert.DoesNotContain(pull!["entries"]!.AsArray(), e => e!["id"]!.GetValue<string>() == valid["id"]!.GetValue<string>());
    }

    [Fact]
    public async Task Push_WithMalformedJson_Returns400()
    {
        var client = await GetClientAsync();

        var response = await client.PostAsync("/api/v1/sync/push",
            new StringContent("{ \"entries\": [", System.Text.Encoding.UTF8, "application/json"));

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
    }

    [Theory]
    [InlineData("cursor=-1")]
    [InlineData("limit=0")]
    [InlineData("limit=501")]
    [InlineData("cursor=abc")]
    public async Task Pull_WithInvalidQuery_Returns400(string query)
    {
        var client = await GetClientAsync();

        var response = await client.GetAsync($"/api/v1/sync/pull?{query}");

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
    }

    [Theory]
    [InlineData("""{ "code": "", "deviceName": "Phone", "publicKey": "AAAA", "signature": "AAAA" }""")]
    [InlineData("""{ "code": "ABCD-EFGH", "deviceName": "", "publicKey": "AAAA", "signature": "AAAA" }""")]
    [InlineData("""{ "code": "ABCD-EFGH", "deviceName": "Phone", "publicKey": "AAAA" }""")]
    public async Task Pair_WithInvalidBody_Returns400(string body)
    {
        var response = await _factory.CreateClient().PostAsync("/api/v1/devices/pair",
            new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

        await ProblemAssert.HasCodeAsync(response, 400, ErrorCodes.ValidationFailed);
    }

    private async Task<HttpClient> GetClientAsync() => _client ??= await _factory.CreateDeviceClientAsync();

    private async Task<HttpResponseMessage> PushAsync(JsonObject body) =>
        await (await GetClientAsync()).PostAsJsonAsync("/api/v1/sync/push", body);

    private JsonNode? ParseValue(string value)
    {
        var now = _factory.Time.GetUtcNow();
        var resolved = value
            .Replace("NEXT_YEAR", (now.Year + 1).ToString())
            .Replace("\"FUTURE+3\"", $"\"{now.AddDays(3):yyyy-MM-dd'T'HH:mm:ss.fff}+00:00\"")
            .Replace("\"FUTURE+2\"", $"\"{now.AddDays(2).UtcDateTime:yyyy-MM-dd'T'HH:mm:ss.fff}Z\"");
        return JsonNode.Parse(resolved);
    }

    private JsonObject ValidEntry()
    {
        var now = $"{_factory.Time.GetUtcNow().UtcDateTime:yyyy-MM-dd'T'HH:mm:ss.fff}Z";
        return new JsonObject
        {
            ["id"] = Guid.CreateVersion7().ToString(),
            ["baseVersion"] = null,
            ["deleted"] = false,
            ["updatedAt"] = now,
            ["name"] = "Oats (80 g)",
            ["kcal"] = 300,
            ["proteinG"] = 10.5,
            ["carbsG"] = 48,
            ["fatG"] = 5.6,
            ["fibreG"] = 8,
            ["quantity"] = 1,
            ["mealType"] = "breakfast",
            ["notes"] = null,
            ["eatenAt"] = "2026-11-03T07:30:00+01:00",
            ["loggedAt"] = now
        };
    }

    private JsonObject ValidProfile() => new()
    {
        ["baseVersion"] = null,
        ["updatedAt"] = $"{_factory.Time.GetUtcNow().UtcDateTime:yyyy-MM-dd'T'HH:mm:ss.fff}Z",
        ["sex"] = "female",
        ["birthYear"] = 1990,
        ["heightCm"] = 170,
        ["weightKg"] = 65,
        ["bodyFatPercent"] = null,
        ["activityLevel"] = "veryActive",
        ["goalKgPerWeek"] = -0.25,
        ["targets"] = null
    };
}
