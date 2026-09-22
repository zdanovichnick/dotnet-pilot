## Reading Claims

Claim names below assume `MapInboundClaims = false` with `NameClaimType`/`RoleClaimType` set, as in
`jwt-bearer.md`. With the default remapping on, the same values sit under `ClaimTypes.*` URIs.

```csharp
// In a minimal API endpoint
app.MapGet("/me", (ClaimsPrincipal user) =>
{
    var userId      = user.FindFirstValue("sub");
    var email       = user.FindFirstValue("email");
    var roles       = user.FindAll("role").Select(c => c.Value);
    var permissions = user.FindAll("permission").Select(c => c.Value);
    return TypedResults.Ok(new { userId, email, roles, permissions });
}).RequireAuthorization();

// In a service (inject IHttpContextAccessor)
public class CurrentUserService(IHttpContextAccessor accessor)
{
    public string UserId =>
        accessor.HttpContext?.User.FindFirstValue("sub")
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

