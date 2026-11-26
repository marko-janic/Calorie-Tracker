using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kcal.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddPortionSize : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "PortionSize",
                table: "Entries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PortionUnit",
                table: "Entries",
                type: "TEXT",
                maxLength: 10,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PortionSize",
                table: "Entries");

            migrationBuilder.DropColumn(
                name: "PortionUnit",
                table: "Entries");
        }
    }
}
