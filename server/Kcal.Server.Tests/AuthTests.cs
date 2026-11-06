using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Kcal.Server.Models;
using Kcal.Server.Services;
using Xunit;

namespace Kcal.Server.Tests;

public class AuthTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public AuthTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task ChallengeAndToken_WithValidSignature_Succeed()
    {
        using var device = await _factory.PairNewDeviceAsync();
        var client = _factory.CreateClient();

        var challenge = await _factory.CreateChallengeAsync(client, device.DeviceId);
        var response = await _factory.RequestTokenAsync(client, device, challenge.Nonce);

        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<TokenResponseDTO>(TestWebApplicationFactory.Json);
        Assert.Equal(32, Convert.FromBase64String(challenge.Nonce).Length);
        Assert.Equal(_factory.Time.GetUtcNow().AddHours(1), token!.ExpiresAt, TimeSpan.FromSeconds(1));
        Assert.DoesNotContain('=', token.AccessToken); // base64url without padding
    }

    [Fact]
    public async Task Token_WithWrongSignature_Returns401()
    {
        using var device = await _factory.PairNewDeviceAsync();
        using var other = new TestDevice();
        var client = _factory.CreateClient();
        var challenge = await _factory.CreateChallengeAsync(client, device.DeviceId);

        var response = await _factory.RequestTokenAsync(client, device, challenge.Nonce, signature: other.Sign(challenge.Nonce));

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidSignature);
    }

    [Fact]
    public async Task Token_WithReusedNonce_Returns401()
    {
        using var device = await _factory.PairNewDeviceAsync();
        var client = _factory.CreateClient();
        var challenge = await _factory.CreateChallengeAsync(client, device.DeviceId);
        (await _factory.RequestTokenAsync(client, device, challenge.Nonce)).EnsureSuccessStatusCode();

        var response = await _factory.RequestTokenAsync(client, device, challenge.Nonce);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.ChallengeExpired);
    }

    [Fact]
    public async Task Token_WithExpiredNonce_Returns401()
    {
        using var device = await _factory.PairNewDeviceAsync();
        var client = _factory.CreateClient();
        var challenge = await _factory.CreateChallengeAsync(client, device.DeviceId);
        _factory.Time.Advance(TimeSpan.FromMinutes(3));

        var response = await _factory.RequestTokenAsync(client, device, challenge.Nonce);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.ChallengeExpired);
    }

    [Fact]
    public async Task Token_WithNonceOfAnotherDevice_Returns401()
    {
        using var device = await _factory.PairNewDeviceAsync();
        using var other = await _factory.PairNewDeviceAsync();
        var client = _factory.CreateClient();
        var challenge = await _factory.CreateChallengeAsync(client, other.DeviceId);

        var response = await _factory.RequestTokenAsync(client, device, challenge.Nonce);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.ChallengeExpired);
    }

    [Fact]
    public async Task Challenge_ForUnknownDevice_Returns401()
    {
        var response = await _factory.CreateClient()
            .PostAsJsonAsync("/api/v1/auth/challenge", new ChallengeRequestDTO(Guid.NewGuid()), TestWebApplicationFactory.Json);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.UnknownDevice);
    }

    [Fact]
    public async Task RevokedDevice_LosesTokenAndCannotAuthenticate()
    {
        using var device = await _factory.PairNewDeviceAsync();
        var client = await _factory.CreateAuthenticatedClientAsync(device);

        var revoke = await client.DeleteAsync($"/api/v1/devices/{device.DeviceId}");

        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
        await ProblemAssert.HasCodeAsync(await client.GetAsync("/api/v1/devices"), 401, ErrorCodes.InvalidToken);
        var challenge = await _factory.CreateClient()
            .PostAsJsonAsync("/api/v1/auth/challenge", new ChallengeRequestDTO(device.DeviceId), TestWebApplicationFactory.Json);
        await ProblemAssert.HasCodeAsync(challenge, 401, ErrorCodes.UnknownDevice);
    }

    [Fact]
    public async Task RevokedDevice_WithPendingChallenge_Returns401UnknownDevice()
    {
        using var device = await _factory.PairNewDeviceAsync();
        var admin = await _factory.CreateDeviceClientAsync();
        var client = _factory.CreateClient();
        var challenge = await _factory.CreateChallengeAsync(client, device.DeviceId);
        (await admin.DeleteAsync($"/api/v1/devices/{device.DeviceId}")).EnsureSuccessStatusCode();

        var response = await _factory.RequestTokenAsync(client, device, challenge.Nonce);

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.UnknownDevice);
    }

    [Fact]
    public async Task Revoke_UnknownDevice_Returns404()
    {
        var client = await _factory.CreateDeviceClientAsync();

        var response = await client.DeleteAsync($"/api/v1/devices/{Guid.NewGuid()}");

        await ProblemAssert.HasCodeAsync(response, 404, ErrorCodes.NotFound);
    }

    [Fact]
    public async Task ExpiredToken_ReturnsTokenExpired()
    {
        var client = await _factory.CreateDeviceClientAsync();
        _factory.Time.Advance(TimeSpan.FromMinutes(61));

        var response = await client.GetAsync("/api/v1/devices");

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.TokenExpired);
    }

    [Fact]
    public async Task UnknownToken_ReturnsInvalidToken()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-token");

        var response = await client.GetAsync("/api/v1/sync/pull");

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidToken);
    }

    [Fact]
    public async Task MissingToken_ReturnsInvalidToken()
    {
        var response = await _factory.CreateClient().GetAsync("/api/v1/devices");

        await ProblemAssert.HasCodeAsync(response, 401, ErrorCodes.InvalidToken);
    }

    [Fact]
    public async Task IssuingToken_UpdatesLastSeen()
    {
        using var device = await _factory.PairNewDeviceAsync();
        _factory.Time.Advance(TimeSpan.FromMinutes(5));

        var client = await _factory.CreateAuthenticatedClientAsync(device);

        var devices = await client.GetFromJsonAsync<List<DeviceListItemDTO>>("/api/v1/devices", TestWebApplicationFactory.Json);
        var current = Assert.Single(devices!, d => d.IsCurrent);
        Assert.Equal(_factory.Time.GetUtcNow(), current.LastSeenAt, TimeSpan.FromSeconds(1));
        Assert.True(current.LastSeenAt > current.CreatedAt);
    }
}
