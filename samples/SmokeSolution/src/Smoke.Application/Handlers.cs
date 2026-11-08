namespace Smoke.Application;

public interface IOrderHandler
{
    string Name { get; }
}

public sealed class AuditHandler : IOrderHandler
{
    public string Name => "audit";
}

public sealed class NotifyHandler(IOrderService orders) : IOrderHandler
{
    public string Name => orders is null ? "" : "notify";
}

public sealed class HandlerRegistry(IEnumerable<IOrderHandler> handlers)
{
    public IReadOnlyList<string> Names => handlers.Select(h => h.Name).ToList();
}
