---
name: testing-dotnet
description: .NET testing patterns — xUnit conventions, integration tests with WebApplicationFactory over Testcontainers, NSubstitute mocking, and test organization.
when_to_use: Writing or reviewing tests — choosing unit vs integration, substituting a dependency, standing up WebApplicationFactory, or deciding whether a mock proves anything.
argument-hint: "<class or endpoint under test> [--tier unit|integration]"
---

# .NET Testing Patterns

Reference for writing and reviewing tests.

## Test Organization

```
tests/
├── MyApp.UnitTests/           # Fast, isolated, mock dependencies
│   ├── Services/
│   │   └── UserServiceTests.cs
│   └── Domain/
│       └── UserTests.cs
├── MyApp.IntegrationTests/    # Slower, real dependencies
│   ├── Api/
│   │   └── UserEndpointTests.cs
│   └── Infrastructure/
│       └── UserRepositoryTests.cs
└── MyApp.ArchitectureTests/   # Optional: enforce architecture rules
    └── LayerDependencyTests.cs
```

## xUnit Patterns

### Test Class Setup
```csharp
public class UserServiceTests
{
    private readonly IUserRepository _repo = Substitute.For<IUserRepository>();
    private readonly UserService _sut; // system under test

    public UserServiceTests()
    {
        _sut = new UserService(_repo);
    }

    [Fact]
    public async Task GetByIdAsync_WhenUserExists_ReturnsUser()
    {
        var user = new User(Guid.NewGuid(), "test@example.com");
        _repo.GetByIdAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);

        var result = await _sut.GetByIdAsync(user.Id, CancellationToken.None);

        result.Should().Be(user);
    }
}
```

### Naming Convention
`MethodName_StateUnderTest_ExpectedBehavior`
```csharp
[Fact]
public async Task GetByIdAsync_WhenUserExists_ReturnsUser() { }

[Fact]
public async Task GetByIdAsync_WhenUserNotFound_ReturnsNull() { }

[Theory]
[InlineData("")]
[InlineData(null)]
public async Task CreateAsync_WithInvalidEmail_ReturnsValidationError(string? email) { }
```

### IClassFixture for Shared Setup
```csharp
public class DatabaseTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fixture;
    public DatabaseTests(DatabaseFixture fixture) => _fixture = fixture;
}
```

## Integration Tests with WebApplicationFactory

The factory swaps the app's database for one running in a Testcontainers container
(`Testcontainers.MsSql`; `Testcontainers.PostgreSql` for Npgsql), so tests run against the same
provider as production. Docker must be available where the tests run.

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    // The parameterless MsSqlBuilder() is obsolete in Testcontainers 4.x; pin the image explicitly.
    private readonly MsSqlContainer _db =
        new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-CU14-ubuntu-22.04").Build();

    public Task InitializeAsync() => _db.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await _db.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services =>
        {
            // EF Core 9+ also registers the original UseSqlServer(...) callback as an
            // IDbContextOptionsConfiguration<T>; leaving it in re-applies the production connection.
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<ApplicationDbContext>>();
            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(_db.GetConnectionString()));
        });
}

