---
name: vertical-slice
description: Vertical Slice Architecture (VSA) for .NET APIs — feature-first folder structure, IEndpointGroup pattern, cross-cutting concerns, and testing approach.
---

# Vertical Slice Architecture

Reference material for structuring .NET APIs by feature rather than by layer.

## Core Concept

Organize code by **feature (vertical slice)**, not by technical layer (horizontal). Each slice owns everything needed for one feature: endpoint, handler, DTOs, validation. Two features never share request/response types — coupling through shared DTOs is how VSA projects collapse back into layered code.

**Use when**: ≤10 aggregates, CRUD-heavy API, team prefers feature-branch isolation, or Clean Architecture feels like over-engineering.

**Avoid when**: rich domain model with 10+ aggregates, complex cross-aggregate business rules, or event sourcing is on the roadmap — prefer Clean Architecture or DDD instead. See `knowledge/decisions/adr-005-multi-architecture.md`.

## Folder Structure

```
src/MyApp/
  Features/
    Orders/
      CreateOrder/
        CreateOrderEndpoint.cs     # IEndpointGroup implementation
        CreateOrderHandler.cs      # Command handler (or inline in endpoint)
        CreateOrderRequest.cs      # Input DTO record
        CreateOrderResponse.cs     # Output DTO record
        CreateOrderValidator.cs    # FluentValidation validator
      GetOrder/
        GetOrderEndpoint.cs
        GetOrderQuery.cs
        GetOrderResponse.cs
      CancelOrder/
        CancelOrderEndpoint.cs
        CancelOrderCommand.cs
  Domain/                          # Shared only if 2+ features use it
    Orders/
      Order.cs
      OrderStatus.cs
  Infrastructure/
    Persistence/
      AppDbContext.cs
      Configurations/
  Program.cs
```

The `Domain/` folder is for shared domain concepts only. If only one feature references an entity, keep it inside that feature's folder.

## IEndpointGroup Pattern

Each feature registers its own route via `IEndpointGroup`. The interface is registered and scanned in `Program.cs`.

```csharp
public interface IEndpointGroup
{
    void MapEndpoints(IEndpointRouteBuilder app);
}
```

```csharp
// Features/Orders/CreateOrder/CreateOrderEndpoint.cs
public class CreateOrderEndpoint : IEndpointGroup
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        app.MapPost("/orders", HandleAsync)
            .WithName("CreateOrder")
            .WithOpenApi()
            .AddEndpointFilter<ValidationFilter<CreateOrderRequest>>()
            .RequireAuthorization();
    }

    private static async Task<IResult> HandleAsync(
        CreateOrderRequest request,
        AppDbContext db,
        CancellationToken ct)
    {
        var order = new Order(request.CustomerId, request.Items);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return TypedResults.Created($"/orders/{order.Id}", new CreateOrderResponse(order.Id));
    }
}
```

```csharp
// Program.cs — scan and register all IEndpointGroup implementations
var endpointGroups = typeof(Program).Assembly
    .GetTypes()
    .Where(t => t.IsAssignableTo(typeof(IEndpointGroup)) && !t.IsAbstract)
    .Select(Activator.CreateInstance)
    .Cast<IEndpointGroup>();

foreach (var group in endpointGroups)
    group.MapEndpoints(app);
```

## DTOs

Use records. Never share request/response types between features — duplication here is intentional and correct.

```csharp
// CreateOrderRequest.cs
public record CreateOrderRequest(Guid CustomerId, IReadOnlyList<OrderItemRequest> Items);
public record OrderItemRequest(Guid ProductId, int Quantity);

// CreateOrderResponse.cs
public record CreateOrderResponse(Guid OrderId);
```

## Validation

Use FluentValidation per-request. Wire via a generic endpoint filter so individual endpoints don't repeat the call.

```csharp
// Features/Orders/CreateOrder/CreateOrderValidator.cs
public class CreateOrderValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty();
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.Quantity).GreaterThan(0);
        });
    }
}
```

```csharp
// Infrastructure/Filters/ValidationFilter.cs
public class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var request = ctx.GetArgument<T>(0);
        var result = await validator.ValidateAsync(request);
        if (!result.IsValid)
            return TypedResults.ValidationProblem(result.ToDictionary());
        return await next(ctx);
    }
}
```

Register validators and the filter in DI:

```csharp
builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddScoped(typeof(ValidationFilter<>));
```

## Cross-Cutting Concerns

Handle via endpoint filters, not base classes:

| Concern | Approach |
|---------|----------|
| Validation | `ValidationFilter<TRequest>` |
| Authentication | `.RequireAuthorization()` or policy |
| Logging / timing | `LoggingFilter` via `AddEndpointFilter` |
| Rate limiting | `RateLimiterOptions` + `.RequireRateLimiting()` |

## Extracting to Shared Domain

Extract to `Domain/` **only** when two or more feature slices reference the same concept and it carries meaningful behavior (not just a DTO shape):

- `Order` entity referenced by `CreateOrder`, `CancelOrder`, `GetOrder` → extract to `Domain/Orders/`
- `OrderStatus` enum used across multiple features → extract
- `CreateOrderRequest` used by only one feature → keep it in the feature folder

The `Domain/` folder must stay infrastructure-free: no EF Core attributes, no HTTP types, no Polly.

## Testing

Test each slice independently. Use `WebApplicationFactory` for full-stack slice tests.

```csharp
public class CreateOrderTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task CreateOrder_ValidRequest_ReturnsCreated()
    {
        var client = factory.CreateClient();
        var request = new CreateOrderRequest(Guid.NewGuid(), [new(Guid.NewGuid(), 2)]);

        var response = await client.PostAsJsonAsync("/orders", request);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }
}
```

For handler-only unit tests, instantiate the handler directly and pass a real or in-memory DbContext — avoid mocking `DbContext`.

## Do / Don't

| Do | Don't |
|----|-------|
| Keep each feature folder self-contained | Share Request/Response DTOs between features |
| Use endpoint filters for cross-cutting concerns | Create `BaseHandler` or `BaseEndpoint` base classes |
| Extract to `Domain/` only when truly shared | Put infrastructure code (EF, HTTP) in `Domain/` |
| Name files `<Action><Feature><Suffix>` (e.g., `CreateOrderHandler.cs`) | Mix suffix conventions (`CreateOrderService.cs` + `GetOrderHandler.cs`) |
| Test slices via `WebApplicationFactory` | Mock `DbContext` in slice tests |

## See Also

- `knowledge/decisions/adr-001-vsa-default.md` — why VSA is the default for new APIs
- `knowledge/decisions/adr-005-multi-architecture.md` — when to choose Clean Architecture or DDD instead
- `knowledge/common-infrastructure.md` — `IEndpointGroup` interface definition and bootstrap
