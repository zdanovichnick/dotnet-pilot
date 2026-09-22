## Mapping Results to HTTP (Controller)

```csharp
[ApiController]
[Route("api/[controller]")]
public class OrdersController(OrderService svc) : ControllerBase
{
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var result = await svc.CancelAsync(id, ct);
        return result.Match<IActionResult>(
            order => Ok(order),
            error => error switch
            {
                NotFoundError  => Problem(error.Message, statusCode: StatusCodes.Status404NotFound),
                ConflictError  => Problem(error.Message, statusCode: StatusCodes.Status409Conflict),
                ForbiddenError => Problem(error.Message, statusCode: StatusCodes.Status403Forbidden),
                _              => Problem(error.Message)
            });
    }
}
```

`ControllerBase.Problem(...)` goes through `ProblemDetailsFactory`, so the RFC 9110 `type` URI and
the `CustomizeProblemDetails` callback apply here too.

## Exception Boundaries

Only catch exceptions at:
1. **HTTP layer** — `GlobalExceptionHandler` (unhandled infrastructure failures)
2. **Background job entry points** — `BackgroundService.ExecuteAsync`, Hangfire job methods

```csharp
public class OrderSyncJob(OrderSyncService svc, ILogger<OrderSyncJob> logger) : BackgroundService
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

An exception escaping `ExecuteAsync` stops the host by default
(`BackgroundServiceExceptionBehavior.StopHost`, .NET 6+) — the catch-and-retry loop is what keeps the
worker alive.
