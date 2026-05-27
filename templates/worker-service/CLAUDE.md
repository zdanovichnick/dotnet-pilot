# Project: Worker Service

## Service Types

### BackgroundService (long-running loop)
```csharp
public class OrderProcessingWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<OrderProcessingWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Worker started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break; // graceful shutdown
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Worker iteration failed — retrying after delay");
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }

        logger.LogInformation("Worker stopped");
    }

    private async Task ProcessBatchAsync(CancellationToken ct)
    {
        // Use a new scope for each batch (scoped services like DbContext)
        await using var scope = scopeFactory.CreateAsyncScope();
        var processor = scope.ServiceProvider.GetRequiredService<IOrderProcessor>();
        await processor.ProcessPendingAsync(ct);
    }
}
```

## Key Conventions

### Scoped services in workers
- Workers are singleton — DbContext is scoped
- Always create a new `IServiceScope` per unit of work
- Never inject scoped services directly into a BackgroundService constructor

### Graceful shutdown
- Catch `OperationCanceledException` in the loop body — signals `stoppingToken` was cancelled
- Ensure `ExecuteAsync` returns promptly when `stoppingToken` is cancelled
- Set `DOTNET_GRACEFUL_SHUTDOWN_TIMEOUT` if processing takes >5 seconds

### Resilience
- Use Polly retry pipeline for external calls (DB, message broker, HTTP)
- Log retry attempts at Warning level
- Use exponential backoff for transient failures

### Health checks
```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>()
    .AddCheck<WorkerHealthCheck>("worker");
// expose: app.MapHealthChecks("/health")
```

## Program.cs Pattern
```csharp
var builder = Host.CreateApplicationBuilder(args);

builder.Services
    .AddDbContext<AppDbContext>(...)
    .AddResiliencePipeline("default", pipeline => pipeline.AddRetry(...).AddTimeout(...))
    .AddHostedService<OrderProcessingWorker>();

builder.Host.UseSerilog(...);

var host = builder.Build();
await host.RunAsync();
```
