---
name: testing-dotnet
description: .NET testing patterns — xUnit conventions, integration tests with WebApplicationFactory, mocking strategies, and test organization.
---

# .NET Testing Patterns

Reference for test generation. Used by `dnp-test-writer` and `dnp-planner`.

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
