---
name: opentelemetry
description: OpenTelemetry SDK for .NET — tracing, custom spans, metrics, .NET Aspire integration, and OTLP exporter configuration.
when_to_use: Adding tracing, custom spans, metrics, or an OTLP exporter; wiring telemetry into a .NET Aspire app.
---

# OpenTelemetry for .NET

Reference material for adding distributed tracing and metrics to ASP.NET Core services.

## NuGet Packages

```xml
<!-- Core -->
<PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.*" />

<!-- Tracing instrumentation -->
<PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.*" />
<PackageReference Include="OpenTelemetry.Instrumentation.Http" Version="1.*" />
<!-- Prerelease only (no stable 1.x yet) — a plain "1.*" range never resolves a beta -->
<PackageReference Include="OpenTelemetry.Instrumentation.EntityFrameworkCore" Version="1.*-*" />
<PackageReference Include="OpenTelemetry.Instrumentation.Runtime" Version="1.*" />

<!-- Exporter -->
<PackageReference Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" Version="1.*" />
```

## Setup — Program.cs

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation(options =>
        {
            options.RecordException = true;
            options.Filter = ctx => ctx.Request.Path != "/health"; // exclude health checks
        })
        .AddEntityFrameworkCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSource("MyApp.Orders")  // register custom ActivitySource names
        .AddOtlpExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddMeter("MyApp.Orders")   // register custom Meter names
        .AddOtlpExporter());
```

The EF instrumentation no longer has `SetDbStatementForText` (removed in 1.13.0-beta.1): SQL text is
always captured and sanitized for SQL-like providers. Parameter values are opt-in via
`OTEL_DOTNET_EXPERIMENTAL_EFCORE_ENABLE_TRACE_DB_QUERY_PARAMETERS=true` — keep that off in production,
parameters carry PII.

## Custom Spans (Activity)

`ActivitySource` is .NET's API for creating custom spans. One source per logical module.

```csharp
// Register as singleton in DI:
builder.Services.AddSingleton(new ActivitySource("MyApp.Orders"));
```

```csharp
// Usage in a handler or service:
public class ProcessOrderHandler(IOrderRepository orders, ActivitySource activitySource)
{
    public async Task<Order> HandleAsync(ProcessOrderCommand cmd, CancellationToken ct)
    {
        using var activity = activitySource.StartActivity("ProcessOrder");
        activity?.SetTag("order.id", cmd.OrderId.ToString());
        activity?.SetTag("order.customer_id", cmd.CustomerId.ToString());

        try
        {
            var order = await orders.GetByIdAsync(cmd.OrderId, ct)
                ?? throw new NotFoundException($"Order {cmd.OrderId} not found.");

            activity?.SetTag("order.status", order.Status.ToString());

            // business logic...

            return order;
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddException(ex); // .NET 9+; RecordException is obsolete
            throw;
        }
    }
}
```

### Span Tag Conventions

Use OpenTelemetry semantic conventions where they exist. For business attributes, use `<domain>.<attribute>` format:

| Attribute | Example value |
|-----------|--------------|
| `order.id` | `"ord_abc123"` |
| `order.status` | `"Pending"` |
| `customer.tier` | `"Premium"` |
| `payment.method` | `"CreditCard"` |

Do **not** tag spans with PII (email, name, card number, SSN).

### Child Spans

```csharp
using var parent = activitySource.StartActivity("CreateOrder");
using var validationSpan = activitySource.StartActivity("ValidateOrder", ActivityKind.Internal);
// validationSpan is automatically a child of parent due to Activity.Current
```

## Custom Metrics

Use `IMeterFactory` for DI-friendly meter creation. One `Meter` per logical module.

```csharp
// Register metrics class as singleton:
builder.Services.AddSingleton<OrderMetrics>();
```

```csharp
public sealed class OrderMetrics
{
    private readonly Counter<long> _ordersCreated;
    private readonly Histogram<double> _orderProcessingDuration;
    private readonly UpDownCounter<long> _pendingOrders;

    public OrderMetrics(IMeterFactory factory)
    {
        var meter = factory.Create(new MeterOptions("MyApp.Orders") { Version = "1.0" });
        _ordersCreated = meter.CreateCounter<long>("orders.created", "orders", "Total orders created");
        _orderProcessingDuration = meter.CreateHistogram<double>("orders.processing_duration", "ms", "Order processing time");
        _pendingOrders = meter.CreateUpDownCounter<long>("orders.pending", "orders", "Current pending orders");
    }

    public void RecordOrderCreated(string tier)
        => _ordersCreated.Add(1, new TagList { { "customer.tier", tier } });

    public void RecordProcessingDuration(double ms, string status)
        => _orderProcessingDuration.Record(ms, new TagList { { "order.status", status } });

    public void IncrementPending() => _pendingOrders.Add(1);
    public void DecrementPending() => _pendingOrders.Add(-1);
}
```

## .NET Aspire Integration

When using .NET Aspire, OTEL is pre-configured via `AddServiceDefaults()` in the `ServiceDefaults` project. Do **not** manually call `AddOpenTelemetry()` in projects that call `AddServiceDefaults()` — it's already wired.

```csharp
// AppHost project — resource registration
var api = builder.AddProject<Projects.MyApp_Api>("myapp-api");

// API project — ServiceDefaults handles OTEL, health checks, service discovery
builder.AddServiceDefaults(); // replaces manual AddOpenTelemetry() setup
app.MapDefaultEndpoints();    // maps /health and /alive
```

`ServiceDefaults` reads `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` from the environment. Aspire injects these automatically when running via the AppHost.

You still need to register custom `ActivitySource` and `Meter` names:

```csharp
// In ServiceDefaults ConfigureOpenTelemetry or in the service itself:
.AddSource("MyApp.Orders")
.AddMeter("MyApp.Orders")
```

## OTLP Exporter Configuration

Via environment variables (preferred — works with Aspire and Docker):

```json
{
  "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
  "OTEL_SERVICE_NAME": "myapp-api",
  "OTEL_SERVICE_VERSION": "1.0.0"
}
```

Via code (for explicit control):

```csharp
.AddOtlpExporter(options =>
{
    options.Endpoint = new Uri("http://localhost:4317");
    options.Protocol = OtlpExportProtocol.Grpc; // or HttpProtobuf
})
```

## Correlation with Serilog

Serilog 3.1+ stamps `TraceId` and `SpanId` from `Activity.Current` onto every log event natively —
`Serilog.Enrichers.Span` is deprecated and no longer needed. Text sinks show them only when the
output template includes `{TraceId}` / `{SpanId}`; structured formatters and the OTLP sink carry
them automatically.

## Do / Don't

| Do | Don't |
|----|-------|
| Register `ActivitySource` as singleton | Create `new ActivitySource(...)` per request |
| Tag spans with business-meaningful IDs (order ID, user tier) | Tag spans with PII |
| Use `SetStatus(Error)` + `AddException` in catch blocks | Swallow exceptions without marking the span failed |
| Exclude health check endpoints from tracing | Trace `/health` and `/alive` — creates noise |
| Keep EF query-parameter capture off in production | Set `OTEL_DOTNET_EXPERIMENTAL_EFCORE_ENABLE_TRACE_DB_QUERY_PARAMETERS` outside dev |
| Use `ActivityKind.Internal` for internal spans | Leave `ActivityKind` unset on child spans |

## See Also

- `skills/logging/SKILL.md` — Serilog setup; this file owns log↔trace correlation
- .NET Aspire docs: `AddServiceDefaults()` source in `ServiceDefaults/Extensions.cs`
