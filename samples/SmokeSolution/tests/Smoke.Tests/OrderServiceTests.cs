using Smoke.Application;
using Smoke.Domain;
using Xunit;

namespace Smoke.Tests;

public class OrderServiceTests
{
    [Fact]
    public async Task PlaceAsync_ValidOrder_StoresAndCharges()
    {
        var repo = new RecordingRepository();
        var gateway = new RecordingGateway();
        var service = new OrderService(repo, gateway);

        var id = await service.PlaceAsync("acme", 12.5m, CancellationToken.None);

        Assert.Equal(id, Assert.Single(repo.Added).Id);
        Assert.Equal((id, 12.5m), Assert.Single(gateway.Charges));
    }

    [Fact]
    public void SmokeFailure_WhenRequested_Fails()
    {
        // The host smoke checklist sets SMOKE_FAIL=1 to check that a red test is reported as red.
        Assert.NotEqual("1", Environment.GetEnvironmentVariable("SMOKE_FAIL"));
    }

    private sealed class RecordingRepository : IOrderRepository
    {
        public List<Order> Added { get; } = [];
        public Task<Order?> FindAsync(Guid id, CancellationToken ct) => Task.FromResult(Added.Find(o => o.Id == id));
        public Task AddAsync(Order order, CancellationToken ct) { Added.Add(order); return Task.CompletedTask; }
    }

    private sealed class RecordingGateway : IPaymentGateway
    {
        public List<(Guid, decimal)> Charges { get; } = [];
        public Task ChargeAsync(Guid orderId, decimal amount, CancellationToken ct) { Charges.Add((orderId, amount)); return Task.CompletedTask; }
    }
}
