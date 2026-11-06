using System.Security.Cryptography;
using Kcal.Server.Auth;
using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Kcal.Server.Services;

/// <summary>Pairing codes and device registration (7.3).</summary>
public sealed class PairingService(AppDbContext db, IOptions<KcalOptions> options, TimeProvider time)
{
    public const string CreatedByCli = "cli";
    public const string CreatedByStartup = "startup";

    // Crockford base32 without I, L, O, U
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const int CodeLength = 8;

    /// <summary>Creates a single-use code. Only its hash is stored; the code itself is returned once.</summary>
    /// <param name="createdBy">"cli", "startup" or the id of the device that requested it.</param>
    public async Task<CreatePairingCodeResponseDTO> CreateCodeAsync(string createdBy, CancellationToken cancellationToken = default)
    {
        var code = new string(RandomNumberGenerator.GetItems<char>(Alphabet, CodeLength));
        var now = time.GetUtcNow();
        var pairingCode = new PairingCode
        {
            Id = Guid.CreateVersion7(now),
            CodeHash = DeviceCrypto.Sha256(code),
            CreatedAt = now,
            ExpiresAt = now + options.Value.PairingCodeLifetime,
            CreatedBy = createdBy
        };
        db.PairingCodes.Add(pairingCode);
        await db.SaveChangesAsync(cancellationToken);

        return new CreatePairingCodeResponseDTO($"{code[..4]}-{code[4..]}", pairingCode.ExpiresAt);
    }

    /// <summary>Creates the startup code if no device is paired yet (8.8 step 3), otherwise returns null.</summary>
    public async Task<CreatePairingCodeResponseDTO?> CreateStartupCodeIfUnpairedAsync(CancellationToken cancellationToken = default) =>
        await db.Devices.AnyAsync(cancellationToken)
            ? null
            : await CreateCodeAsync(CreatedByStartup, cancellationToken);

    /// <summary>
    /// Registers a device with a valid code. A wrong, expired or used code, a bad key or a bad
    /// signature all fail with the same invalid_pairing_code error.
    /// </summary>
    public async Task<PairResponseDTO> PairAsync(PairRequestDTO request, CancellationToken cancellationToken = default)
    {
        var normalizedCode = NormalizeCode(request.Code);
        if (normalizedCode is null || !DeviceCrypto.TryParsePublicKey(request.PublicKey, out var publicKeySpki))
        {
            throw ApiException.InvalidPairingCode();
        }

        var now = time.GetUtcNow();
        var codeHash = DeviceCrypto.Sha256(normalizedCode);
        var pairingCode = await db.PairingCodes.AsNoTracking()
            .SingleOrDefaultAsync(c => c.CodeHash == codeHash, cancellationToken);
        if (pairingCode is null || pairingCode.UsedAt is not null || pairingCode.ExpiresAt <= now)
        {
            throw ApiException.InvalidPairingCode();
        }

        var serverId = await db.GetServerIdAsync(cancellationToken);
        var message = $"kcal-pair-v1\n{serverId:D}\n{normalizedCode}\n{request.PublicKey}";
        if (!DeviceCrypto.VerifySignature(publicKeySpki, message, request.Signature))
        {
            throw ApiException.InvalidPairingCode();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Conditional update so that concurrent requests cannot use the same code twice
        var claimed = await db.PairingCodes
            .Where(c => c.Id == pairingCode.Id && c.UsedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.UsedAt, now), cancellationToken);
        if (claimed == 0)
        {
            throw ApiException.InvalidPairingCode();
        }

        var device = new Device
        {
            Id = Guid.CreateVersion7(now),
            Name = request.DeviceName.Trim(),
            PublicKeySpki = publicKeySpki,
            CreatedAt = now,
            LastSeenAt = now
        };
        db.Devices.Add(device);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new PairResponseDTO(device.Id, serverId);
    }

    /// <summary>
    /// Uppercase, drop dashes and spaces, map O to 0 and I/L to 1 (7.3).
    /// Returns null unless the result is 8 Crockford base32 characters.
    /// </summary>
    public static string? NormalizeCode(string input)
    {
        var normalized = input
            .ToUpperInvariant()
            .Replace("-", "")
            .Replace(" ", "")
            .Replace('O', '0')
            .Replace('I', '1')
            .Replace('L', '1');
        return normalized.Length == CodeLength && normalized.All(Alphabet.Contains) ? normalized : null;
    }
}
