using System.Reflection;

namespace Kcal.Server;

/// <summary>Version information reported by the server (8.2, 8.4).</summary>
public static class ServerInfo
{
    public const int ApiVersion = 1;

    /// <summary>Raise whenever a server change breaks older apps.</summary>
    public const string MinAppVersion = "0.1.0";

    /// <summary>The assembly informational version (from /VERSION) without any +commit suffix.</summary>
    public static string Version { get; } =
        (typeof(ServerInfo).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? "0.0.0").Split('+')[0];
}
