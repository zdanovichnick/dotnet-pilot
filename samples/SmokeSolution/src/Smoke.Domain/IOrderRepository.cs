namespace Smoke.Domain;

public interface IOrderRepository
{
    Task<Order?> FindAsync(Guid id, CancellationToken ct);
    Task AddAsync(Order order, CancellationToken ct);
}
