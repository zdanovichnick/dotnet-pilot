---
name: modern-csharp
description: C# 12–14 gotchas on .NET 10 — primary constructors, collection expressions, records, pattern matching, nullable reference types, the `field` keyword, extension members, null-conditional assignment, and async/cancellation pitfalls.
when_to_use: Modernizing C# or reviewing idiom — primary constructors, collection expressions, records, pattern matching, nullable annotations, C# 14 features, async and CancellationToken usage.
---

# Modern C# (12–14)

.NET 10 ships C# 14 as the default language version — no `<LangVersion>` needed. The syntax of these
features is assumed known; this file carries the traps.

## Primary Constructors (C# 12)

- Parameters are captured as **mutable** hidden fields, not `readonly`. Assigning to one inside a
  method mutates class state. When that matters, copy into `private readonly T _x = x;` and use only
  the field.
- Using a parameter both to initialise a field **and** directly in a member body captures it twice
  (warning CS9124) — two copies that can diverge. Pick one.
- On records, primary-constructor parameters become public properties; on classes and structs they
  do not.

## Collection Expressions (C# 12)

- The concrete type behind `IEnumerable<T> x = [..]` / `IReadOnlyList<T> x = [..]` is compiler-chosen.
  Don't downcast it to `List<T>` or `T[]`.
- `[..a, ..b]` allocates a new collection every time. On a hot path that is a real allocation, not
  a view.

## Records

- Equality is member-wise, but collection members compare **by reference**: two records holding equal
  `List<T>` contents are not equal. Records used as EF keys, cache keys or dedupe keys need scalar
  members or a custom `Equals`.
- `with` is a shallow copy — a mutated list inside the copy is the original's list.
- `record struct` is a value type; it is not guaranteed to be stack-allocated (boxed in interfaces,
  on the heap as a field of a class). Unlike `readonly record struct`, it is mutable.
- `required` members are bypassed by a constructor marked `[SetsRequiredMembers]` — the compiler then
  trusts that constructor to set them all.

## Pattern Matching

- `is not null or 42` parses as `(is not null) or 42`; the compiler warns that `42` is redundant.
  Write `is not (null or 42)`.
- A switch expression without a discard arm throws `SwitchExpressionException` at runtime on an
  unmatched value. Add `_ => throw new UnreachableException()` so the failure is explicit.

## Nullable Reference Types

- Annotations are compile-time only. Deserialisers (System.Text.Json, EF materialisation, model
  binding) can still hand you `null` in a non-nullable property — validate at the boundary.
- `!` silences the warning without changing runtime behaviour. Each one should have a reason the
  flow analysis can't see.
- Prefer `is { } x` / `is not null` over `!= null` — user-defined `==` operators can change the result
  of the latter.

## `field` Keyword (C# 14, GA)

```csharp
public string Name
{
    get;
    set => field = value?.Trim() ?? throw new ArgumentNullException(nameof(value));
}
```

- Inside any property accessor, `field` now binds to the synthesised backing field. An existing
  member named `field` is shadowed (warning CS9258). Refer to it as `this.field` or `@field`, or
  rename it. A local named `field` inside an accessor is an error (CS9272).

## Extension Members (C# 14)

Extension blocks add extension **properties** and **static** extension members, not just methods:

```csharp
public static class EnumerableExtensions
{
    extension<TSource>(IEnumerable<TSource> source)      // instance extensions: receiver is named
    {
        public bool IsEmpty => !source.Any();
    }

    extension<TSource>(IEnumerable<TSource>)             // static extensions: receiver type only
    {
        public static IEnumerable<TSource> Identity => [];
    }
}
```

- Classic `this`-parameter extension methods keep working and can live in the same static class.
- `extension` is now a contextual keyword: a type, alias or type parameter named `extension` no
  longer compiles. Escape it as `@extension`.

## Null-Conditional Assignment (C# 14)

```csharp
customer?.Order = GetCurrentOrder();   // GetCurrentOrder() runs only when customer is non-null
counter?.Total += 1;                   // compound assignment works
```

- The right-hand side is **not evaluated** when the receiver is null. Side effects there are skipped
  too.
- `++` / `--` are not allowed on a null-conditional target.

## Implicit Span Conversions (C# 14)

Arrays now convert implicitly to `Span<T>` / `ReadOnlySpan<T>`, so overload resolution can pick a
span overload where C# 13 picked `IEnumerable<T>`:

- Some calls become ambiguous (for example xUnit `Assert.Equal(expectedArray, actualArray)` with
  collection-expression arguments). Fix with `.AsSpan()` or an explicit type.
- A covariant array (`object[] o = stringArray`) passed to a newly chosen `Span<T>` overload throws
  `ArrayTypeMismatchException` at runtime.

## Async & Cancellation Gotchas

- Thread the `CancellationToken` all the way down: every async call that accepts one gets it. A
  token that stops at the service layer means an abandoned request keeps the DB query running.
- Never `.Result`, `.Wait()` or `.GetAwaiter().GetResult()` on a call path that could be async — it
  blocks a thread-pool thread and deadlocks under a synchronisation context.
- `ConfigureAwait(false)`: skip it in ASP.NET Core app code (there is no synchronisation context);
  use it in reusable libraries that may run under a UI or legacy ASP.NET context.
- A `ValueTask` may be awaited **once**. Don't await it twice, store it, or `.Result` it before it
  completes — call `.AsTask()` if you need any of that.
- `async void` only for event handlers: an exception in it crashes the process instead of reaching
  the caller.
- Catching `OperationCanceledException` when the request token fired is not an error — let it
  propagate or log it at Information level, not Error.
- Linked or timeout `CancellationTokenSource`s are `IDisposable` — `using var cts = ...`.
- Returning a task without `await` from inside a `using`/`try` block disposes or exits before the
  task finishes. Await it.

## See Also
- `skills/error-handling/SKILL.md` — the `Result<TValue, TError>` type these features build on
- `skills/clean-architecture/SKILL.md` — layer conventions these features apply within
