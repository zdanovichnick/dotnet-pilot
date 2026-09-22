---
name: aspnet-api-patterns
description: ASP.NET Core API patterns — controllers vs minimal API, built-in OpenAPI, middleware order, IExceptionHandler + ProblemDetails, and Asp.Versioning.
when_to_use: Adding or changing endpoints, middleware, OpenAPI, or API versioning; deciding between controllers and minimal APIs.
---

# ASP.NET Core API Patterns

Reference for API development on ASP.NET Core 10. Authentication setup lives in
`skills/authentication/SKILL.md`; the Result → HTTP mapping and ProblemDetails details live in
`skills/error-handling/SKILL.md`.

## Controller vs Minimal API Decision

| Factor | Controllers | Minimal API |
|--------|------------|-------------|
| Team familiarity | Traditional .NET teams | Modern, lightweight preference |
| OpenAPI metadata | `[ProducesResponseType]` attributes | Inferred from `TypedResults` / `Results<...>` return types |
| Filters/middleware | Rich filter pipeline | Endpoint filters (simpler) |
| File organization | One controller per resource | Endpoint groups (`MapGroup`) |
| Native AOT | Not supported | Supported |
| Testability | Via WebApplicationFactory | Same |

## Controller Pattern

```csharp
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class UsersController(IUserService userService) : ControllerBase
{
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var user = await userService.GetByIdAsync(id, ct);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(CreateUserRequest request, CancellationToken ct)
    {
        var user = await userService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }
}
```

## OpenAPI

.NET 9+ ships document generation in `Microsoft.AspNetCore.OpenApi`; Swashbuckle is no longer in the
templates.

```csharp
builder.Services.AddOpenApi();

if (app.Environment.IsDevelopment())
    app.MapOpenApi();          // serves /openapi/v1.json
```

- `.WithOpenApi()` is deprecated in .NET 10 (ASPDEPR002). Use `WithSummary`/`WithDescription`/`WithTags`,
  or `AddOpenApiOperationTransformer` for anything else.
- `MapOpenApi()` serves the JSON only. Add a UI (e.g. Scalar) separately if you need one.

## Error Handling

Register an `IExceptionHandler` plus `AddProblemDetails()` and call `app.UseExceptionHandler()` with
no arguments. The handler class, its registration and the RFC 9457 field table are in
`skills/error-handling/SKILL.md` (Global Exception Handler). Avoid the lambda
`UseExceptionHandler(app => app.Run(...))` form: it bypasses `IProblemDetailsService`, so
`CustomizeProblemDetails` (traceId, instance) never runs.

## API Versioning (Asp.Versioning)

Packages: `Asp.Versioning.Http` (minimal APIs) or `Asp.Versioning.Mvc` (controllers), plus
`Asp.Versioning.Mvc.ApiExplorer` for per-version OpenAPI documents.

```csharp
builder.Services.AddApiVersioning(options =>
    {
        options.DefaultApiVersion = new ApiVersion(1.0);
        options.ReportApiVersions = true;
    })
    .AddApiExplorer(options => options.GroupNameFormat = "'v'VVV");   // .AddMvc() first for controllers

var orders = app.NewVersionedApi("Orders");
var v1 = orders.MapGroup("/api/v{version:apiVersion}/orders").HasApiVersion(1.0);
v1.MapGet("/{id:guid}", GetOrderV1);

var v2 = orders.MapGroup("/api/v{version:apiVersion}/orders").HasApiVersion(2.0);
v2.MapGet("/{id:guid}", GetOrderV2);
```

Controllers use `[ApiVersion(1.0)]` on the class and `[MapToApiVersion(2.0)]` on an action. Register
one OpenAPI document per version (`AddOpenApi("v1")`, `AddOpenApi("v2")`); the document names must
match the `GroupNameFormat` output.

## Middleware Order (critical)

```csharp
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
```
