---
name: error-handling
description: The canonical Result<TValue, TError> type, typed error records, ProblemDetails (RFC 9457), and global exception boundaries for .NET APIs.
when_to_use: Choosing between Result<TValue, TError> and exceptions, adding ProblemDetails responses, or wiring a global exception handler.
---

# Error Handling Patterns

This skill owns the `Result<TValue, TError>` definition. `ddd`, `clean-architecture` and
`vertical-slice` use it and do not redefine it.

## Philosophy: When to Use Results vs Exceptions

| Scenario | Approach |
|----------|----------|
| Domain rule violation (not found, invalid state, business constraint) | `Result<TValue, TError>` — expected failure path |
| Infrastructure failure (DB timeout, network error, config missing) | Exception — unexpected, unrecoverable at call site |
| Validation failure (bad input from HTTP layer) | `ValidationProblem` via model binding / FluentValidation |
| Unhandled exception escaping to HTTP | `GlobalExceptionHandler` → 500 ProblemDetails |

Never throw exceptions for expected domain outcomes. Never swallow exceptions at call sites.

## Result Type

Define once in the Domain project (e.g. `Domain/Common/Result.cs`). It has no dependencies, so every
layer can reference it:

```csharp
namespace MyApp.Domain.Common;

public readonly record struct Result<TValue, TError>
{
    private readonly TValue? _value;
    private readonly TError? _error;

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    public TValue Value => IsSuccess ? _value! : throw new InvalidOperationException("Result is a failure; read Error.");
    public TError Error => IsFailure ? _error! : throw new InvalidOperationException("Result is a success; read Value.");

    private Result(TValue value) { _value = value; IsSuccess = true; }
    private Result(TError error) { _error = error; IsSuccess = false; }

    public static Result<TValue, TError> Success(TValue value) => new(value);
    public static Result<TValue, TError> Failure(TError error) => new(error);

    public static implicit operator Result<TValue, TError>(TValue value) => Success(value);
    public static implicit operator Result<TValue, TError>(TError error) => Failure(error);

    public TResult Match<TResult>(Func<TValue, TResult> onSuccess, Func<TError, TResult> onFailure)
        => IsSuccess ? onSuccess(_value!) : onFailure(_error!);
}

// Success marker for operations that return no value: Result<Done, TError>.
public readonly record struct Done
{
    public static readonly Done Value = default;
}
```

Gotchas:
- `default(Result<,>)`, including an uninitialised field of this type, is a **failure with a null
  `Error`**. Always construct one through `Success`/`Failure` or the implicit conversions.
- The implicit conversions let a method `return order;` or `return new NotFoundError(...)`. They
  become ambiguous when `TValue` and `TError` are the same type or related by inheritance, and C#
  applies no user-defined conversion from an interface-typed value. Call `Success`/`Failure`
  explicitly in those cases.
- The no-value form is named `Done`, not `Unit` (clashes with `MediatR.Unit`) or `Ok` (clashes with
  `Microsoft.AspNetCore.Http.HttpResults.Ok`).
- A discarded `Result` compiles silently. Treat one as a bug in review.

## Typed Error Records

```csharp
namespace MyApp.Domain.Errors;

public abstract record DomainError(string Message);

public sealed record NotFoundError(string Resource, object Id)
    : DomainError($"{Resource} with id '{Id}' was not found.");

public sealed record ConflictError(string Resource, string Reason)
    : DomainError($"{Resource} conflict: {Reason}");

public sealed record ValidationError(string Field, string Reason)
    : DomainError($"Validation failed for '{Field}': {Reason}");

public sealed record ForbiddenError(string Action, string Resource)
    : DomainError($"Not permitted to {Action} {Resource}.");
```

## Returning Results

The aggregate owns the business rule and returns a result. The service propagates it rather than
re-checking state:

```csharp
public class OrderService(IOrderRepository repo, TimeProvider clock)
{
    public async Task<Result<Order, DomainError>> CancelAsync(Guid id, CancellationToken ct)
    {
        var order = await repo.GetByIdAsync(id, ct);
        if (order is null)
            return new NotFoundError("Order", id);

        var cancelled = order.Cancel(clock);     // Result<Done, DomainError>
        if (cancelled.IsFailure)
            return cancelled.Error;

        await repo.SaveChangesAsync(ct);
        return order;
    }
}
```

