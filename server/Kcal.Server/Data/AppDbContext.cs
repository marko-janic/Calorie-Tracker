using Kcal.Server.Converters;
using Kcal.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Kcal.Server.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Entry> Entries => Set<Entry>();
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<PairingCode> PairingCodes => Set<PairingCode>();
    public DbSet<AccessToken> AccessTokens => Set<AccessToken>();
    public DbSet<ServerState> ServerState => Set<ServerState>();

    /// <summary>The id of this server, created once at the first start (8.3).</summary>
    public Task<Guid> GetServerIdAsync(CancellationToken cancellationToken = default) =>
        ServerState.Select(s => s.ServerId).SingleAsync(cancellationToken);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Timestamps are stored as ISO text in UTC, in the same format as on the wire
        var dateTimeOffsetConverter = new ValueConverter<DateTimeOffset, string>(
            v => TimestampFormats.FormatUtc(v),
            v => TimestampFormats.ParseUtc(v)
        );

        // EatenAt is stored with its local offset preserved, in the same format as on the wire
        var eatenAtConverter = new ValueConverter<DateTimeOffset, string>(
            v => TimestampFormats.FormatLocal(v),
            v => TimestampFormats.ParseLocal(v)
        );

        // DateOnly is stored as ISO date text (YYYY-MM-DD)
        var dateOnlyConverter = new ValueConverter<DateOnly, string>(
            v => v.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            v => DateOnly.ParseExact(v, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)
        );

        // Enum converters (store as lowercase text)
        var mealTypeConverter = new ValueConverter<MealType?, string?>(
            v => v.HasValue ? v.Value.ToString().ToLowerInvariant() : null,
            v => string.IsNullOrEmpty(v) ? null : Enum.Parse<MealType>(v, ignoreCase: true)
        );

        var sexConverter = new ValueConverter<Sex, string>(
            v => v.ToString().ToLowerInvariant(),
            v => Enum.Parse<Sex>(v, ignoreCase: true)
        );

        var activityLevelConverter = new ValueConverter<ActivityLevel, string>(
            v => System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(v.ToString()),
            v => Enum.Parse<ActivityLevel>(v, ignoreCase: true)
        );

        // Entry
        modelBuilder.Entity<Entry>(entity =>
        {
            entity.ToTable("Entries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.MealType).HasConversion(mealTypeConverter).HasMaxLength(20);
            entity.Property(e => e.Notes).HasMaxLength(1000);
            entity.Property(e => e.EatenAt).HasConversion(eatenAtConverter);
            entity.Property(e => e.EatenLocalDate).HasConversion(dateOnlyConverter);
            entity.Property(e => e.LoggedAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.UpdatedAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.ServerUpdatedAt).HasConversion(dateTimeOffsetConverter);

            entity.HasIndex(e => e.Version).IsUnique();
            entity.HasIndex(e => e.EatenLocalDate);
        });

        // Profile
        modelBuilder.Entity<Profile>(entity =>
        {
            entity.ToTable("Profiles");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Sex).HasConversion(sexConverter).IsRequired().HasMaxLength(10);
            entity.Property(e => e.ActivityLevel).HasConversion(activityLevelConverter).IsRequired().HasMaxLength(20);
            entity.Property(e => e.GoalKgPerWeek).IsRequired();
            entity.Property(e => e.UpdatedAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.ServerUpdatedAt).HasConversion(dateTimeOffsetConverter);
        });

        // Device
        modelBuilder.Entity<Device>(entity =>
        {
            entity.ToTable("Devices");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PublicKeySpki).IsRequired();
            entity.Property(e => e.CreatedAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.LastSeenAt).HasConversion(dateTimeOffsetConverter);
        });

        // PairingCode
        modelBuilder.Entity<PairingCode>(entity =>
        {
            entity.ToTable("PairingCodes");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.CodeHash).IsRequired();
            entity.Property(e => e.CreatedBy).IsRequired().HasMaxLength(50);
            entity.Property(e => e.CreatedAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.ExpiresAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.UsedAt).HasConversion(dateTimeOffsetConverter);

            entity.HasIndex(e => e.CodeHash).IsUnique();
        });

        // AccessToken
        modelBuilder.Entity<AccessToken>(entity =>
        {
            entity.ToTable("AccessTokens");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.TokenHash).IsRequired();
            entity.Property(e => e.CreatedAt).HasConversion(dateTimeOffsetConverter);
            entity.Property(e => e.ExpiresAt).HasConversion(dateTimeOffsetConverter);

            entity.HasIndex(e => e.TokenHash).IsUnique();
        });

        // ServerState
        modelBuilder.Entity<ServerState>(entity =>
        {
            entity.ToTable("ServerState");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.CreatedAt).HasConversion(dateTimeOffsetConverter);
        });
    }
}
