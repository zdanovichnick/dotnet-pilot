---
name: aspnet-api-patterns
description: ASP.NET Core API patterns — controllers vs minimal API, middleware, error handling, versioning, and authentication setup.
---

# ASP.NET Core API Patterns

Reference for API development. Used by `dnp-api-scaffolder` and `dnp-planner`.

## Controller vs Minimal API Decision

| Factor | Controllers | Minimal API |
|--------|------------|-------------|
| Team familiarity | Traditional .NET teams | Modern, lightweight preference |
| OpenAPI support | Full attribute support | Requires explicit configuration |
| Filters/middleware | Rich filter pipeline | Endpoint filters (simpler) |
| File organization | One controller per resource | Endpoint groups or single file |
| Testability | Via WebApplicationFactory | Same |
| Performance | Slightly slower (reflection) | Slightly faster |

## Controller Pattern
```csharp
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class UsersController : ControllerBase
{
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var user = await _userService.GetByIdAsync(id, ct);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(CreateUserRequest request, CancellationToken ct)
    {
        var user = await _userService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }
}
```

## Error Handling

### Global Exception Handler (preferred)
```csharp
app.UseExceptionHandler(app => app.Run(async context =>
{
    var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var problemDetails = new ProblemDetails
    {
        Status = StatusCodes.Status500InternalServerError,
        Title = "An error occurred"
    };
    context.Response.StatusCode = problemDetails.Status.Value;
    await context.Response.WriteAsJsonAsync(problemDetails);
}));
```

### Use ProblemDetails for all error responses (RFC 7807)

## Authentication Patterns

### JWT Bearer
```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!))
        };
    });
```

## Middleware Order (critical)
```csharp
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
```
