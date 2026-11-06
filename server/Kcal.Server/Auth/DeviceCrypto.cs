using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;

namespace Kcal.Server.Auth;

/// <summary>
/// Hashing and device key operations (7.2): ECDSA P-256 with SHA-256, public keys as
/// base64 SubjectPublicKeyInfo, signatures as base64 IEEE P1363 (r‖s, 64 bytes).
/// </summary>
public static class DeviceCrypto
{
    // SPKI DER header of an uncompressed P-256 public key; followed by the 65-byte point
    private static ReadOnlySpan<byte> P256SpkiPrefix =>
    [
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00
    ];

    private const int P256SpkiLength = 91;
    private const int SignatureLength = 64;

    /// <summary>SHA-256 of the UTF-8 bytes of <paramref name="value"/>.</summary>
    public static byte[] Sha256(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));

    /// <summary>Decodes a base64 SPKI and accepts it only if it is a valid P-256 public key.</summary>
    public static bool TryParsePublicKey(string publicKeyBase64, [NotNullWhen(true)] out byte[]? spki)
    {
        spki = null;
        var buffer = new byte[P256SpkiLength];
        if (!Convert.TryFromBase64String(publicKeyBase64, buffer, out var length)
            || length != P256SpkiLength
            || !buffer.AsSpan().StartsWith(P256SpkiPrefix))
        {
            return false;
        }

        try
        {
            // Validates that the point lies on the curve
            using var key = ECDsa.Create();
            key.ImportSubjectPublicKeyInfo(buffer, out _);
        }
        catch (CryptographicException)
        {
            return false;
        }

        spki = buffer;
        return true;
    }

    /// <summary>Verifies a base64 P1363 signature over the UTF-8 bytes of <paramref name="message"/>.</summary>
    public static bool VerifySignature(byte[] spki, string message, string signatureBase64)
    {
        var signature = new byte[SignatureLength];
        if (!Convert.TryFromBase64String(signatureBase64, signature, out var length) || length != SignatureLength)
        {
            return false;
        }

        try
        {
            using var key = ECDsa.Create();
            key.ImportSubjectPublicKeyInfo(spki, out _);
            return key.VerifyData(Encoding.UTF8.GetBytes(message), signature,
                HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }
}
