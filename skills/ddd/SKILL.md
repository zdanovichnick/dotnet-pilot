---
name: ddd
description: Domain-Driven Design patterns for .NET — aggregates, value objects, strongly-typed IDs, domain events, repositories, and layer rules.
---

# Domain-Driven Design Patterns

Reference material for applying DDD tactical patterns in .NET. Used by `dnp-architect` and `dnp-planner`.

## When to Use DDD

Use DDD when: 3+ aggregates with complex business rules, cross-aggregate invariants that need enforcement, or event sourcing is being considered. For simpler CRUD-heavy APIs, Vertical Slice Architecture is lower ceremony. See `knowledge/decisions/adr-005-multi-architecture.md`.

## Aggregate Root Base

All changes to an aggregate go through the root — never modify child entities directly from outside.

```csharp
// Domain/Common/AggregateRoot.cs
public abstract class AggregateRoot<TId>
{
    private readonly List<IDomainEvent> _events = [];
    public TId Id { get; protected set; } = default!;
    public IReadOnlyList<IDomainEvent> DomainEvents => _events.AsReadOnly();
    protected void Raise(IDomainEvent @event) => _events.Add(@event);
    public void ClearEvents() => _events.Clear();
}
```

## Aggregate Example

```csharp
// Domain/Orders/Order.cs
public sealed class Order : AggregateRoot<OrderId>
{
    private readonly List<OrderItem> _items = [];
    public IReadOnlyList<OrderItem> Items => _items.AsReadOnly();
    public CustomerId CustomerId { get; private set; } = null!;
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; } = Money.Zero;

    private Order() { } // required by EF Core

    public static Order Create(CustomerId customerId, IReadOnlyList<CreateOrderItemData> items)
    {
        ArgumentNullException.ThrowIfNull(customerId);
        if (items.Count == 0) throw new DomainException("Order must have at least one item.");

        var order = new Order
        {
            Id = OrderId.New(),
            CustomerId = customerId,
            Status = OrderStatus.Pending
        };

        foreach (var item in items)
            order._items.Add(OrderItem.Create(item));

        order.Total = order._items.Aggregate(Money.Zero, (sum, i) => sum + i.LineTotal);
        order.Raise(new OrderCreatedEvent(order.Id, customerId));
        return order;
    }

    public Result<Unit, OrderError> Cancel()
    {
        if (Status == OrderStatus.Shipped)
            return OrderError.CannotCancelShippedOrder;

        Status = OrderStatus.Cancelled;
        Raise(new OrderCancelledEvent(Id));
        return Result.Success(Unit.Value);
    }

    public Result<Unit, OrderError> AddItem(OrderItem item)
    {
        if (Status != OrderStatus.Pending)
            return OrderError.CannotModifyNonPendingOrder;

        _items.Add(item);
        Total = Total + item.LineTotal;
        return Result.Success(Unit.Value);
    }
}
```

Key rules:
- Private setters on all properties
- Private or protected parameterless constructor for EF Core
- Factory methods (`Create`) enforce invariants
- Business methods return `Result<TValue, TError>` — never throw for expected failures

## Value Objects

Immutable; equality by value, not identity. Use records.

```csharp
// Domain/Common/Money.cs
public sealed record Money(decimal Amount, string Currency)
{
    public static readonly Money Zero = new(0, "USD");

    public static Money Of(decimal amount, string currency)
    {
        if (amount < 0) throw new DomainException("Money amount cannot be negative.");
        return new(amount, currency);
    }

    public static Money operator +(Money a, Money b)
    {
        if (a.Currency != b.Currency) throw new DomainException("Cannot add different currencies.");
        return new(a.Amount + b.Amount, a.Currency);
    }

    public override string ToString() => $"{Amount:F2} {Currency}";
}
```

## Strongly-Typed IDs

Wrap `Guid` (or `int`) to prevent mixing IDs across types at compile time.

```csharp
// Domain/Orders/OrderId.cs
public sealed record OrderId(Guid Value)
{
    public static OrderId New() => new(Guid.NewGuid());
    public static OrderId From(Guid value) => new(value);
    public override string ToString() => Value.ToString();
}
```

### EF Core Value Converter

Configure in the entity's `IEntityTypeConfiguration`:

