using System.Buffers.Text;
using System.Security.Cryptography;
using Kcal.Server.Auth;
using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Kcal.Server.Services;

/// <summary>Challenge-response authentication of paired devices (7.4).</summary>
public sealed class AuthService(AppDbContext db, IMemoryCache cache, IOptions<KcalOptions> options, TimeProvider time)
{
    private const int RandomBytes = 32;

    public async Task<ChallengeResponseDTO> CreateChallengeAsync(Guid deviceId, CancellationToken cancellationToken = default)
    {
        if (!await db.Devices.AnyAsync(d => d.Id == deviceId, cancellationToken))
        {
            throw ApiException.UnknownDevice();
        }

        var nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(RandomBytes));
        var expiresAt = time.GetUtcNow() + options.Value.ChallengeLifetime;
        cache.Set(CacheKey(nonce), new PendingChallenge(deviceId, expiresAt), options.Value.ChallengeLifetime);
        return new ChallengeResponseDTO(nonce, expiresAt);
    }

    public async Task<TokenResponseDTO> IssueTokenAsync(TokenRequestDTO request, CancellationToken cancellationToken = default)
    {
        var device = await db.Devices.SingleOrDefaultAsync(d => d.Id == request.DeviceId, cancellationToken)
            ?? throw ApiException.UnknownDevice();

        // The nonce is consumed by the first attempt, whether its signature is valid or not
        var now = time.GetUtcNow();
        var cacheKey = CacheKey(request.Nonce);
        if (!cache.TryGetValue(cacheKey, out PendingChallenge? challenge)
            || challenge is null
            || !challenge.TryConsume()
            || challenge.DeviceId != device.Id
            || challenge.ExpiresAt <= now)
        {
            throw ApiException.ChallengeExpired();
        }
        cache.Remove(cacheKey);

        var serverId = await db.GetServerIdAsync(cancellationToken);
        var message = $"kcal-auth-v1\n{serverId:D}\n{device.Id:D}\n{request.Nonce}";
        if (!DeviceCrypto.VerifySignature(device.PublicKeySpki, message, request.Signature))
        {
            throw ApiException.InvalidSignature();
        }

        var accessToken = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(RandomBytes));
        var expiresAt = now + options.Value.AccessTokenLifetime;
        db.AccessTokens.Add(new AccessToken
        {
            Id = Guid.CreateVersion7(now),
            TokenHash = DeviceCrypto.Sha256(accessToken),
            DeviceId = device.Id,
            CreatedAt = now,
            ExpiresAt = expiresAt
        });
        device.LastSeenAt = now;
        await db.SaveChangesAsync(cancellationToken);

        return new TokenResponseDTO(accessToken, expiresAt);
    }

    private static string CacheKey(string nonce) => $"auth-challenge:{nonce}";

    private sealed class PendingChallenge(Guid deviceId, DateTimeOffset expiresAt)
    {
        private int _consumed;

        public Guid DeviceId { get; } = deviceId;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;

        /// <summary>True only for the first caller, so a nonce is single use even under concurrency.</summary>
        public bool TryConsume() => Interlocked.Exchange(ref _consumed, 1) == 0;
    }
}
