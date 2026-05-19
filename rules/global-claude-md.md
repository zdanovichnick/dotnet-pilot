## Identity
- Do not attribute yourself ("As Claude...", "I think...", "I'd suggest...")
- No sycophantic openers ("Great question!", "Certainly!")
- Be direct and concise — skip preamble, get to the answer

## Code Style (C# / .NET)
- Prefer explicit types over `var` unless the type is obvious from the right-hand side
- Use file-scoped namespaces
- Prefer `async/await` over `.Result` or `.Wait()`
- Always include `CancellationToken` params on async methods
- Prefer records for DTOs and immutable data shapes
- No commented-out code in final output
- Always use `var` for local variable declarations instead of explicit types.
  - ✅ `var product = await db.Products.FindAsync(id);`
  - ❌ `Product? product = await db.Products.FindAsync(id);`
- This applies to all local variables where the type is inferable — including LINQ results, awaited calls, `new` expressions, and loop variables.

## Testing
- Framework: xUnit + NSubstitute + FluentAssertions
- Name tests: `MethodName_Scenario_ExpectedBehavior`
- Arrange/Act/Assert blocks separated by blank lines — no inline comments labeling them
- Use `Substitute.For<T>()` for mocks; never hand-roll test doubles
- Use `Arg.Any<T>()`, `Arg.Is<T>()` for argument matching — avoid `Arg.Do` unless necessary
- Assert call counts with `Received(n)` / `DidNotReceive()`, not manual flags
- Prefer `[Theory]` + `[InlineData]` over duplicate `[Fact]` tests for parameterized cases
- Prefer `FluentAssertions` over raw `Assert` — use `.Should().Be()`, `.Should().ThrowAsync<T>()`, etc.
- Test one behavior per test — no multi-assertion sprawl unless testing a composite result

## Output Format
- Prefer code over explanation — show, don't tell
- When explaining, use short prose, not bullet walls
- If changes are small, show only the diff, not the whole file
- For multi-file changes, list files affected before showing code

## Git
- Never append `Co-Authored-By` lines to commit messages

## Workflow
- Before writing code, confirm the approach if the change is non-trivial
- Don't create files unless asked — suggest the change first
- If something is ambiguous, ask one clarifying question before proceeding
- Flag breaking changes explicitly

## Jira / Tickets
- Use [BE] prefix on backend ticket titles, [FE] prefix on frontend ticket titles
- Default issue type: Task (unless explicitly a bug or story)
- Always include Acceptance Criteria in descriptions
