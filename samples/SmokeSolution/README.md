# SmokeSolution

A small clean-architecture solution with known defects planted on purpose. It is the fixture for
three things:

- the Roslyn server's integration tests (`DNP_TEST_SOLUTION` points here in CI);
- `node scripts/smoke-roslyn.js`, which drives the server over stdio and checks the findings below;
- the interactive host checks in [docs/HOST-PLUGINS.md](../../docs/HOST-PLUGINS.md#interactive-smoke-checks).

It builds and its tests pass. Don't "fix" the planted defects — each one is an expected finding.

## Layout

| Project | Layer | References |
|---|---|---|
| `Smoke.Domain` | Domain | — |
| `Smoke.Application` | Application | Domain |
| `Smoke.Infrastructure` | Infrastructure | Application (EF Core on SQLite, Scrutor) |
| `Smoke.Api` | Api | Application, Infrastructure |
| `Smoke.Tests` | Tests | Application |

## Expected findings

| Tool | Expected |
|---|---|
| `check_di_completeness` | `missing` is exactly `IPaymentGateway` (consumed by `OrderService`, never registered) |
| `check_di_completeness` | `captive`: `OrderCache` (Singleton) → `IOrderRepository` (Scoped) |
| `check_di_completeness` | one `scans` entry, `status: resolved` — the Scrutor scan in `Smoke.Infrastructure/DependencyInjection.cs` registers `AuditHandler` and `NotifyHandler` as `IOrderHandler` |
| `check_di_completeness` | not missing: `IEnumerable<IOrderHandler>` (always resolvable) and `DbContextOptions<SmokeDbContext>` (registered by `AddDbContext`) |
| `check_architecture_violations` | no violations |
| `detect_circular_dependencies` | no cycles |
| `get_ef_models` | `SmokeDbContext` with `Order` (fluent-configured) and `OrderLine` |
| `find_callers` on `OrderService.PlaceAsync` | `Smoke.Api/Program.cs` and `Smoke.Tests/OrderServiceTests.cs` |
| `find_dead_code` | no duplicates; the `DependencyInjection` classes are not reported (their extension methods are called) |

## Migrations

EF Core uses SQLite so `dotnet ef migrations add` and `migrations script` work offline; nothing
creates `smoke.db` unless a migration is applied. The Api host cannot start at design time (its DI
validation fails on the planted defects), so `SmokeDbContextFactory` builds the context for the
tools. Either project works as `--startup-project`:

```text
dotnet ef migrations add <Name> --project src/Smoke.Infrastructure --startup-project src/Smoke.Api
```

## Failing test on demand

`OrderServiceTests.SmokeFailure_WhenRequested_Fails` fails when `SMOKE_FAIL=1` is set in the
environment, so a host check can confirm a red test is reported as red. Without it, all tests pass.
