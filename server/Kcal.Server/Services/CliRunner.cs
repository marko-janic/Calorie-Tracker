using System.Globalization;
using Kcal.Server.Data;

namespace Kcal.Server.Services;

/// <summary>
/// Command line interface of the server binary (8.7), e.g. `kcal pair`.
/// Uses the same configuration (appsettings, environment variables, arguments) as the server.
/// </summary>
public static class CliRunner
{
    public static bool IsCommand(string[] args) => args is ["pair", ..];

    public static async Task<int> RunAsync(string[] args, TextWriter output)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.AddKcalCore();
        await using var app = builder.Build();
        await using var scope = app.Services.CreateAsyncScope();

        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
        var code = await scope.ServiceProvider.GetRequiredService<PairingService>()
            .CreateCodeAsync(PairingService.CreatedByCli);

        await output.WriteLineAsync(FormatPairingCode(code.Code, code.ExpiresAt));
        return 0;
    }

    /// <summary>"Pairing code: 7K2M-QX9D (valid until 12:40 UTC)"</summary>
    private static string FormatPairingCode(string code, DateTimeOffset expiresAt) =>
        string.Create(CultureInfo.InvariantCulture, $"Pairing code: {code} (valid until {expiresAt.UtcDateTime:HH:mm} UTC)");
}
