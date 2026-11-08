using Smoke.Domain;

namespace Smoke.Infrastructure;

public sealed class OrderRepository(SmokeDbContext db) : IOrderRepository
{
    public async Task<Order?> FindAsync(Guid id, CancellationToken ct) =>
        await db.Orders.FindAsync([id], ct);

    public async Task AddAsync(Order order, CancellationToken ct)
    {
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
    }
}
