## Policy-Based Authorization

### Registering Policies

```csharp
builder.Services.AddAuthorization(options =>
{
    // Role-based (simple)
    options.AddPolicy("AdminOnly",
        policy => policy.RequireRole("Admin"));

    // Claim-based
    options.AddPolicy("CanEditOrders",
        policy => policy.RequireClaim("permission", "orders:write"));

    // Custom assertion — runs inline logic against ClaimsPrincipal
    options.AddPolicy("InternalService",
        policy => policy.RequireAssertion(ctx =>
            ctx.User.HasClaim("client_type", "service") &&
            ctx.User.IsInRole("ServiceAccount")));

    // Multiple requirements (all must pass)
    options.AddPolicy("SeniorEditor",
        policy => policy
            .RequireRole("Editor")
            .RequireClaim("experience_years", ["5", "6", "7", "8", "9", "10+"]));

    // Require authenticated user (baseline for all endpoints)
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
```

### Applying Policies

```csharp
// Minimal API
app.MapGet("/orders",       GetOrders)      .RequireAuthorization();
app.MapPost("/orders",      CreateOrder)    .RequireAuthorization("CanEditOrders");
app.MapDelete("/orders/{id}", DeleteOrder)  .RequireAuthorization("AdminOnly");
app.MapGet("/health",       HealthCheck)    .AllowAnonymous();

// Controller action
[Authorize(Policy = "CanEditOrders")]
[HttpPut("{id}")]
public async Task<IActionResult> Update(int id, ...) { }

// Controller-level with action-level override
[Authorize]
public class OrdersController : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("public")]
    public IActionResult GetPublic() => Ok();
}
```

## Resource-Based Authorization (IAuthorizationHandler)

Use when the policy decision requires loading the resource being accessed.

### Requirement

```csharp
public record ResourceOwnerRequirement : IAuthorizationRequirement;
```

### Handler

```csharp
public class ResourceOwnerHandler(IHttpContextAccessor httpContextAccessor)
    : AuthorizationHandler<ResourceOwnerRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        ResourceOwnerRequirement requirement,
        Order resource)
    {
        var userId = ctx.User.FindFirstValue("sub");

        if (resource.OwnerId == userId || ctx.User.IsInRole("Admin"))
            ctx.Succeed(requirement);
        // else: do nothing — ctx remains un-succeeded (implicit deny)

        return Task.CompletedTask;
    }
}

// Registration
builder.Services.AddScoped<IAuthorizationHandler, ResourceOwnerHandler>();
```

### Usage in Endpoint

```csharp
// A lambda with several TypedResults returns needs the Results<...> union declared,
// otherwise the branches have no common return type and the lambda fails to compile.
app.MapPut("/orders/{id}", async Task<Results<Ok<OrderResponse>, NotFound, ForbidHttpResult, ProblemHttpResult>> (
    int id,
    UpdateOrderRequest req,
    IAuthorizationService authz,
    ClaimsPrincipal user,
    OrderService svc,
    CancellationToken ct) =>
{
    var order = await svc.GetByIdAsync(id, ct);
    if (order is null) return TypedResults.NotFound();

    var authResult = await authz.AuthorizeAsync(user, order, new ResourceOwnerRequirement());
    if (!authResult.Succeeded) return TypedResults.Forbid();

    var result = await svc.UpdateAsync(id, req, ct);
    return result.Match<Results<Ok<OrderResponse>, NotFound, ForbidHttpResult, ProblemHttpResult>>(
        updated => TypedResults.Ok(updated),
        error   => TypedResults.Problem(error.Message));
});
```

