---
name: error-handling
description: Result pattern, ProblemDetails (RFC 7807), global exception boundaries, and typed error records for .NET APIs.
---

# Error Handling Patterns

Reference for structured error handling in .NET APIs. Used by `dnp-planner`, `dnp-api-scaffolder`, and `dnp-tdd-developer-hard`.

## Philosophy: When to Use Results vs Exceptions

| Scenario | Approach |
|----------|----------|
| Domain rule violation (not found, invalid state, business constraint) | `Result<TValue, TError>` — expected failure path |
| Infrastructure failure (DB timeout, network error, config missing) | Exception — unexpected, unrecoverable at call site |
| Validation failure (bad input from HTTP layer) | `ValidationProblemDetails` via model binding / FluentValidation |
| Unhandled exception escaping to HTTP | `GlobalExceptionHandler` → 500 ProblemDetails |

Never throw exceptions for expected domain outcomes. Never swallow exceptions at call sites.

## Result Type

Define in a shared location (e.g., `Common/Result.cs`):

```csharp
namespace MyApp.Common;

public readonly record struct Result<TValue, TError>
{
    private readonly TValue? _value;
    private readonly TError? _error;

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    private Result(TValue value) { _value = value; IsSuccess = true; }
    private Result(TError error) { _error = error; IsSuccess = false; }

    public static Result<TValue, TError> Success(TValue value) => new(value);
    public static Result<TValue, TError> Failure(TError error) => new(error);

    public TResult Match<TResult>(
        Func<TValue, TResult> onSuccess,
        Func<TError, TResult> onFailure)
        => IsSuccess ? onSuccess(_value!) : onFailure(_error!);

    public void Match(Action<TValue> onSuccess, Action<TError> onFailure)
    {
        if (IsSuccess) onSuccess(_value!);
        else onFailure(_error!);
    }
}
```

## Typed Error Records

Define errors as discriminated records in the domain layer:

```csharp
namespace MyApp.Domain.Errors;

public abstract record DomainError(string Message);

public record NotFoundError(string Resource, object Id)
    : DomainError($"{Resource} with id '{Id}' was not found.");

public record ConflictError(string Resource, string Reason)
    : DomainError($"{Resource} conflict: {Reason}");

public record ValidationError(string Field, string Reason)
    : DomainError($"Validation failed for '{Field}': {Reason}");

public record ForbiddenError(string Action, string Resource)
    : DomainError($"Not permitted to {Action} {Resource}.");
```

## Domain Service — Returning Results

```csharp
public class OrderService(IOrderRepository repo, ILogger<OrderService> logger)
{
    public async Task<Result<Order, DomainError>> GetByIdAsync(int id, CancellationToken ct)
    {
        var order = await repo.GetByIdAsync(id, ct);
        if (order is null)
            return Result<Order, DomainError>.Failure(new NotFoundError("Order", id));

        return Result<Order, DomainError>.Success(order);
    }

    public async Task<Result<Order, DomainError>> CancelAsync(int id, CancellationToken ct)
    {
        var order = await repo.GetByIdAsync(id, ct);
        if (order is null)
            return Result<Order, DomainError>.Failure(new NotFoundError("Order", id));

        if (order.Status == "Shipped")
            return Result<Order, DomainError>.Failure(
                new ConflictError("Order", "cannot cancel a shipped order"));

        order.Cancel();
        await repo.SaveChangesAsync(ct);
        return Result<Order, DomainError>.Success(order);
    }
}
```

## Mapping Results to HTTP (Minimal API)

