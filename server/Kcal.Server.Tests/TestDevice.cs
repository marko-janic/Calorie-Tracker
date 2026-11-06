using System.Security.Cryptography;
using System.Text;

namespace Kcal.Server.Tests;

/// <summary>A P-256 device key that signs like a client (7.2).</summary>
public sealed class TestDevice(string name = "Test device") : IDisposable
{
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);

    public string Name { get; } = name;
    public Guid DeviceId { get; set; }
    public string PublicKey => Convert.ToBase64String(_key.ExportSubjectPublicKeyInfo());

    /// <summary>Base64 IEEE P1363 signature over the UTF-8 message.</summary>
    public string Sign(string message) => Convert.ToBase64String(
        _key.SignData(Encoding.UTF8.GetBytes(message), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));

    public void Dispose() => _key.Dispose();
}
