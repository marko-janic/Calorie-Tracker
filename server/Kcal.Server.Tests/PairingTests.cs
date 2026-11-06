using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Kcal.Server.Models;
using Kcal.Server.Services;
using Xunit;

namespace Kcal.Server.Tests;

public class PairingTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public PairingTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Pair_WithValidCode_CreatesDevice()
    {
        using var device = new TestDevice("Pixel 9");
        var response = await _factory.PairAsync(_factory.CreateClient(), device, await _factory.CreatePairingCodeAsync());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var paired = await response.Content.ReadFromJsonAsync<PairResponseDTO>(TestWebApplicationFactory.Json);
        Assert.NotNull(paired);
        Assert.Equal(await _factory.GetServerIdAsync(), paired.ServerId);

        device.DeviceId = paired.DeviceId;
        var client = await _factory.CreateAuthenticatedClientAsync(device);
        var devices = await client.GetFromJsonAsync<List<DeviceListItemDTO>>("/api/v1/devices", TestWebApplicationFactory.Json);
        var current = Assert.Single(devices!, d => d.IsCurrent);
        Assert.Equal(paired.DeviceId, current.Id);
        Assert.Equal("Pixel 9", current.Name);
    }

    [Theory]
    [InlineData("7k2m qx9d")]
    [InlineData("7K2MQX9D")]
    public void NormalizeCode_IgnoresCaseDashesAndSpaces(string input)
    {
        Assert.Equal("7K2MQX9D", PairingService.NormalizeCode(input));
    }

    [Fact]
    public void NormalizeCode_MapsAmbiguousLetters()
    {
        Assert.Equal("0111ABCD", PairingService.NormalizeCode("OIL1-abcd"));
    }

    [Fact]
    public async Task Pair_WithLowercaseUndashedCode_Succeeds()
    {
        using var device = new TestDevice();
        var code = (await _factory.CreatePairingCodeAsync()).Replace("-", "").ToLowerInvariant();

        var response = await _factory.PairAsync(_factory.CreateClient(), device, code);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Pair_WithReusedCode_Returns401()
    {
        var code = await _factory.CreatePairingCodeAsync();
        using var first = new TestDevice();
        using var second = new TestDevice();
        (await _factory.PairAsync(_factory.CreateClient(), first, code)).EnsureSuccessStatusCode();

        var response = await _factory.PairAsync(_factory.CreateClient(), second, code);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidPairingCode);
    }

    [Fact]
    public async Task Pair_WithExpiredCode_Returns401()
    {
        var code = await _factory.CreatePairingCodeAsync();
        _factory.Time.Advance(TimeSpan.FromMinutes(11));
        using var device = new TestDevice();

        var response = await _factory.PairAsync(_factory.CreateClient(), device, code);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidPairingCode);
    }

    [Theory]
    [InlineData("ZZZZ-ZZZZ")] // well-formed, never issued
    [InlineData("not a code")]
    public async Task Pair_WithWrongCode_Returns401(string code)
    {
        using var device = new TestDevice();

        var response = await _factory.PairAsync(_factory.CreateClient(), device, code);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidPairingCode);
    }

    [Fact]
    public async Task Pair_WithWrongSignature_Returns401AndKeepsCode()
    {
        var code = await _factory.CreatePairingCodeAsync();
        using var device = new TestDevice();
        using var other = new TestDevice();

        var response = await _factory.PairAsync(_factory.CreateClient(), device, code, signature: other.Sign("kcal-pair-v1"));

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidPairingCode);
        Assert.Equal(HttpStatusCode.Created, (await _factory.PairAsync(_factory.CreateClient(), device, code)).StatusCode);
    }

    [Fact]
    public async Task PairingCodes_CreatedByDevice_PairsAnotherDevice()
    {
        var client = await _factory.CreateDeviceClientAsync();

        var response = await client.PostAsync("/api/v1/pairing-codes", null);

        response.EnsureSuccessStatusCode();
        var code = await response.Content.ReadFromJsonAsync<CreatePairingCodeResponseDTO>(TestWebApplicationFactory.Json);
        Assert.Matches("^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$", code!.Code);
        using var device = new TestDevice();
        Assert.Equal(HttpStatusCode.Created, (await _factory.PairAsync(_factory.CreateClient(), device, code.Code)).StatusCode);
    }
}

public class PairingRateLimitTests : IClassFixture<RateLimitedWebApplicationFactory>
{
    private readonly RateLimitedWebApplicationFactory _factory;

    public PairingRateLimitTests(RateLimitedWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Pair_EleventhAttemptWithinAMinute_Returns429()
    {
        var client = _factory.CreateClient();
        using var device = new TestDevice();
        for (var attempt = 1; attempt <= 10; attempt++)
        {
            var response = await _factory.PairAsync(client, device, "ZZZZ-ZZZZ");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        var limited = await _factory.PairAsync(client, device, "ZZZZ-ZZZZ");

        await ProblemAssert.HasCodeAsync(limited, 429, ErrorCodes.RateLimited);
    }
}

/// <summary>
/// The CLI uses the real clock, so it gets its own server whose fake clock has not been advanced.
/// </summary>
public partial class PairingCliTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public PairingCliTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Cli_CreatesWorkingCode()
    {
        using var output = new StringWriter();

        var exitCode = await CliRunner.RunAsync(["pair", $"--Kcal:DataDir={_factory.DataDir}"], output);

        Assert.Equal(0, exitCode);
        var match = CliOutput().Match(output.ToString());
        Assert.True(match.Success, output.ToString());
        using var device = new TestDevice();
        var response = await _factory.PairAsync(_factory.CreateClient(), device, match.Groups["code"].Value);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [GeneratedRegex(@"^Pairing code: (?<code>[0-9A-Z]{4}-[0-9A-Z]{4}) \(valid until \d{2}:\d{2} UTC\)")]
    private static partial Regex CliOutput();
}
