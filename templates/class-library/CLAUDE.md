# Project: Class Library / NuGet Package

## API Surface Rules

### Public API discipline
- Mark everything `internal` by default; promote to `public` only when necessary
- Every public type/member needs XML documentation
- Use `[EditorBrowsable(EditorBrowsableState.Never)]` for public-but-infrastructure members
- Breaking changes require a major version bump (SemVer)

### XML Documentation
```csharp
/// <summary>
/// Executes the pipeline with retry and circuit-breaker protection.
/// </summary>
/// <param name="operation">The async operation to execute.</param>
/// <param name="ct">Cancellation token.</param>
/// <returns>The result of the operation.</returns>
/// <exception cref="BrokenCircuitException">Thrown when the circuit is open.</exception>
public async Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken ct)
```

## Project File Conventions

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net9.0;net10.0</TargetFrameworks>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <!-- NuGet metadata -->
    <PackageId>MyOrg.MyLibrary</PackageId>
    <Version>1.0.0</Version>
    <Authors>MyOrg</Authors>
    <Description>...</Description>
    <PackageLicenseExpression>MIT</PackageLicenseExpression>
    <RepositoryUrl>https://github.com/myorg/mylibrary</RepositoryUrl>
  </PropertyGroup>
</Project>
```

## Versioning (SemVer)
- `MAJOR.MINOR.PATCH`
- PATCH: bug fixes, no API change
- MINOR: new public API, backward compatible
- MAJOR: breaking API change (remove/rename public member, change signature)

## Testing
- Test project targets same framework(s) as library
- 100% public API coverage minimum
- Use `[InternalsVisibleTo("MyLibrary.Tests")]` in csproj for testing internal helpers
- Integration tests in a separate `*.IntegrationTests` project

## Key Conventions
- No `static` classes for core logic — prefer injectable services
- Provide a DI extension method: `services.AddMyLibrary(options => ...)`
- Avoid taking on heavy dependencies (Newtonsoft, EF Core) in a general-purpose library
- Use `IOptions<T>` pattern for configuration
