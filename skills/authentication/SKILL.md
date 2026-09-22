---
name: authentication
description: JWT bearer auth, ASP.NET Identity, OIDC, and policy-based authorization patterns for ASP.NET Core APIs.
when_to_use: Adding JWT bearer, Identity, OIDC, or policy/resource-based authorization to an ASP.NET Core API; ordering the auth pipeline; reading claims.
---

# Authentication & Authorization Patterns

Reference for securing ASP.NET Core APIs. Covers JWT bearer, ASP.NET Identity, OIDC, policy-based authorization, and resource-based authorization.

## Quick Decision Guide

| Scenario | Approach |
|----------|---------|
| API consumed by SPAs or mobile apps with an external IdP | JWT Bearer |
| Server-rendered app with local user accounts + roles | ASP.NET Identity |
| Federated login (Google, Entra ID, Keycloak) | OIDC + `AddOpenIdConnect` |
| Fine-grained permissions beyond roles | Policy-based + `IAuthorizationHandler` |
| Resource ownership check (user can only edit their own order) | Resource-based authorization |

## Required Pipeline Order

```csharp
// Order matters — authentication must run before authorization
app.UseAuthentication();  // sets HttpContext.User
app.UseAuthorization();   // evaluates policies
```

## References

Load only the file the task needs:

| File | Covers |
|------|--------|
| `references/jwt-bearer.md` | `AddJwtBearer` against an IdP; symmetric-key validation for internal services without one |
| `references/aspnet-identity.md` | Database-backed users and roles with ASP.NET Identity |
| `references/oidc.md` | `AddOpenIdConnect` with an external provider |
| `references/authorization.md` | Registering and applying policies; resource-based `IAuthorizationHandler` (requirement, handler, endpoint usage) |
| `references/claims-and-schemes.md` | Reading claims from `HttpContext.User`; multi-scheme authentication |

## Do / Don't

| Do | Don't |
|----|-------|
| Set `ClockSkew = TimeSpan.Zero` | Allow the default 5-minute token expiry grace period in production |
| Validate both `iss` and `aud` | Disable issuer or audience validation for convenience |
| Use `FallbackPolicy` to require auth by default | Rely on `[Authorize]` placement — it's easy to forget |
| Use policy-based authorization for permissions | Hard-code role strings in `[Authorize(Roles = "...")]` throughout controllers |
| Use resource-based authorization for ownership checks | Put ownership logic inside domain services |
| Pick one claim-name scheme: raw names (`MapInboundClaims = false` + `NameClaimType`/`RoleClaimType`) or `ClaimTypes.*` | Mix `"sub"` lookups with `ClaimTypes.NameIdentifier` lookups — one of them returns null |
| Store permissions as claims in the token | Re-query the DB for permissions on every request |
| Use `RequireAuthenticatedUser()` as fallback policy | Open all endpoints and add `[Authorize]` selectively |
| `AllowAnonymous()` on health check / public endpoints | Forget to exempt health endpoints from the fallback policy |

## See Also
- `skills/error-handling/SKILL.md` — `TypedResults.Forbid()` and mapping auth failures to ProblemDetails
- `skills/aspnet-api-patterns/SKILL.md` — endpoint conventions for protected routes
