---
name: modern-csharp
description: C# 12–14 language features with practical patterns — primary constructors, collection expressions, records, pattern matching, nullable reference types, and more.
---

# Modern C# (12–14)

Reference for language features available in .NET 8+. Used by `dnp-planner` and `dnp-tdd-developer-hard`.

## Primary Constructors (C# 12)

Eliminates constructor boilerplate. Parameters are in scope for the entire class body.

```csharp
// Before
public class OrderService
{
    private readonly IOrderRepository _repo;
    private readonly ILogger<OrderService> _logger;

    public OrderService(IOrderRepository repo, ILogger<OrderService> logger)
    {
        _repo = repo;
        _logger = logger;
    }
}

// After (C# 12)
public class OrderService(IOrderRepository repo, ILogger<OrderService> logger)
{
    public async Task<Order?> GetByIdAsync(int id, CancellationToken ct)
    {
        logger.LogInformation("Fetching order {Id}", id);
        return await repo.GetByIdAsync(id, ct);
    }
}
```

**Caveat**: primary constructor parameters are captured by reference — if you need a private field (e.g., for mutation tracking), assign explicitly: `private readonly IOrderRepository _repo = repo;`

## Collection Expressions (C# 12)

Unified syntax for arrays, lists, and spans. Supports spread (`..`) operator.

```csharp
// Array
int[] ids = [1, 2, 3];

// List<T>
List<string> tags = ["dotnet", "csharp"];

// Spread — merge sequences
var basePermissions = new[] { "read", "list" };
string[] adminPermissions = [..basePermissions, "write", "delete"];

// Empty collection
IReadOnlyList<string> empty = [];

// In method calls
ProcessItems([1, 2, 3]);
```

## Records and With-Expressions

Records are reference types with value semantics. Use for DTOs, domain events, and immutable data shapes.

```csharp
// Positional record (primary constructor + deconstruct)
public record Order(int Id, string CustomerId, string Status, decimal Total);

// Non-destructive mutation
var order = new Order(1, "cust-42", "Pending", 99.99m);
var shipped = order with { Status = "Shipped" };

// Record struct (stack-allocated, value semantics)
public record struct Money(decimal Amount, string Currency);

// Class-style record with validation
public record CreateOrderRequest
{
    public required string CustomerId { get; init; }
    public required List<OrderLine> Lines { get; init; }
}
```

## Required Members (C# 11)

Enforces initialization at construction time — compile error if omitted in object initializer.

```csharp
public class UserDto
{
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public string? AvatarUrl { get; init; }  // optional
}

// Caller must set required members
var dto = new UserDto { Email = "a@b.com", DisplayName = "Alice" };
```

## Pattern Matching (C# 8–13)

### Switch Expressions
```csharp
var label = order.Status switch
{
    "Pending"   => "Awaiting payment",
    "Paid"      => "Processing",
    "Shipped"   => "On the way",
    "Delivered" => "Complete",
    _           => throw new ArgumentOutOfRangeException(nameof(order.Status))
};
```

### Property Patterns
```csharp
bool isEligibleForDiscount = customer switch
{
    { Tier: "Gold", OrderCount: > 10 } => true,
    { Tier: "Silver", OrderCount: > 25 } => true,
    _ => false
};
```

### List Patterns (C# 11)
```csharp
string Describe(int[] nums) => nums switch
{
    []            => "empty",
    [var single]  => $"one element: {single}",
    [var first, .., var last] => $"starts {first}, ends {last}",
    _             => "multiple elements"
};
```

### Type Patterns with Guards
```csharp
decimal CalculateFee(PaymentMethod method) => method switch
{
    CreditCard { Network: "Amex" }       => 0.035m,
    CreditCard card when card.IsRewards  => 0.025m,
    CreditCard                           => 0.020m,
    BankTransfer                         => 0.005m,
    _ => throw new NotSupportedException()
};
```

## Raw String Literals (C# 11)

No escape sequences needed. Indentation is stripped based on the closing `"""` position.

```csharp
// JSON without escaping
var json = """
    {
        "name": "Alice",
        "role": "admin"
    }
    """;

// SQL
var sql = """
    SELECT o.Id, o.Status, c.Email
    FROM Orders o
    JOIN Customers c ON o.CustomerId = c.Id
    WHERE o.Status = 'Pending'
    """;

// Interpolated raw strings — use $""" """
var message = $"""
    Order {order.Id} for customer "{order.CustomerName}" is {order.Status}.
    """;
```

## Nullable Reference Types

Enable project-wide in `.csproj`:
```xml
<Nullable>enable</Nullable>
```

```csharp
// Non-nullable — compiler guarantees non-null
public string Name { get; set; }

// Nullable — must check before use
public string? MiddleName { get; set; }

// Null-forgiving operator — suppress warning when you know better
var name = GetName()!;

// Null-conditional + null-coalescing
var display = user?.Profile?.DisplayName ?? user?.Email ?? "Anonymous";

// Pattern check (preferred over != null for records/structs)
if (user.MiddleName is { } middle)
    Console.WriteLine(middle.ToUpper());
```

## Global Usings (C# 10)

Declare once in a dedicated file (e.g., `Usings.cs` or `GlobalUsings.cs`):

```csharp
global using System;
global using System.Collections.Generic;
global using System.Linq;
global using System.Threading;
global using System.Threading.Tasks;
global using Microsoft.AspNetCore.Mvc;
global using Microsoft.EntityFrameworkCore;
```

ASP.NET Web SDK enables some implicitly — check `<ImplicitUsings>enable</ImplicitUsings>` in `.csproj`.

## File-Scoped Namespaces (C# 10)

```csharp
// Instead of wrapping everything in braces:
namespace MyApp.Services;

public class OrderService { }
public interface IOrderService { }
```

One namespace per file. Saves one level of indentation throughout the codebase.

## `field` Keyword (C# 13 — preview)

Accesses the compiler-generated backing field inside a property accessor. Eliminates explicit backing field declarations.

```csharp
public class Product
{
    // Trim on set, no explicit backing field needed
    public string Name
    {
        get => field;
        set => field = value?.Trim() ?? throw new ArgumentNullException(nameof(value));
    }

    // Clamp on set
    public int Quantity
    {
        get => field;
        set => field = Math.Max(0, value);
    }
}
```

Requires `<LangVersion>preview</LangVersion>` in `.csproj` until C# 14 ships.

## Do / Don't

| Do | Don't |
|----|-------|
| `var` for all local variables | Explicit types for locals when type is obvious from RHS |
| Records for DTOs and domain events | Mutable classes for data transfer |
| File-scoped namespaces everywhere | Brace-wrapped namespaces |
| Switch expressions over `if/else` chains | `#region` blocks |
| `required` + `init` for mandatory DTO fields | Constructor overloads just to set required fields |
| Raw string literals for embedded SQL/JSON | `@"..."` with manual `\"` escaping |
| Nullable reference types enabled in new projects | Suppressing NRT warnings with `!` broadly |
| Primary constructors for simple DI | Primary constructors when you need mutable private state |

## See Also
- `skills/error-handling/SKILL.md` — Result pattern with modern C# records
- `skills/clean-architecture/SKILL.md` — layer conventions these features apply within