```csharp
app.MapGet("/orders/{id}", async (int id, OrderService svc, CancellationToken ct) =>
{
    var result = await svc.GetByIdAsync(id, ct);
    return result.Match(
        order => TypedResults.Ok(order),
        error => MapError(error));
});

app.MapDelete("/orders/{id}/cancel", async (int id, OrderService svc, CancellationToken ct) =>
{
    var result = await svc.CancelAsync(id, ct);
    return result.Match(
        order => TypedResults.Ok(order),
        error => MapError(error));
});

static IResult MapError(DomainError error) => error switch
{
    NotFoundError e  => TypedResults.NotFound(new { e.Message }),
    ConflictError e  => TypedResults.Conflict(new { e.Message }),
    ForbiddenError e => TypedResults.Forbid(),
    ValidationError e => TypedResults.ValidationProblem(
        new Dictionary<string, string[]> { [e.Field] = [e.Reason] }),
    _ => TypedResults.Problem(error.Message, statusCode: 500)
};
```

## Mapping Results to HTTP (Controller)

```csharp
[ApiController]
[Route("api/[controller]")]
public class OrdersController(OrderService svc) : ControllerBase
{
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var result = await svc.GetByIdAsync(id, ct);
        return result.Match<IActionResult>(
            order => Ok(order),
            error => error switch
            {
                NotFoundError  => NotFound(new { error.Message }),
                ForbiddenError => Forbid(),
                _              => Problem(error.Message)
            });
    }
}
```

## ProblemDetails (RFC 7807)

ASP.NET Core returns `ProblemDetails` for 4xx/5xx by default when `AddProblemDetails()` is configured.

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Instance =
            $"{ctx.HttpContext.Request.Method} {ctx.HttpContext.Request.Path}";
        ctx.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier;
    };
});
```

Standard fields:

| Field | Description | Example |
|-------|-------------|---------|
| `status` | HTTP status code | `404` |
| `title` | Short human-readable summary | `"Not Found"` |
| `type` | URI identifying the problem type | `"https://tools.ietf.org/html/rfc7231#section-6.5.4"` |
| `detail` | Specific explanation for this occurrence | `"Order 42 was not found."` |
| `instance` | URI of the specific request | `"GET /orders/42"` |

## Global Exception Handler

Catches unhandled exceptions at the HTTP boundary. Infrastructure failures (DB, external services) bubble up here.

```csharp
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx,
        Exception exception,
        CancellationToken ct)
    {
        logger.LogError(exception,
            "Unhandled exception on {Method} {Path}",
            ctx.Request.Method,
            ctx.Request.Path);

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Type = "https://tools.ietf.org/html/rfc7231#section-6.6.1",
            Instance = $"{ctx.Request.Method} {ctx.Request.Path}"
        };

        ctx.Response.StatusCode = problem.Status.Value;
        await ctx.Response.WriteAsJsonAsync(problem, ct);
        return true;
    }
}
```

Registration:

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// In pipeline (before routing):
app.UseExceptionHandler();
```

## Exception Boundaries

Only catch exceptions at:
1. **HTTP layer** — `GlobalExceptionHandler` (unhandled infrastructure failures)
2. **Background job entry points** — `IHostedService.ExecuteAsync`, Hangfire job methods

```csharp
// Background job boundary
public class OrderSyncJob(OrderSyncService svc, ILogger<OrderSyncJob> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await svc.SyncPendingOrdersAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Order sync failed — retrying in 60s");
                await Task.Delay(TimeSpan.FromSeconds(60), ct);
            }
        }
    }
}
```

## Do / Don't

| Do | Don't |
|----|-------|
| Return `Result<TValue, TError>` for domain failures | Throw `DomainException` for expected failure paths |
| Define typed error records per domain concept | Use stringly-typed error messages |
| Catch exceptions only at HTTP/job boundaries | Catch `Exception` at the service or repository layer |
| Log at the boundary with full exception | Log the same exception multiple times as it propagates |
| Set `ClockSkew = TimeSpan.Zero` on JWT validation | Let expired tokens succeed within the default 5-minute window |
| Use `TypedResults` (compile-time checked) over `Results` | Mix `IActionResult` and `IResult` in the same endpoint |
| Include `traceId` in ProblemDetails extensions | Expose stack traces or internal exception messages to clients |

## See Also
- `skills/modern-csharp/SKILL.md` — record types and pattern matching used in error types
- `skills/aspnet-api-patterns/SKILL.md` — endpoint conventions that consume these patterns
