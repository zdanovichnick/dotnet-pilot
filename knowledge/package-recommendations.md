---
name: package-recommendations
description: Vetted NuGet packages by category. Prefer these over alternatives unless there's a documented reason.
---

# NuGet Package Recommendations

## Resilience
| Package | Version | Use |
|---------|---------|-----|
| `Microsoft.Extensions.Resilience` | 9+ | Polly v8 integration — ResiliencePipeline, retry, circuit-breaker, timeout, hedging |
| `Microsoft.Extensions.Http.Resilience` | 9+ | HttpClient-specific Polly pipelines via AddResilienceHandler |

## Logging
| Package | Use |
|---------|-----|
| `Serilog.AspNetCore` | Structured logging with sinks |
| `Serilog.Enrichers.Environment` | Machine/environment enrichment |
| `Serilog.Enrichers.Thread` | Thread ID enrichment |
| `Serilog.Sinks.Console` | Console output (development) |
| `Serilog.Sinks.OpenTelemetry` | OTEL-compatible sink (production) |

## Validation
| Package | Use |
|---------|-----|
| `FluentValidation` | Rule-based validation — prefer over DataAnnotations for complex rules |
| `FluentValidation.AspNetCore` | Auto-wiring with ASP.NET model binding |

## Testing
| Package | Use |
|---------|-----|
| `xunit` | Test framework |
| `xunit.runner.visualstudio` | VS test runner |
| `NSubstitute` | Mocking — prefer over Moq (cleaner API, no setup/verify sprawl) |
| `FluentAssertions` | Assertion library — `.Should().Be()` over Assert.Equal |
| `Testcontainers` | Container-based integration testing |
| `Testcontainers.MsSql` | SQL Server container |
| `Testcontainers.PostgreSql` | PostgreSQL container |
| `Testcontainers.Redis` | Redis container |
| `Microsoft.AspNetCore.Mvc.Testing` | WebApplicationFactory for HTTP integration tests |
| `Bogus` | Fake data generation for tests |

## Caching
| Package | Use |
|---------|-----|
| `Microsoft.Extensions.Caching.Hybrid` | HybridCache (.NET 9+) — L1 memory + L2 distributed |
| `Microsoft.Extensions.Caching.StackExchangeRedis` | Redis as L2 cache backend |

## Observability
| Package | Use |
|---------|-----|
| `OpenTelemetry.Extensions.Hosting` | OTEL SDK for .NET |
| `OpenTelemetry.Instrumentation.AspNetCore` | HTTP request tracing |
| `OpenTelemetry.Instrumentation.EntityFrameworkCore` | EF Core query tracing |
| `OpenTelemetry.Exporter.OpenTelemetryProtocol` | OTLP exporter (Aspire, Jaeger, etc.) |

## Messaging
| Package | Use |
|---------|-----|
| `Wolverine` | In-process and outbox messaging with Mediator-like API |
| `MediatR` | CQRS mediator pattern (simpler, no outbox) |
| `MassTransit` | Distributed messaging (RabbitMQ, Azure Service Bus, etc.) |

## API Documentation
| Package | Use |
|---------|-----|
| `Microsoft.AspNetCore.OpenApi` | .NET 9+ built-in OpenAPI document generation |
| `Scalar.AspNetCore` | Modern API docs UI (replaces Swagger UI) |

## Packages to Avoid
| Package | Reason |
|---------|--------|
| `Newtonsoft.Json` | Use `System.Text.Json` unless consuming a legacy API that requires it |
| `AutoMapper` | Encourages implicit mapping — use explicit projection or records |
| `Dapper + EF Core together` | Pick one ORM approach per DbContext boundary |
| Any package with last commit > 2 years and no active fork | Unmaintained |
