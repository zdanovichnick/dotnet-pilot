using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Smoke.Infrastructure;

// `dotnet ef` cannot build the Api host: its DI validation fails on the planted defects.
public sealed class SmokeDbContextFactory : IDesignTimeDbContextFactory<SmokeDbContext>
{
    public SmokeDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SmokeDbContext>().UseSqlite(SmokeDbContext.ConnectionString).Options);
}
