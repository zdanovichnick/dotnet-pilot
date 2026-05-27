---
name: common-antipatterns
description: Common C# .NET anti-patterns with BAD/GOOD examples. Referenced by agents during code review and refactoring.
---

# Common .NET Anti-Patterns

## async void

**BAD** — unhandled exceptions crash the process:
```csharp
public async void ProcessOrder(int orderId)
{
    var order = await _repo.GetAsync(orderId);
    await _payment.ChargeAsync(order);
}
```
**GOOD** — return `Task`, propagate exceptions properly:
```csharp
public async Task ProcessOrderAsync(int orderId, CancellationToken ct)
{
    var order = await _repo.GetAsync(orderId, ct);
    await _payment.ChargeAsync(order, ct);
}
```

## Sync-over-Async (.Result / .Wait())

**BAD** — deadlocks in ASP.NET context:
```csharp
var user = _userService.GetUserAsync(id).Result;
```
**GOOD** — await all the way:
```csharp
var user = await _userService.GetUserAsync(id, ct);
```

## Broad Exception Catch

**BAD** — swallows all errors including OOM, StackOverflow:
```csharp
try { await ProcessAsync(); }
catch (Exception) { return BadRequest(); }
```
**GOOD** — catch specific, expected exceptions:
```csharp
try { await ProcessAsync(ct); }
catch (OrderNotFoundException ex) { return NotFound(ex.Message); }
```

## DateTime.Now Instead of TimeProvider

**BAD** — not testable, not timezone-aware:
```csharp
var expires = DateTime.Now.AddHours(1);
```
**GOOD** — inject `TimeProvider`:
```csharp
public class TokenService(TimeProvider time)
{
    public DateTime GetExpiry() => time.GetUtcNow().AddHours(1).UtcDateTime;
}
```

## new HttpClient() Directly

**BAD** — socket exhaustion under load:
```csharp
var client = new HttpClient();
var result = await client.GetAsync(url);
```
**GOOD** — use IHttpClientFactory:
```csharp
public class PaymentClient(IHttpClientFactory factory)
{
    public async Task<string> GetAsync(string url, CancellationToken ct)
    {
        using var client = factory.CreateClient("payments");
        return await client.GetStringAsync(url, ct);
    }
}
```

## Missing CancellationToken on Async Methods

**BAD** — long-running operations cannot be cancelled:
```csharp
public async Task<List<Order>> GetOrdersAsync()
{
    return await _db.Orders.ToListAsync();
}
```
**GOOD** — propagate CancellationToken:
```csharp
public async Task<List<Order>> GetOrdersAsync(CancellationToken ct)
{
    return await _db.Orders.ToListAsync(ct);
}
```

## String Interpolation in Log Calls

**BAD** — string allocated even when log level is disabled:
```csharp
_logger.LogDebug($"Processing order {orderId} for user {userId}");
```
**GOOD** — structured logging with message template:
```csharp
_logger.LogDebug("Processing order {OrderId} for user {UserId}", orderId, userId);
```

## Repository Pattern Wrapping EF Core

**BAD** — adds a leaky abstraction over an already-abstracted ORM:
```csharp
public interface IOrderRepository { Task<Order?> GetByIdAsync(int id); }
public class OrderRepository(AppDbContext db) : IOrderRepository { ... }
```
**GOOD** — inject DbContext directly in application services; extract only for complex queries:
```csharp
public class OrderService(AppDbContext db)
{
    public async Task<Order?> GetByIdAsync(int id, CancellationToken ct)
        => await db.Orders.FindAsync([id], ct);
}
```

## EF Core: Loading Before Filtering

**BAD** — materializes entire table:
```csharp
var orders = await _db.Orders.ToListAsync();
var active = orders.Where(o => o.IsActive).ToList();
```
**GOOD** — filter in the query:
```csharp
var active = await _db.Orders.Where(o => o.IsActive).ToListAsync(ct);
```

## Thread.Sleep in Async Code

**BAD** — blocks a thread:
```csharp
Thread.Sleep(1000);
```
**GOOD** — async delay:
```csharp
await Task.Delay(TimeSpan.FromSeconds(1), ct);
```

## Catching and Re-throwing Without `throw`

**BAD** — loses original stack trace:
```csharp
catch (Exception ex) { throw ex; }
```
**GOOD** — bare throw preserves stack trace:
```csharp
catch (Exception) { throw; }
```

## Using `Count()` Instead of `Any()`

**BAD** — counts all items to check if any exist:
```csharp
if (_db.Orders.Count() > 0) ...
```
**GOOD** — stops at first match:
```csharp
if (await _db.Orders.AnyAsync(ct)) ...
```