## Mapping Results to HTTP (Minimal API)

```csharp
app.MapPost("/orders/{id:guid}/cancel", async (Guid id, OrderService svc, CancellationToken ct) =>
{
    var result = await svc.CancelAsync(id, ct);
    return result.Match<IResult>(order => TypedResults.Ok(order), MapError);
});

static IResult MapError(DomainError error) => error switch
{
    NotFoundError e   => TypedResults.Problem(e.Message, statusCode: StatusCodes.Status404NotFound),
    ConflictError e   => TypedResults.Problem(e.Message, statusCode: StatusCodes.Status409Conflict),
    ForbiddenError e  => TypedResults.Problem(e.Message, statusCode: StatusCodes.Status403Forbidden),
    ValidationError e => TypedResults.ValidationProblem(
        new Dictionary<string, string[]> { [e.Field] = [e.Reason] }),
    _                 => TypedResults.Problem(error.Message, statusCode: StatusCodes.Status500InternalServerError)
};
```

- A domain `ForbiddenError` maps to a 403 **problem**, not `TypedResults.Forbid()`. `Forbid()` runs
  the authentication handler's forbid flow, which for cookie auth redirects to an access-denied page.
- Leave `type` unset. `AddProblemDetails()` fills `type` and `title` with the RFC 9110 section URI
  for the status code (e.g. 404 → `https://tools.ietf.org/html/rfc9110#section-15.5.5`).
- Returning `IResult` loses OpenAPI response metadata. Declare `.ProducesProblem(404)` and so on for
  the endpoint, or return a `Results<Ok<T>, ProblemHttpResult, ...>` union.

Controller mapping: `references/controllers-and-jobs.md`.

## ProblemDetails (RFC 9457)

RFC 9457 obsoletes RFC 7807. The JSON shape is unchanged.

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Instance =
            $"{ctx.HttpContext.Request.Method} {ctx.HttpContext.Request.Path}";
        ctx.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier;
    };
});
```

| Field | Description | Example |
|-------|-------------|---------|
| `status` | HTTP status code | `404` |
| `title` | Short human-readable summary | `"Not Found"` |
| `type` | URI identifying the problem type | `"https://tools.ietf.org/html/rfc9110#section-15.5.5"` |
| `detail` | Specific explanation for this occurrence | `"Order 42 was not found."` |
| `instance` | Reference to this occurrence | `"GET /orders/42"` |

## Global Exception Handler

Catches unhandled exceptions at the HTTP boundary. Writing through `IProblemDetailsService` keeps
the `CustomizeProblemDetails` callback (traceId, instance) in the response:

```csharp
public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception exception, CancellationToken ct)
    {
        logger.LogError(exception, "Unhandled exception on {Method} {Path}", ctx.Request.Method, ctx.Request.Path);

        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            Exception = exception,
            ProblemDetails = { Title = "An unexpected error occurred." }
        });
    }
}

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

app.UseExceptionHandler();   // first in the pipeline, before routing
```

Never put `exception.Message` or the stack trace in `detail`, because it reaches the client.

Background-job exception boundaries: `references/controllers-and-jobs.md`.

## Do / Don't

| Do | Don't |
|----|-------|
| Return `Result<TValue, TError>` for domain failures | Throw `DomainException` for expected failure paths |
| Define typed error records per domain concept | Use stringly-typed error messages |
| Catch exceptions only at HTTP/job boundaries | Catch `Exception` at the service or repository layer |
| Log at the boundary with full exception | Log the same exception multiple times as it propagates |
| Use `TypedResults` (compile-time checked) over `Results` | Mix `IActionResult` and `IResult` in the same endpoint |
| Include `traceId` in ProblemDetails extensions | Expose stack traces or internal exception messages to clients |

## See Also
- `skills/modern-csharp/SKILL.md` — record and pattern-matching gotchas used in error types
- `skills/aspnet-api-patterns/SKILL.md` — endpoint conventions that consume these patterns
