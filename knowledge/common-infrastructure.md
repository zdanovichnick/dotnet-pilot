---
name: common-infrastructure
description: Copy-paste infrastructure implementations — Result pattern, validation filter, global exception handler, pagination, endpoint grouping.
---

# Common Infrastructure Implementations

## Result<TValue, TError>

```csharp
public readonly record struct Result<TValue, TError>
{
    private readonly TValue? _value;
    private readonly TError? _error;

    private Result(TValue value) { _value = value; IsSuccess = true; }
    private Result(TError error) { _error = error; IsSuccess = false; }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public TValue Value => IsSuccess ? _value! : throw new InvalidOperationException("Result has no value.");
    public TError Error => IsFailure ? _error! : throw new InvalidOperationException("Result has no error.");

    public static Result<TValue, TError> Success(TValue value) => new(value);
    public static Result<TValue, TError> Failure(TError error) => new(error);

    public TResult Match<TResult>(Func<TValue, TResult> onSuccess, Func<TError, TResult> onFailure)
        => IsSuccess ? onSuccess(_value!) : onFailure(_error!);
}
```

## GlobalExceptionHandler (IExceptionHandler)

```csharp
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken ct)
    {
        logger.LogError(exception, "Unhandled exception for {Method} {Path}",
            context.Request.Method, context.Request.Path);

        var problemDetails = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred",
            Type = "https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.1"
        };

        context.Response.StatusCode = problemDetails.Status.Value;
        await context.Response.WriteAsJsonAsync(problemDetails, ct);
        return true;
    }
}

// Registration in Program.cs:
// builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
// builder.Services.AddProblemDetails();
// app.UseExceptionHandler();
```

## FluentValidation Filter

```csharp
public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var argument = ctx.Arguments.OfType<T>().First();
        var result = await validator.ValidateAsync(argument);
        if (!result.IsValid)
        {
            return TypedResults.ValidationProblem(result.ToDictionary());
        }
        return await next(ctx);
    }
}

// Usage on minimal API endpoint:
// app.MapPost("/orders", CreateOrder).AddEndpointFilter<ValidationFilter<CreateOrderRequest>>();
```

## IEndpointGroup (Feature Folder Endpoint Registration)

```csharp
public interface IEndpointGroup
{
    void MapEndpoints(IEndpointRouteBuilder app);
}

// Extension to auto-register all groups:
public static class EndpointGroupExtensions
{
    public static IEndpointRouteBuilder MapEndpointGroups(this IEndpointRouteBuilder app)
    {
        var groups = typeof(IEndpointGroup).Assembly
            .GetExportedTypes()
            .Where(t => t.IsAssignableTo(typeof(IEndpointGroup)) && !t.IsAbstract)
            .Select(Activator.CreateInstance)
            .Cast<IEndpointGroup>();

        foreach (var group in groups)
            group.MapEndpoints(app);

        return app;
    }
}
```

## PagedList<T> + PaginationQuery

```csharp
public sealed record PaginationQuery(int Page = 1, int PageSize = 20)
{
    public int Skip => (Page - 1) * PageSize;
    public int Take => PageSize;
}

public sealed record PagedList<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize)
{
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasNextPage => Page < TotalPages;
    public bool HasPreviousPage => Page > 1;

    public static async Task<PagedList<T>> CreateAsync(
        IQueryable<T> source, PaginationQuery query, CancellationToken ct)
    {
        var count = await source.CountAsync(ct);
        var items = await source.Skip(query.Skip).Take(query.Take).ToListAsync(ct);
        return new PagedList<T>(items, count, query.Page, query.PageSize);
    }
}
```
