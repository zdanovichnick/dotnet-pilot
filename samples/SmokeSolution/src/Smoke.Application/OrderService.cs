using Smoke.Domain;

namespace Smoke.Application;

public interface IOrderService
{
    Task<Guid> PlaceAsync(string customer, decimal total, CancellationToken ct);
}

public interface IPaymentGateway
{
    Task ChargeAsync(Guid orderId, decimal amount, CancellationToken ct);
}

public sealed class OrderService(IOrderRepository orders, IPaymentGateway payments) : IOrderService
{
    public async Task<Guid> PlaceAsync(string customer, decimal total, CancellationToken ct)
    {
        var order = new Order { Id = Guid.NewGuid(), Customer = customer, Total = total };
        await orders.AddAsync(order, ct);
        await payments.ChargeAsync(order.Id, total, ct);
        return order.Id;
    }
}
