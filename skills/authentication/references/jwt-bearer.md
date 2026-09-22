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
            ClockSkew = TimeSpan.Zero,
            NameClaimType = "name",
            RoleClaimType = "role"
        };

        // Keep the token's claim names ("sub", "email", "role") instead of remapping them
        // to ClaimTypes.* URIs.
        options.MapInboundClaims = false;

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                var logger = ctx.HttpContext.RequestServices
                    .GetRequiredService<ILoggerFactory>().CreateLogger("JwtBearer");
                logger.LogWarning(ctx.Exception, "JWT authentication failed");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
```

**`MapInboundClaims = false` and the claim-type settings travel together.** With remapping off,
`ClaimTypes.NameIdentifier` / `ClaimTypes.Role` lookups return null and `IsInRole` returns false
unless `NameClaimType` / `RoleClaimType` name the raw claims. Read the user id as
`FindFirstValue("sub")`. Keycloak: `NameClaimType = "preferred_username"`, and realm roles arrive
nested under `realm_access.roles`, so they need a claims transformation before `IsInRole` sees them.

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

