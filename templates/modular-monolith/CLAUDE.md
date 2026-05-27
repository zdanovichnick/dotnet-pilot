# Project: Modular Monolith

## Architecture

Each module is a separate class library project with a clean public API:
```
src/
  Modules/
    Orders/
      MyApp.Orders/             ← module implementation (internal)
        Features/               ← feature slices
        Persistence/
          OrdersDbContext.cs    ← module-owned DbContext
        OrdersModule.cs         ← public registration API
      MyApp.Orders.Contracts/   ← shared events/commands (public)
        Events/
          OrderCreatedEvent.cs
        Commands/
          CreateOrderCommand.cs
    Customers/
      MyApp.Customers/
      MyApp.Customers.Contracts/
  MyApp.Api/                    ← thin API layer, wires modules
    Program.cs
  MyApp.SharedKernel/           ← shared value objects, base types only
```

## Module Boundaries

### Public API (what other modules may use)
- Types in `*.Contracts` project only
- Integration events (implement `IIntegrationEvent`)
- Commands intended for cross-module use

### Internal (module-private)
- Feature handlers, DbContext, domain models — `internal` accessibility
- Other modules MUST NOT reference internal types

### Inter-Module Communication
Use Wolverine messaging (in-process by default, swappable to outbox/queue):
```csharp
// Publishing (Orders module):
await bus.PublishAsync(new OrderCreatedEvent(order.Id, order.CustomerId));

// Handling (Customers module):
public class OrderCreatedHandler
{
    public async Task Handle(OrderCreatedEvent @event, CancellationToken ct)
    {
        await _customerService.UpdateOrderCountAsync(@event.CustomerId, ct);
    }
}
```

## Key Conventions
- Each module registers itself: `services.AddOrdersModule(config)`
- No direct project reference between module implementations (only via Contracts)
- Shared kernel contains ONLY: value objects, base types, domain primitives — no services
- Each module owns its migrations: `dotnet ef migrations add --context OrdersDbContext`
