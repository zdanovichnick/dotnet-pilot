## OIDC with External Provider

```csharp
builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme          = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie()
    // No scheme name argument: registers under OpenIdConnectDefaults.AuthenticationScheme ("OpenIdConnect"),
    // which DefaultChallengeScheme points at. A custom name ("oidc") must be used in both places.
    .AddOpenIdConnect(options =>
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

