# Project: Web API

## Stack
- .NET 10 / ASP.NET Core minimal APIs
- EF Core (SQL Server or PostgreSQL)
- FluentValidation for validation
- Serilog for structured logging
- OpenTelemetry for tracing
- Testcontainers + WebApplicationFactory for integration tests

## Architecture: Vertical Slice

Features are organized as self-contained slices:
```
src/
  Features/
    Orders/
      CreateOrder/
        CreateOrderEndpoint.cs   ← IEndpointGroup
        CreateOrderRequest.cs    ← record DTO
        CreateOrderResponse.cs   ← record DTO
        CreateOrderValidator.cs  ← FluentValidation
      GetOrder/
      CancelOrder/
    Products/
  Infrastructure/
    Persistence/
      AppDbContext.cs
      Configurations/          ← IEntityTypeConfiguration<T>
  Program.cs
tests/
  MyApp.IntegrationTests/
    Features/Orders/
      CreateOrderTests.cs      ← WebApplicationFactory tests
```

## Key Conventions

### Endpoints
- Implement `IEndpointGroup`, register via `MapEndpointGroups()` extension
- Use `TypedResults` for all returns (not `Results.Ok(...)`)
- Add `.AddEndpointFilter<ValidationFilter<TRequest>>()` for validated requests
- Use `.WithOpenApi()` and `.WithName("OperationName")` on every endpoint

### Error Handling
- Domain/application errors: return `Result<TValue, TError>` — never throw
- Map `Result.Failure` to `TypedResults.Problem(...)` or `TypedResults.NotFound()` at endpoint
- Register `GlobalExceptionHandler` in `Program.cs` for unhandled infrastructure exceptions
- All HTTP errors use `ProblemDetails` (RFC 7807)

### Data Access
- Inject `AppDbContext` directly in handlers — no repository wrapper
- Use `AsNoTracking()` on all read-only queries
- Use `ExecuteUpdateAsync`/`ExecuteDeleteAsync` for bulk operations
- Always pass `CancellationToken` to all async EF Core calls

### Testing
- All features have at least one `WebApplicationFactory` integration test
- Use Testcontainers for real database in integration tests
- Framework: xUnit + NSubstitute + FluentAssertions
- Test naming: `MethodName_Scenario_ExpectedBehavior`

### DI Registration
- Group registrations in extension methods: `services.AddOrderFeatures()`
- Call extension methods from `Program.cs`
- Never inline registrations in `Program.cs` beyond bootstrapping

## Program.cs Pattern
```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog(...);
builder.Services
    .AddOpenApi()
    .AddExceptionHandler<GlobalExceptionHandler>()
    .AddProblemDetails()
    .AddFluentValidation(...)
    .AddHybridCache()
    .AddDbContext<AppDbContext>(...)
    .AddOrderFeatures()
    .AddProductFeatures();

var app = builder.Build();

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.MapOpenApi();
app.MapEndpointGroups();
app.Run();
```