```csharp
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id)
            .HasConversion(id => id.Value, value => OrderId.From(value));
        builder.Property(o => o.CustomerId)
            .HasConversion(id => id.Value, value => CustomerId.From(value));
        builder.Property(o => o.Total)
            .HasConversion(m => m.Amount, value => Money.Of(value, "USD"))
            .HasColumnName("TotalAmount");
        builder.OwnsMany(o => o.Items, items =>
        {
            items.WithOwner().HasForeignKey("OrderId");
            items.Property(i => i.ProductId)
                .HasConversion(id => id.Value, value => ProductId.From(value));
        });
    }
}
```

## Domain Events

Raise events inside aggregates; publish after `SaveChangesAsync` completes so the DB write is committed first.

```csharp
// Domain/Orders/Events/OrderCreatedEvent.cs
public sealed record OrderCreatedEvent(OrderId OrderId, CustomerId CustomerId) : IDomainEvent
{
    public DateTime OccurredAt { get; } = DateTime.UtcNow;
}
```

Publishing after save (in a `SaveChangesInterceptor` or Application layer):

```csharp
public class DomainEventPublisher(IPublisher publisher)
{
    public async Task PublishAndClearAsync(IEnumerable<AggregateRoot<object>> aggregates, CancellationToken ct)
    {
        var events = aggregates.SelectMany(a => a.DomainEvents).ToList();
        foreach (var aggregate in aggregates)
            aggregate.ClearEvents();
        foreach (var @event in events)
            await publisher.Publish(@event, ct);
    }
}
```

## Repository Interface

Define in the Domain layer. Implement in Infrastructure. The interface must not expose `IQueryable` — that leaks EF Core into the domain.

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

Infrastructure implementation:

```csharp
// Infrastructure/Persistence/Repositories/OrderRepository.cs
public class OrderRepository(AppDbContext db) : IOrderRepository
{
    public Task<Order?> GetByIdAsync(OrderId id, CancellationToken ct)
        => db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<IReadOnlyList<Order>> GetByCustomerAsync(CustomerId customerId, CancellationToken ct)
        => db.Orders.Where(o => o.CustomerId == customerId).ToListAsync(ct)
            .ContinueWith(t => (IReadOnlyList<Order>)t.Result, ct);

    public void Add(Order order) => db.Orders.Add(order);
    public void Remove(Order order) => db.Orders.Remove(order);
}
```

## Domain Services

For logic that doesn't belong to a single aggregate:

```csharp
// Domain/Orders/PricingService.cs
public class PricingService(IProductRepository products)
{
    public async Task<Money> CalculateTotalAsync(
        IReadOnlyList<OrderItem> items,
        CancellationToken ct)
    {
        var total = Money.Zero;
        foreach (var item in items)
        {
            var product = await products.GetByIdAsync(item.ProductId, ct)
                ?? throw new DomainException($"Product {item.ProductId} not found.");
            total = total + Money.Of(product.Price.Amount * item.Quantity, product.Price.Currency);
        }
        return total;
    }
}
```

## Layer Rules

| Layer | Allowed dependencies | Forbidden |
|-------|---------------------|-----------|
| Domain | None | EF Core, HTTP, Polly, FluentValidation, MediatR |
| Application | Domain | EF Core (DbContext), HTTP, framework types |
| Infrastructure | Domain, Application | Domain interfaces must flow only inward |
| API | Application | Domain (except DTOs) |

Enforce via `dotnet-pilot`'s architecture check: `mcp__roslyn__check_architecture_violations`.

## Result Pattern

Prefer `Result<TValue, TError>` over exceptions for expected domain failures:

```csharp
// Domain/Common/Result.cs
public readonly struct Result<TValue, TError>
{
    private readonly TValue? _value;
    private readonly TError? _error;
    public bool IsSuccess { get; }

    private Result(TValue value) { _value = value; IsSuccess = true; _error = default; }
    private Result(TError error) { _error = error; IsSuccess = false; _value = default; }

    public static Result<TValue, TError> Success(TValue value) => new(value);
    public static implicit operator Result<TValue, TError>(TError error) => new(error);

    public TResult Match<TResult>(Func<TValue, TResult> onSuccess, Func<TError, TResult> onFailure)
        => IsSuccess ? onSuccess(_value!) : onFailure(_error!);
}
```

## See Also

- `knowledge/decisions/adr-005-multi-architecture.md` — when to choose DDD vs VSA vs Clean Architecture
- `skills/clean-architecture/SKILL.md` — layer wiring and project reference rules
- `skills/ef-core-patterns/SKILL.md` — EF Core configuration for DDD entities
