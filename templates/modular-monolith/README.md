# Modular Monolith Template

Use this template for a system with multiple bounded contexts that share a deployment unit.

**Best fit:**
- 3+ bounded contexts with clear ownership boundaries
- Team wants microservice-like modularity without distributed system complexity
- Inter-module communication via in-process messaging
- Future option to extract modules to services without code rewrites

**Stack assumptions:**
- .NET 10
- Wolverine for in-process messaging and outbox
- EF Core with separate DbContext per module
- Shared kernel for common types only

**How to use:**
Copy `CLAUDE.md` to your project root.