public class UserEndpointTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public UserEndpointTests(ApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task CreateUser_Returns201WithLocation()
    {
        var request = new { Name = "Test", Email = "test@example.com" };
        var response = await _client.PostAsJsonAsync("/api/users", request);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();
    }
}
```

Under xUnit v2 `IAsyncLifetime.DisposeAsync` returns `Task`, so the explicit implementation above
keeps it apart from `WebApplicationFactory.DisposeAsync()` (`ValueTask`). xUnit v3 unifies both on
`ValueTask` and the explicit form is no longer needed.

## Controlling Time

Code that takes `TimeProvider` (never `DateTime.UtcNow`) is tested with `FakeTimeProvider` from
`Microsoft.Extensions.TimeProvider.Testing` — no mock needed:

```csharp
[Fact]
public void Expire_AfterTtl_MarksSessionExpired()
{
    var time = new FakeTimeProvider(new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
    var session = Session.Start(time, ttl: TimeSpan.FromMinutes(30));

    time.Advance(TimeSpan.FromMinutes(31));

    session.IsExpired(time).Should().BeTrue();
}
```

In a `WebApplicationFactory`, swap it in `ConfigureTestServices`:
`services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(time);`. `Advance` also
fires timers and `Task.Delay(…, time)` calls created from the fake provider.

## Mocking Libraries

NSubstitute is the default for new test projects. When the solution already uses another library,
mirror it — the same behavior in each:

| Feature | NSubstitute | Moq | FakeItEasy |
|---------|-------------|-----|------------|
| Return | `sub.Method().Returns(value)` | `mock.Setup(x => x.Method()).Returns(value)` | `A.CallTo(() => fake.Method()).Returns(value)` |
| Verify | `sub.Received(1).Method()` | `mock.Verify(x => x.Method(), Times.Once)` | `A.CallTo(() => fake.Method()).MustHaveHappenedOnceExactly()` |
| Argument match | `Arg.Any<T>()`, `Arg.Is<T>(x => …)` | `It.IsAny<T>()`, `It.Is<T>(x => …)` | `A<T>.Ignored`, `A<T>.That.Matches(x => …)` |

## Test Data

### AutoFixture (recommended for complex objects)
```csharp
var fixture = new Fixture();
var user = fixture.Create<User>();
```

### Builder Pattern (for domain-specific)
```csharp
var user = new UserBuilder().WithEmail("test@example.com").Build();
```

Examples here use NSubstitute and FluentAssertions. Read the test project's `.csproj` and mirror
whatever it already references — a second mocking or assertion library in one solution is debt.
For a new project: FluentAssertions 7.x (pin `[7,8)` — v8+ needs a commercial licence) or Shouldly.

## Choosing a Tier

Confidence per test is not uniform. An integration test through `WebApplicationFactory`
exercises real DI, middleware, and routing; a unit test proves one method handles one case.
Prefer the highest tier that is still fast and deterministic for the behavior in question.

| Behavior under test | Tier that actually proves it |
|---|---|
| New API endpoint | Integration via `WebApplicationFactory` — routing + DI + middleware |
| Bug fix at a service boundary | Integration — the bug lives where components meet |
| Edge case in pure domain logic | Unit — fast, exhaustive, precise |
| EF Core query behavior | Integration against the real provider in a Testcontainers container; the in-memory provider diverges from SQL Server on ordering, transactions, and raw SQL |
| Validation rules | Unit — `[Theory]` coverage is economical |
| Cross-service workflow | Integration plus one system-level test |

## Mocks

**A test that only asserts on its mocks proves nothing.** Litmus: delete every `Verify()`,
`Received()`, and `MustHaveHappened()` call. If nothing is left that would fail when the
implementation breaks, the test is measuring its own setup.

Preference order:

1. **Real, if it is controllable and fast** — `TestServer`, `IMemoryCache`, a real filesystem
   with `IDisposable` cleanup.
2. **A container** — Testcontainers for SQL Server, Redis, RabbitMQ. Slower, but the behavior is
   the behavior.
3. **A mock** — only when the dependency is non-deterministic, costly (a paid API), or slow.

A mock is a claim about a contract, so verify the claim before writing it: read the real
signature (`mcp__roslyn__get_class_outline`) for return types and nullability, and read the
implementation for the values it actually returns. A mock returning `"PENDING"` where the real
code returns `OrderStatus.Pending` hides the bug it was supposed to expose.

## Boundary Coverage

Every boundary the feature crosses wants at least one test with the real implementation behind
it. Mock-only coverage at a boundary means nothing has proven the integration works.

| Boundary | Real-implementation approach |
|---|---|
| Database | `WebApplicationFactory` over a Testcontainers database (the `ApiFactory` above) |
| External HTTP API | `HttpClient` against WireMock or a test-mode endpoint |
| Message queue | Real broker in a container |
| Cache | Real `IMemoryCache`, or Redis in a container |
| Internal service seam | Real DI container via `WebApplicationFactory` |
