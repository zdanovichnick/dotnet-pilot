---
name: ddd
description: Domain-Driven Design patterns for .NET — aggregates, value objects, strongly-typed IDs, domain events, repositories, and the DDD variant of the layer rules.
when_to_use: Modelling aggregates, value objects, domain events, or strongly-typed IDs; reviewing a Domain project for leaked infrastructure.
---

# Domain-Driven Design Patterns

Reference material for applying DDD tactical patterns in .NET. Business methods return the
`Result<TValue, TError>` / `Result<Done, TError>` type defined in `skills/error-handling/SKILL.md`.

## When to Use DDD

Aggregate count is a weak signal; the shape of the rules decides. Use DDD when invariants span
several entities and must hold on every write, when business rules outgrow CRUD, or when event
sourcing is planned. When most operations read or write a single entity with little logic,
Vertical Slice Architecture is lower ceremony. See `knowledge/decisions/adr-005-multi-architecture.md`.

## Aggregate Root Base

All changes to an aggregate go through the root — never modify child entities directly from outside.

```csharp
// Domain/Common/AggregateRoot.cs
public interface IHasDomainEvents
{
    IReadOnlyList<IDomainEvent> DomainEvents { get; }
    void ClearEvents();
}

public abstract class AggregateRoot<TId> : IHasDomainEvents
{
    private readonly List<IDomainEvent> _events = [];
    public TId Id { get; protected set; } = default!;
    public IReadOnlyList<IDomainEvent> DomainEvents => _events.AsReadOnly();
    protected void Raise(IDomainEvent @event) => _events.Add(@event);
    public void ClearEvents() => _events.Clear();
}
```

The non-generic `IHasDomainEvents` exists because `AggregateRoot<OrderId>` is not an
`AggregateRoot<object>` — classes are invariant, so infrastructure that collects events across
aggregates (interceptors, dispatchers) needs a non-generic handle.

## Aggregate Example

```csharp
// Domain/Orders/Order.cs
public sealed class Order : AggregateRoot<OrderId>
{
    private readonly List<OrderItem> _items = [];
    public IReadOnlyList<OrderItem> Items => _items.AsReadOnly();
    public CustomerId CustomerId { get; private set; } = null!;
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; } = null!;

    private Order() { } // required by EF Core

    public static Result<Order, DomainError> Create(
        CustomerId customerId, IReadOnlyList<CreateOrderItemData> items, TimeProvider clock)
    {
        if (items.Count == 0)
            return new ValidationError(nameof(items), "Order must have at least one item.");

        var order = new Order { Id = OrderId.New(), CustomerId = customerId, Status = OrderStatus.Pending };
        order._items.AddRange(items.Select(OrderItem.Create));
        order.Total = order._items.Select(i => i.LineTotal).Aggregate((a, b) => a + b);
        order.Raise(new OrderCreatedEvent(order.Id, customerId, clock.GetUtcNow()));
        return order;
    }

    public Result<Done, DomainError> Cancel(TimeProvider clock)
    {
        if (Status == OrderStatus.Shipped)
            return new ConflictError("Order", "cannot cancel a shipped order");

        Status = OrderStatus.Cancelled;
        Raise(new OrderCancelledEvent(Id, clock.GetUtcNow()));
        return Done.Value;
    }
}
```

Key rules:
- Private setters on all properties; a private parameterless constructor for EF Core
- Factory methods (`Create`) enforce invariants and return a `Result` for rejectable input
- Throw only for broken preconditions a correct caller never sends (a programming error), not for
  business outcomes
- Take `TimeProvider` (BCL, no package) instead of reading `DateTime.UtcNow` — timestamps become
  testable with `FakeTimeProvider`

## Value Objects

Immutable; equality by value, not identity. Use records.

```csharp
// Domain/Common/Money.cs
public sealed record Money(decimal Amount, string Currency)
{
    public static Money Zero(string currency) => new(0, currency);

    public static Money operator +(Money a, Money b)
    {
        if (a.Currency != b.Currency) throw new InvalidOperationException("Cannot add different currencies.");
        return new(a.Amount + b.Amount, a.Currency);
    }
}
```

A shared `Money.Zero` constant with a hard-coded currency is a trap: summing it with a non-USD
line throws. Seed a sum from the first element, or pass the currency in.

## Strongly-Typed IDs

Wrap `Guid` (or `int`) to prevent mixing IDs across types at compile time.

