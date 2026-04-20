---
name: clean-architecture
description: .NET clean architecture enforcement — layer rules, dependency direction, DI registration patterns, and project reference validation.
---

# Clean Architecture for .NET

Reference for architectural decisions. Used by `dnp-architect` and `dnp-planner`.

## Layer Definitions

### Domain (innermost)
- **Contains:** Entities, value objects, domain events, domain exceptions, enums
- **References:** Nothing (zero project references)
- **Packages allowed:** MediatR.Contracts (interfaces only), FluentResults
- **Packages forbidden:** EF Core, ASP.NET Core, any infrastructure

### Application
- **Contains:** Service interfaces, DTOs, validators, MediatR handlers, mapping profiles
- **References:** Domain only
- **Packages allowed:** MediatR, FluentValidation, AutoMapper
- **Packages forbidden:** EF Core, database drivers, HTTP clients

### Infrastructure
- **Contains:** DbContext, repositories, external service clients, email senders
- **References:** Domain, Application
- **Packages allowed:** EF Core, database drivers, HTTP clients, file system
- **Implements:** Interfaces defined in Application

### API/Web (outermost)
- **Contains:** Controllers/endpoints, middleware, Program.cs, DI composition root
- **References:** Application, Infrastructure
- **Packages allowed:** Swashbuckle, authentication, rate limiting
- **Responsibility:** Wire everything together, no business logic

### Tests
- **References:** Any (unrestricted)
- **Packages:** Test framework, mocking library, assertions, WebApplicationFactory

## DI Registration Pattern

```csharp
// In Infrastructure project:
public static class InfrastructureServiceExtensions
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services, IConfiguration config)
    {
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(config.GetConnectionString("DefaultConnection")));

        services.AddScoped<IUserRepository, UserRepository>();
        return services;
    }
}

// In Application project:
public static class ApplicationServiceExtensions
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<IUserService, UserService>();
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(ApplicationServiceExtensions).Assembly));
        return services;
    }
}

// In Program.cs (API project):
builder.Services.AddApplicationServices();
builder.Services.AddInfrastructureServices(builder.Configuration);
```

## Validation Rules

| Rule | Check |
|------|-------|
| Domain independence | Domain `.csproj` has 0 `<ProjectReference>` elements |
| Application → Domain only | Application `.csproj` references only Domain |
| No reverse dependencies | Domain never references Application/Infrastructure/API |
| Interface segregation | Application defines interfaces, Infrastructure implements |
| Composition root | Only API project wires DI container |
