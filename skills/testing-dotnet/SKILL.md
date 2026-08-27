---
name: testing-dotnet
description: .NET testing patterns — xUnit conventions, integration tests with WebApplicationFactory, mocking strategies, and test organization.
---

# .NET Testing Patterns

Reference for test generation. Used by `dnp-test-writer`, `dnp-tdd-developer-easy`, `dnp-tdd-developer-hard`, and `dnp-planner`.

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
    private readonly Mock<IUserRepository> _repo;
    private readonly UserService _sut; // system under test

    public UserServiceTests()
    {
        _repo = new Mock<IUserRepository>();
        _sut = new UserService(_repo.Object);
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
public async Task CreateAsync_WithInvalidEmail_ThrowsValidationException(string? email) { }
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

```csharp
public class UserEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public UserEndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                // Replace real DB with in-memory
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.AddDbContext<ApplicationDbContext>(options =>
                    options.UseInMemoryDatabase("TestDb"));
            });
        }).CreateClient();
    }

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

## Mocking Comparison

| Feature | Moq | NSubstitute | FakeItEasy |
|---------|-----|-------------|------------|
| Syntax | `mock.Setup(x => x.Method()).Returns(value)` | `sub.Method().Returns(value)` | `A.CallTo(() => fake.Method()).Returns(value)` |
| Verify | `mock.Verify(x => x.Method(), Times.Once)` | `sub.Received(1).Method()` | `A.CallTo(() => fake.Method()).MustHaveHappenedOnceExactly()` |
| Popularity | Most popular | Growing | Niche |

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

Examples here use Moq because it is the most common. Read the test project's `.csproj` and
mirror whatever it already references — a second mocking library in one solution is debt.

## Choosing a Tier

Confidence per test is not uniform. An integration test through `WebApplicationFactory`
exercises real DI, middleware, and routing; a unit test proves one method handles one case.
Prefer the highest tier that is still fast and deterministic for the behavior in question.

| Behavior under test | Tier that actually proves it |
|---|---|
| New API endpoint | Integration via `WebApplicationFactory` — routing + DI + middleware |
| Bug fix at a service boundary | Integration — the bug lives where components meet |
| Edge case in pure domain logic | Unit — fast, exhaustive, precise |
| EF Core query behavior | Integration against a real provider; the in-memory provider diverges from SQL Server on ordering, transactions, and raw SQL |
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
| Database | `WebApplicationFactory` + provider under test, or Testcontainers |
| External HTTP API | `HttpClient` against WireMock or a test-mode endpoint |
| Message queue | Real broker in a container |
| Cache | Real `IMemoryCache`, or Redis in a container |
| Internal service seam | Real DI container via `WebApplicationFactory` |
