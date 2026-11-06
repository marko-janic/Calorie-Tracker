using Kcal.Server.Data;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Kcal.Server.Services;

public static class ServiceRegistration
{
    /// <summary>
    /// Registers what both the web server and the CLI need: options, the clock, the database and pairing.
    /// </summary>
    public static IHostApplicationBuilder AddKcalCore(this IHostApplicationBuilder builder)
    {
        var dataDir = ResolveDataDir(builder);

        builder.Services.AddOptions<KcalOptions>()
            .Bind(builder.Configuration.GetSection(KcalOptions.SectionName))
            .Configure(options => options.DataDir = dataDir);
        builder.Services.TryAddSingleton(TimeProvider.System);
        builder.Services.AddDbContext<AppDbContext>(options =>
            options.UseSqlite($"Data Source={Path.Combine(dataDir, "kcal.db")}"));
        builder.Services.AddScoped<DatabaseInitializer>();
        builder.Services.AddScoped<PairingService>();
        return builder;
    }

    /// <summary>Kcal:DataDir, relative paths resolved against the content root (8.2).</summary>
    private static string ResolveDataDir(IHostApplicationBuilder builder)
    {
        var configured = builder.Configuration[$"{KcalOptions.SectionName}:{nameof(KcalOptions.DataDir)}"];
        var dataDir = string.IsNullOrEmpty(configured)
            ? builder.Environment.IsDevelopment() ? ".data" : "/data"
            : configured;
        return Path.GetFullPath(dataDir, builder.Environment.ContentRootPath);
    }
}
