using Kcal.Server.Auth;
using Kcal.Server.Converters;
using Kcal.Server.Data;
using Kcal.Server.Endpoints;
using Kcal.Server.Hosting;
using Kcal.Server.Services;
using Microsoft.AspNetCore.HttpOverrides;

// 1. CLI commands, e.g. `kcal pair` (8.7)
if (CliRunner.IsCommand(args))
{
    return await CliRunner.RunAsync(args, Console.Out);
}

var builder = WebApplication.CreateBuilder(args);

// 2. Services (8.8)
builder.AddKcalCore();
builder.Services.AddValidation();
builder.Services.AddApiProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
builder.Services.ConfigureHttpJsonOptions(options => JsonConfig.ConfigureOptions(options.SerializerOptions));
builder.Services.AddDeviceTokenAuthentication();
builder.Services.AddAuthorization();
builder.Services.AddApiRateLimiting();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Only Caddy can reach the container: its port is not published (7.6)
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.AddScoped<SyncService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<DeviceService>();
builder.Services.AddHostedService<MaintenanceService>();
if (builder.Environment.IsDevelopment())
{
    // The Expo web dev server; in production the web UI is same-origin (7.6)
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:8081").AllowAnyHeader().AllowAnyMethod()));
}

var app = builder.Build();

// 3. Initialize: migrations, WAL, ServerState, startup pairing code
await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
    var startupCode = await scope.ServiceProvider.GetRequiredService<PairingService>().CreateStartupCodeIfUnpairedAsync();
    if (startupCode is not null)
    {
        // The pairing code is the intended exception to "no secrets in logs" (7.6)
        app.Logger.LogWarning("No device is paired yet. Pairing code: {PairingCode} (valid until {ExpiresAt:HH:mm} UTC)",
            startupCode.Code, startupCode.ExpiresAt.UtcDateTime);
    }
}

// 4. Middleware
app.UseForwardedHeaders();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (app.Environment.IsDevelopment())
{
    app.UseCors();
}
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseWebUi();

// 5. Endpoints
app.MapGroup("/api/v1")
    .MapHealthEndpoints()
    .MapAuthEndpoints()
    .MapDeviceEndpoints()
    .MapSyncEndpoints();
app.MapDownloadEndpoints();
app.MapOpenApi();
app.MapWebUiFallbacks();

app.Run();
return 0;

// Make Program accessible for testing
public partial class Program { }
