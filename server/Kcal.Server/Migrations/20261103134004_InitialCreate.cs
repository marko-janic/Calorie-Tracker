using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kcal.Server.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccessTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TokenHash = table.Column<byte[]>(type: "BLOB", nullable: false),
                    DeviceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<string>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccessTokens", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Devices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    PublicKeySpki = table.Column<byte[]>(type: "BLOB", nullable: false),
                    CreatedAt = table.Column<string>(type: "TEXT", nullable: false),
                    LastSeenAt = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Devices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Kcal = table.Column<double>(type: "REAL", nullable: false),
                    ProteinG = table.Column<double>(type: "REAL", nullable: true),
                    CarbsG = table.Column<double>(type: "REAL", nullable: true),
                    FatG = table.Column<double>(type: "REAL", nullable: true),
                    FibreG = table.Column<double>(type: "REAL", nullable: true),
                    Quantity = table.Column<double>(type: "REAL", nullable: false),
                    MealType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    EatenAt = table.Column<string>(type: "TEXT", nullable: false),
                    EatenLocalDate = table.Column<string>(type: "TEXT", nullable: false),
                    LoggedAt = table.Column<string>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<string>(type: "TEXT", nullable: false),
                    Deleted = table.Column<bool>(type: "INTEGER", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedByDeviceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ServerUpdatedAt = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Entries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PairingCodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CodeHash = table.Column<byte[]>(type: "BLOB", nullable: false),
                    CreatedAt = table.Column<string>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<string>(type: "TEXT", nullable: false),
                    UsedAt = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PairingCodes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Profiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Sex = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    BirthYear = table.Column<int>(type: "INTEGER", nullable: false),
                    HeightCm = table.Column<double>(type: "REAL", nullable: false),
                    WeightKg = table.Column<double>(type: "REAL", nullable: false),
                    BodyFatPercent = table.Column<double>(type: "REAL", nullable: true),
                    ActivityLevel = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    GoalKgPerWeek = table.Column<double>(type: "REAL", nullable: false),
                    TargetKcal = table.Column<double>(type: "REAL", nullable: true),
                    TargetProteinG = table.Column<double>(type: "REAL", nullable: true),
                    TargetCarbsG = table.Column<double>(type: "REAL", nullable: true),
                    TargetFatG = table.Column<double>(type: "REAL", nullable: true),
                    TargetFibreG = table.Column<double>(type: "REAL", nullable: true),
                    UpdatedAt = table.Column<string>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedByDeviceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ServerUpdatedAt = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Profiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ServerState",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ServerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LastSeq = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServerState", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccessTokens_TokenHash",
                table: "AccessTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Entries_EatenLocalDate",
                table: "Entries",
                column: "EatenLocalDate");

            migrationBuilder.CreateIndex(
                name: "IX_Entries_Version",
                table: "Entries",
                column: "Version",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PairingCodes_CodeHash",
                table: "PairingCodes",
                column: "CodeHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AccessTokens");

            migrationBuilder.DropTable(
                name: "Devices");

            migrationBuilder.DropTable(
                name: "Entries");

            migrationBuilder.DropTable(
                name: "PairingCodes");

            migrationBuilder.DropTable(
                name: "Profiles");

            migrationBuilder.DropTable(
                name: "ServerState");
        }
    }
}
