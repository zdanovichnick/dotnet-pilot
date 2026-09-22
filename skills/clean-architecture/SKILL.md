---
name: clean-architecture
description: .NET clean architecture enforcement — layer rules, dependency direction, DI registration patterns, and project reference validation.
when_to_use: Deciding which project a type belongs in, adding a project reference, or reviewing layer violations.
---

# Clean Architecture for .NET

Reference for architectural decisions. This skill is the source of truth for layer rules;
`ddd` documents its one variant (repository interfaces in Domain).

## Layer Definitions

### Domain (innermost)
- **Contains:** Entities, value objects, domain events, domain errors, enums, the `Result<TValue, TError>` type (`skills/error-handling/SKILL.md`)
- **References:** Nothing (zero project references)
- **Packages allowed:** none — the BCL covers it (`TimeProvider` included)
- **Packages forbidden:** EF Core, ASP.NET Core, MediatR, FluentValidation, any infrastructure

### Application
- **Contains:** Use-case handlers/services, repository and gateway interfaces, DTOs, validators
- **References:** Domain only
- **Packages allowed:** FluentValidation; MediatR / AutoMapper only with the licence check below
- **Packages forbidden:** EF Core, database drivers, HTTP clients

**Licensing:** MediatR 13+ and AutoMapper 15+ are commercial (Lucky Penny Software, since July 2025;
a free Community edition covers qualifying organisations). Earlier versions stay open source but get
no fixes. Before adding either, confirm the licence or use a plain handler interface and hand-written
mapping — neither library is needed for this layering.

### Infrastructure
- **Contains:** DbContext, repositories, external service clients, email senders
- **References:** Domain, Application
- **Packages allowed:** EF Core, database drivers, HTTP clients, file system
- **Implements:** Interfaces defined in Application

### API/Web (outermost)
- **Contains:** Controllers/endpoints, middleware, Program.cs, DI composition root
- **References:** Application, Infrastructure
- **Packages allowed:** Microsoft.AspNetCore.OpenApi (built-in `AddOpenApi()`/`MapOpenApi()`), authentication, rate limiting
- **Responsibility:** Wire everything together, no business logic. Referencing Infrastructure here is
  the composition root's job, not a violation

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
        services.AddValidatorsFromAssembly(typeof(ApplicationServiceExtensions).Assembly);
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
| Interface ownership | Application defines interfaces (Domain, under the DDD variant); Infrastructure implements |
| Composition root | Only API project wires DI container |