```csharp
// Domain/Orders/OrderId.cs
public sealed record OrderId(Guid Value)
{
    public static OrderId New() => new(Guid.CreateVersion7());
    public static OrderId From(Guid value) => new(value);
    public override string ToString() => Value.ToString();
}
```

`Guid.CreateVersion7()` (.NET 9+) is time-ordered, so it doesn't fragment a clustered index the way
`Guid.NewGuid()` does.

EF Core mapping for IDs (value converters) and multi-column value objects like `Money`
(`ComplexProperty`, not a single-column converter): `references/ef-mapping.md`.

## Domain Events

Raise events inside aggregates. Publish after `SaveChangesAsync` completes, so the DB write is
committed first.

```csharp
// Domain/Orders/Events/OrderCreatedEvent.cs
public sealed record OrderCreatedEvent(OrderId OrderId, CustomerId CustomerId, DateTimeOffset OccurredAt)
    : IDomainEvent;
```

Publishing after save, from a `SaveChangesInterceptor` or the Application layer.
`IDomainEventDispatcher` is an Application-layer interface. Domain events must not implement
MediatR's `INotification`, because the Domain takes no packages — adapt them in the dispatcher instead.

```csharp
public class DomainEventPublisher(IDomainEventDispatcher dispatcher)
{
    public async Task PublishAndClearAsync(IReadOnlyList<IHasDomainEvents> aggregates, CancellationToken ct)
    {
        var events = aggregates.SelectMany(a => a.DomainEvents).ToList();
        foreach (var aggregate in aggregates)
            aggregate.ClearEvents();
        foreach (var @event in events)
            await dispatcher.DispatchAsync(@event, ct);
    }
}
```

## Repository Interface

One repository per aggregate root, never per child entity. It must not expose `IQueryable`, which
would leak EF Core into its consumers.

```csharp
// Domain/Orders/IOrderRepository.cs
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct);
    Task<IReadOnlyList<Order>> GetByCustomerAsync(CustomerId customerId, CancellationToken ct);
    void Add(Order order);
    void Remove(Order order);
}
```

```csharp
// Infrastructure/Persistence/Repositories/OrderRepository.cs
public class OrderRepository(AppDbContext db) : IOrderRepository
{
    // Owned collections (OwnsMany) load with their owner — no Include needed.
    public Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct)
        => db.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task<IReadOnlyList<Order>> GetByCustomerAsync(CustomerId customerId, CancellationToken ct)
        => await db.Orders.Where(o => o.CustomerId == customerId).ToListAsync(ct);

    public void Add(Order order) => db.Orders.Add(order);
    public void Remove(Order order) => db.Orders.Remove(order);
}
```

## Domain Services

For logic that doesn't belong to a single aggregate. A lookup that can miss returns a `Result`,
not an exception:

```csharp
// Domain/Orders/PricingService.cs
public class PricingService(IProductRepository products)
{
    public async Task<Result<Money, DomainError>> CalculateTotalAsync(
        IReadOnlyList<OrderItem> items, string currency, CancellationToken ct)
    {
        var total = Money.Zero(currency);
        foreach (var item in items)
        {
            var product = await products.GetByIdAsync(item.ProductId, ct);
            if (product is null)
                return new NotFoundError("Product", item.ProductId);
            total += product.Price with { Amount = product.Price.Amount * item.Quantity };
        }
        return total;
    }
}
```

## Layer Rules — the DDD Variant

`skills/clean-architecture/SKILL.md` is the source of truth for layer rules. DDD changes one thing:

- **Repository interfaces live in Domain**, one per aggregate, next to the aggregate they load.
  Clean architecture's default puts them in Application. Pick one placement per solution and keep
  it; either way Infrastructure implements them, and Domain keeps zero project and package
  references (no EF Core, MediatR, FluentValidation or Polly).

The API project referencing Infrastructure as the composition root is expected, not a violation.
Check with `mcp__roslyn__check_architecture_violations`.

## See Also

- `skills/error-handling/SKILL.md` — `Result<TValue, TError>`, `Done`, and the `DomainError` records
- `skills/clean-architecture/SKILL.md` — layer wiring and project reference rules
- `skills/ef-core-patterns/SKILL.md` — EF Core configuration for DDD entities
- `knowledge/decisions/adr-005-multi-architecture.md` — when to choose DDD vs VSA vs Clean Architecture
