using Microsoft.EntityFrameworkCore;
using Smoke.Domain;

namespace Smoke.Infrastructure;

public sealed class SmokeDbContext(DbContextOptions<SmokeDbContext> options) : DbContext(options)
{
    public const string ConnectionString = "Data Source=smoke.db";

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>().HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.OrderId);
        modelBuilder.Entity<Order>().Property(o => o.Total).HasPrecision(18, 2);
    }
}
