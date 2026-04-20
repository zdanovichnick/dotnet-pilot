---
name: ef-core-patterns
description: EF Core best practices reference — safe migrations, query optimization, configuration patterns, and common pitfalls.
---

# EF Core Patterns

Reference material for EF Core development. Used by `dnp-ef-migration-planner` and `dnp-planner`.

## Migration Safety

### Safe Operations
- Adding a new table
- Adding a nullable column
- Adding a column with a default value
- Adding an index
- Renaming (with `migrationBuilder.RenameColumn` — preserves data)

### Dangerous Operations (require confirmation)
- Dropping a column (data loss)
- Changing column type (potential data truncation)
- Adding NOT NULL column without default (fails on existing rows)
- Dropping a table (data loss)
- Removing an index (performance impact)

### Migration Best Practices
- One migration per logical change
- Never edit generated migration files manually
- Always test with `--dry-run` before applying
- Keep migrations small and reversible
- Use `migrationBuilder.Sql()` for data migrations, not EF operations

## Configuration Patterns

### Fluent API (preferred)
```csharp
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Email).HasMaxLength(256).IsRequired();
        builder.HasIndex(u => u.Email).IsUnique();
        builder.HasMany(u => u.Orders).WithOne(o => o.User).HasForeignKey(o => o.UserId);
    }
}
```

### DbContext Registration
```csharp
// In OnModelCreating:
modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
```

## Query Optimization

### Do
- Use `AsNoTracking()` for read-only queries
- Use projections (`Select`) to fetch only needed columns
- Use `Include` with `ThenInclude` for eager loading (avoid N+1)
- Use split queries for many includes: `.AsSplitQuery()`
- Use `ExecuteUpdateAsync` / `ExecuteDeleteAsync` for bulk operations (EF 7+)

### Don't
- Don't call `ToList()` before filtering (materializes entire table)
- Don't use `Count()` when you need `Any()`
- Don't load navigation properties you don't need
- Don't use `FromSqlRaw` with string interpolation (SQL injection risk)
- Don't forget `CancellationToken` on async queries

## See Also
- `references/migration-patterns.md` — detailed migration scenarios
- `references/performance-patterns.md` — advanced query optimization
