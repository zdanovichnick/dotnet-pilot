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

