---
description: "Generate tests for existing code — unit, integration, or WebApplicationFactory tests."
argument-hint: "<class-or-method> [--integration] [--style unit|integration|e2e]"
effort: medium
---

# Write Tests

`/dotnet-pilot:dotnet:write-tests` generates tests for existing production code.

> **Delegates to**: `dnp-test-writer` (sonnet, effort high).

## Difference from `dotnet:run-tests`

`dotnet:run-tests` *executes* your existing test suite and diagnoses failures.
`dotnet:write-tests` *creates new tests* for production code that lacks coverage.

## Difference from `dotnet:tdd`

`dotnet:tdd` implements a feature from scratch using RED-GREEN-REFACTOR (writes both tests and production code).
`dotnet:write-tests` adds tests to *existing* production code — it never modifies production files.

## Execution

1. Identify the target: class, method, or namespace from the argument. If no target was provided, use `AskUserQuestion` to gather it — never ask via plain text.
2. Read the target code and its dependencies (constructor injection, interfaces).
3. Detect the test project and its conventions:
   - Framework: xUnit / NUnit / MSTest
   - Mocking: NSubstitute / Moq / FakeItEasy
   - Assertions: FluentAssertions / Shouldly / framework-native
4. Spawn `dnp-test-writer` with:
   - Target source file(s)
   - Detected test conventions
   - Style directive (`--style` flag, default: `unit`)
   - Existing test examples from the project (for pattern matching)
5. Run `dotnet test` to verify the new tests compile and pass.
6. Report: number of tests created, coverage areas, any tests that need manual attention.

## Styles

- **unit** — isolated tests with mocked dependencies (default)
- **integration** — `WebApplicationFactory<Program>` tests hitting real middleware/DI
- **e2e** — full HTTP client tests against a running test server
