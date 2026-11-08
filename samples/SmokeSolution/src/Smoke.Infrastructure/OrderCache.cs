using Smoke.Domain;

namespace Smoke.Infrastructure;

public sealed class OrderCache(IOrderRepository orders)
{
    private readonly Dictionary<Guid, Order> _cache = [];

    public async Task<Order?> GetAsync(Guid id, CancellationToken ct)
    {
        if (_cache.TryGetValue(id, out var hit))
            return hit;

        var order = await orders.FindAsync(id, ct);
        if (order is not null)
            _cache[id] = order;
        return order;
    }
}
