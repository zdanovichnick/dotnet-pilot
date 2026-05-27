---
name: authentication
description: JWT bearer auth, ASP.NET Identity, OIDC, and policy-based authorization patterns for ASP.NET Core APIs.
---

# Authentication & Authorization Patterns

Reference for securing ASP.NET Core APIs. Covers JWT bearer, ASP.NET Identity, OIDC, policy-based authorization, and resource-based authorization. Used by `dnp-planner`, `dnp-api-scaffolder`, and `dnp-tdd-developer-hard`.

## Quick Decision Guide

| Scenario | Approach |
|----------|---------|
| API consumed by SPAs or mobile apps with an external IdP | JWT Bearer |
| Server-rendered app with local user accounts + roles | ASP.NET Identity |
| Federated login (Google, Entra ID, Keycloak) | OIDC + `AddOpenIdConnect` |
| Fine-grained permissions beyond roles | Policy-based + `IAuthorizationHandler` |
| Resource ownership check (user can only edit their own order) | Resource-based authorization |

## Required Pipeline Order

```csharp
// Order matters — authentication must run before authorization
app.UseAuthentication();  // sets HttpContext.User
app.UseAuthorization();   // evaluates policies
```

## JWT Bearer Authentication

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Authority issues and validates tokens (OIDC discovery endpoint)
        options.Authority = builder.Configuration["Auth:Authority"];
        options.Audience  = builder.Configuration["Auth:Audience"];

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            // Zero skew — reject tokens within the default 5-minute grace window
            ClockSkew = TimeSpan.Zero
        };

        // Map non-standard claim names (e.g., Keycloak uses "preferred_username")
        options.MapInboundClaims = false;
        options.TokenValidationParameters.NameClaimType = "preferred_username";

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                logger.LogWarning(ctx.Exception, "JWT authentication failed");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
```

### Symmetric Key Validation (internal services without IdP)

```csharp
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(builder.Configuration["Auth:Secret"]!)),
        ValidIssuer   = builder.Configuration["Auth:Issuer"],
        ValidAudience = builder.Configuration["Auth:Audience"],
        ClockSkew = TimeSpan.Zero
    };
})
```

## ASP.NET Identity (Database-Backed Users)

```csharp
// Custom user entity extending IdentityUser
public class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl  { get; set; }
}

// Registration
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.Password.RequiredLength = 12;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();
```

Combine with JWT — add `AddJwtBearer` after `AddIdentity` to issue tokens on login:

```csharp
builder.Services.AddAuthentication()
    .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options => { ... });
```

## OIDC with External Provider

```csharp
builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme          = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie()
    .AddOpenIdConnect("oidc", options =>
    {
        options.Authority     = "https://your-idp.example.com";
        options.ClientId      = builder.Configuration["OIDC:ClientId"];
        options.ClientSecret  = builder.Configuration["OIDC:ClientSecret"];
        options.ResponseType  = "code";              // Authorization Code Flow
        options.Scope.Add("email");
        options.Scope.Add("profile");
        options.SaveTokens    = true;
        options.GetClaimsFromUserInfoEndpoint = true;

        // Map IdP-specific claim names to standard .NET claim types
        options.ClaimActions.MapJsonKey(ClaimTypes.Email, "email");
        options.ClaimActions.MapJsonKey(ClaimTypes.Name,  "preferred_username");
    });
```

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
        var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);

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
app.MapPut("/orders/{id}", async (
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
    return result.Match(
        updated => TypedResults.Ok(updated),
        error   => TypedResults.Problem(error.Message));
});
```

## Reading Claims

```csharp
// In a minimal API endpoint
app.MapGet("/me", (ClaimsPrincipal user) =>
{
    var userId      = user.FindFirstValue(ClaimTypes.NameIdentifier);
    var email       = user.FindFirstValue(ClaimTypes.Email);
    var roles       = user.FindAll(ClaimTypes.Role).Select(c => c.Value);
    var permissions = user.FindAll("permission").Select(c => c.Value);
    return TypedResults.Ok(new { userId, email, roles, permissions });
}).RequireAuthorization();

// In a service (inject IHttpContextAccessor)
public class CurrentUserService(IHttpContextAccessor accessor)
{
    public string UserId =>
        accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("No authenticated user in context");

    public bool IsAdmin =>
        accessor.HttpContext?.User.IsInRole("Admin") ?? false;
}

// Register
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUserService>();
```

## Multi-Scheme Authentication

When an API must accept both JWT (machine-to-machine) and cookie (browser) auth:

```csharp
builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = "Smart";
        options.DefaultChallengeScheme    = "Smart";
    })
    .AddPolicyScheme("Smart", "Smart", options =>
    {
        options.ForwardDefaultSelector = ctx =>
            ctx.Request.Headers.ContainsKey("Authorization")
                ? JwtBearerDefaults.AuthenticationScheme
                : CookieAuthenticationDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options => { ... })
    .AddCookie(options => { ... });
```

## Do / Don't

| Do | Don't |
|----|-------|
| Set `ClockSkew = TimeSpan.Zero` | Allow the default 5-minute token expiry grace period in production |
| Validate both `iss` and `aud` | Disable issuer or audience validation for convenience |
| Use `FallbackPolicy` to require auth by default | Rely on `[Authorize]` placement — it's easy to forget |
| Use policy-based authorization for permissions | Hard-code role strings in `[Authorize(Roles = "...")]` throughout controllers |
| Use resource-based authorization for ownership checks | Put ownership logic inside domain services |
| Map claim names explicitly with `ClaimActions.MapJsonKey` | Assume IdP claim names match `ClaimTypes.*` constants |
| Store permissions as claims in the token | Re-query the DB for permissions on every request |
| Use `RequireAuthenticatedUser()` as fallback policy | Open all endpoints and add `[Authorize]` selectively |
| `AllowAnonymous()` on health check / public endpoints | Forget to exempt health endpoints from the fallback policy |

## See Also
- `skills/error-handling/SKILL.md` — `TypedResults.Forbid()` and mapping auth failures to ProblemDetails
- `skills/aspnet-api-patterns/SKILL.md` — endpoint conventions for protected routes
