---
name: convention-learner
description: Protocol for detecting and replicating existing project conventions before generating new code — naming, folder structure, DI registration, test framework, DTOs, and error handling.
---

# Convention Learner

Protocol for detecting project conventions before generating code. Run this before creating any new files in a project you haven't worked in during this session.

**Purpose**: Prevent naming drift and structural inconsistency. Generated code that doesn't match project conventions creates review friction, merge noise, and long-term maintenance debt.

## When This Protocol Is MANDATORY

- First file creation in any session
- Adding a new feature to an existing codebase
- Any time the project's architecture style is unknown
- When the user's request doesn't specify naming or structure

Skip only when: the user explicitly specifies all conventions in their request, or you have confirmed conventions in the same session (within the current conversation).

## Detection Protocol

Run Steps 1–6 before writing any code. You need all six answers.

### Step 1 — Naming Suffix Convention

What suffix does this project use for its handlers/services?

```
Grep pattern: "class \w+(Handler|Service|Manager|Controller|UseCase|Interactor)"
Files: src/**/*.cs
```

Determine: `Handler`, `Service`, `Manager`, `Controller`, or a mix?

If mixed: use the suffix most common in the feature area you're working in (e.g., if `Orders/` uses `Handler`, use `Handler` for new order code even if `Customers/` uses `Service`).

### Step 2 — Folder / Architecture Style

What is the top-level organization under `src/`?

```
Glob: src/**/*.cs  → inspect top-level directory names under src/<AppName>/
```

| Pattern found | Architecture style |
|--------------|-------------------|
| `Features/<Feature>/<Action>/` | Vertical Slice (VSA) |
| `Controllers/` + `Services/` + `Models/` | Layered / MVC |
| `Domain/` + `Application/` + `Infrastructure/` | Clean Architecture |
| `Domain/` + aggregates with `AggregateRoot` | DDD |

### Step 3 — DI Registration Pattern

How are services registered?

```
Grep pattern: "AddScoped|AddTransient|AddSingleton"
Files: src/**/*.cs
```

| Pattern found | Convention |
|--------------|-----------|
| `services.Add*(...)` in `Program.cs` only | Inline registration |
| `services.AddOrders()` in extension methods | Extension method per module/feature |
| `services.AddApplication()` + `services.AddInfrastructure()` | Layer-scoped extension methods |

### Step 4 — Test Organization

What test framework and assertion library does this project use?

```
Glob: tests/**/*Tests.cs  → read 2 representative test files
Grep pattern: "using Xunit|using NUnit|using Microsoft.VisualStudio.TestTools"
Grep pattern: "NSubstitute|Moq|FakeItEasy"
Grep pattern: "FluentAssertions|Shouldly"
```

Determine: `xUnit` / `NUnit` / `MSTest`? `NSubstitute` / `Moq` / `FakeItEasy`? `FluentAssertions` / `Shouldly` / raw asserts?

Also check: are test classes named `<Subject>Tests` or `<Subject>Test` (no plural)?

### Step 5 — DTO Style

How are request/response types defined?

```
Grep pattern: "public record|public class.*Request|public class.*Response|public class.*Dto"
Files: src/**/*.cs
```

| Pattern found | Convention |
|--------------|-----------|
| `public record CreateOrderRequest(...)` | Positional record |
| `public record CreateOrderRequest { ... }` | Property-init record |
| `public class CreateOrderRequest { public ... get; set; }` | Mutable class |

Suffix used: `Request`/`Response`, `Dto`, `Model`, or `ViewModel`?

### Step 6 — Error Handling Style

How does this project signal failures?

```
Grep pattern: "Result<|OneOf<|throw new \w+Exception|ProblemDetails|IActionResult.*Problem"
Files: src/**/*.cs
```

| Pattern found | Convention |
|--------------|-----------|
| `Result<TValue, TError>` / `OneOf<>` | Result/discriminated union pattern |
| `throw new DomainException` / `throw new ValidationException` | Exception-based |
| `TypedResults.Problem(...)` / `ValidationProblem(...)` | ProblemDetails (RFC 9110) |

## Applying Conventions

After completing all 6 steps, state the detected conventions explicitly before generating any code:

> **Detected conventions**: naming=`Handler`, folders=`VSA (Features/<Feature>/<Action>/)`, DI=`extension methods per feature`, tests=`xUnit + NSubstitute + FluentAssertions`, DTOs=`positional records with Request/Response suffix`, errors=`Result pattern`

Then generate code matching **all** detected conventions. If a convention is ambiguous (genuinely mixed), use the most common pattern in the nearest code area and note the ambiguity:

> **Note**: DI registration is mixed — 3 extension methods, 2 inline. Using extension method pattern (majority).

## Convention Override

If the user specifies a convention explicitly in their request, it takes precedence over detected conventions. Acknowledge it:

> **User-specified override**: using `Controller` suffix per request (detected: `Handler`).

## Quick Reference — Convention Extraction Commands

All Roslyn-aware tools are preferred over Grep for `.cs` files when available.

| What to find | Tool / Pattern |
|-------------|---------------|
| Solution structure | `mcp__roslyn__get_solution_structure` |
| Class naming suffixes | `Grep "class \w+(Handler|Service|Manager)" src/` |
| Folder layout | `Glob "src/**/*.cs"` + inspect directories |
| DI registrations | `Grep "AddScoped\|AddTransient\|AddSingleton" src/` |
| Test files sample | `Glob "tests/**/*Tests.cs"` → `Read` 2 files |
| DTO types | `Grep "public record\|class.*Request\|class.*Response" src/` |
| Error handling | `Grep "Result<\|throw new\|ProblemDetails" src/` |

## Common Pitfalls

- **Don't assume VSA because there's a `Features/` folder** — check if handlers are inside feature subfolders or at the root of `Features/`.
- **Don't assume NSubstitute** — Moq is still common; mixing substitute APIs breaks build.
- **Don't infer from one file** — read at least 2–3 representative files per convention.
- **`Dto` suffix ≠ `Request`/`Response` suffix** — they signal different intent; don't mix them in the same codebase.
