---
name: logging
description: Serilog structured logging for ASP.NET Core — setup, message templates, LogContext enrichment, request logging middleware, and log level guidelines.
when_to_use: Adding Serilog to a service, writing or reviewing log statements, or checking what reaches a log sink.
---

# Serilog Structured Logging

Reference material for adding and using Serilog in ASP.NET Core.

## NuGet Packages

```xml
<PackageReference Include="Serilog.AspNetCore" Version="8.*" />
<PackageReference Include="Serilog.Enrichers.Environment" Version="3.*" />
<PackageReference Include="Serilog.Enrichers.Thread" Version="4.*" />
<PackageReference Include="Serilog.Formatting.Compact" Version="3.*" />
<!-- Add sinks as needed: -->
<PackageReference Include="Serilog.Sinks.OpenTelemetry" Version="4.*" />
```

## Setup — Program.cs

Replace the default ASP.NET Core logging before `builder.Build()`:

```csharp
builder.Host.UseSerilog((context, config) =>
    config
        .ReadFrom.Configuration(context.Configuration)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithThreadId()
        .WriteTo.Console(new CompactJsonFormatter())
        .WriteTo.OpenTelemetry()); // swap/add sinks as needed
```

For early startup errors, bootstrap a minimal logger before the host is built:

```csharp
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();
try
{
    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog((ctx, cfg) => cfg.ReadFrom.Configuration(ctx.Configuration)...);
    // ...
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application startup failed.");
}
finally
{
    Log.CloseAndFlush();
}
```

## appsettings.json Configuration

```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Microsoft.EntityFrameworkCore": "Warning",
        "Microsoft.EntityFrameworkCore.Database.Command": "Warning",
        "System": "Warning"
      }
    }
  }
}
```

Flip EF Core's `Database.Command` override to `Information` temporarily when debugging query issues; revert before shipping.

## Structured Logging — Message Templates

Always use **message templates**, never string interpolation. Interpolation loses the structured property; templates capture it.

```csharp
// CORRECT — structured properties captured
_logger.LogInformation("Order {OrderId} created for customer {CustomerId}", order.Id, order.CustomerId);
_logger.LogWarning("Payment failed for order {OrderId}: {Reason}", orderId, reason);
_logger.LogError(ex, "Failed to process order {OrderId}", orderId);

// WRONG — interpolated string loses structure, all you get is text
_logger.LogInformation($"Order {order.Id} created for customer {order.CustomerId}");
```

Naming convention for template properties: PascalCase, noun-first (`OrderId`, not `id`).

## LogContext Enrichment

Push properties onto the log context to include them in every log line emitted within a scope. Useful for request-scoped IDs.

```csharp
using (LogContext.PushProperty("UserId", userId))
using (LogContext.PushProperty("RequestId", httpContext.TraceIdentifier))
{
    await ProcessOrderAsync(orderId, ct);
}
```

In middleware, enrich once per request:

```csharp
public class UserContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var userId = context.User.FindFirstValue("sub");
        if (userId is not null)
            using (LogContext.PushProperty("UserId", userId))
            {
                await next(context);
                return;
            }
        await next(context);
    }
}
```

## Request Logging Middleware

Replace ASP.NET Core's default request logging with Serilog's, which emits one structured line per request:

```csharp
// In Program.cs — place before UseRouting/UseAuthentication
app.UseSerilogRequestLogging(options =>
{
    options.MessageTemplate =
        "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";
    options.GetLevel = (ctx, elapsed, ex) =>
        ex is not null || ctx.Response.StatusCode >= 500
            ? LogEventLevel.Error
            : LogEventLevel.Information;
    options.EnrichDiagnosticContext = (diagCtx, httpContext) =>
    {
        diagCtx.Set("UserId", httpContext.User.FindFirstValue("sub"));
        diagCtx.Set("ClientIp", httpContext.Connection.RemoteIpAddress?.ToString());
    };
});
```

## Log Level Guidelines

| Level | When to use | Production default |
|-------|-------------|-------------------|
| `Verbose` / `Trace` | SQL queries, cache hits, per-frame loops | Off |
| `Debug` | Detailed flow for diagnosing a specific issue | Off |
| `Information` | Business events (order created, user logged in, job started) | On |
| `Warning` | Recoverable issues: retry attempt, cache miss storm, deprecated API call; request validation failures (a client error, not a fault) | On |
| `Error` | Failures affecting one request that the service caused or could not absorb: DB timeout, unhandled exception, downstream outage | On |
| `Fatal` | Application cannot continue: startup failure, unrecoverable state | On |

## Performance Guard

Avoid building expensive log messages that may not be written. Use the `IsEnabled` guard:

```csharp
if (_logger.IsEnabled(LogLevel.Debug))
{
    var payload = JsonSerializer.Serialize(largeObject);
    _logger.LogDebug("Full request payload: {Payload}", payload);
}
```

For hot paths, use the `[LoggerMessage]` source generator — it emits the `IsEnabled` check and avoids
boxing. It takes MEL's `LogLevel`, not Serilog's `LogEventLevel`:

```csharp
internal static partial class OrderLog
{
    [LoggerMessage(EventId = 1, Level = LogLevel.Information, Message = "Order {OrderId} created.")]
    public static partial void OrderCreated(ILogger logger, Guid orderId);
}

OrderLog.OrderCreated(_logger, order.Id);
```

## Security Rules

Never log:
- Passwords, PINs, security questions
- Auth tokens, API keys, session IDs
- PII: email addresses, names, SSNs, credit card numbers, phone numbers
- Full request bodies containing any of the above

Redact at source — don't rely on log pipeline filtering:

```csharp
// WRONG
_logger.LogInformation("User login attempt: {Email} / {Password}", email, password);

// CORRECT
_logger.LogInformation("User login attempt for account {AccountId}", accountId);
```

## See Also

- `skills/opentelemetry/SKILL.md` — trace/span setup and log↔trace correlation (`TraceId`/`SpanId`)
