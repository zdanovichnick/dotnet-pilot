---
name: api-contract
description: The seam between an ASP.NET Core API and its TypeScript client — the contract format, generating TypeScript types from the API's OpenAPI document, and the C#-to-JSON mismatches that break the client.
when_to_use: A change touches both an ASP.NET endpoint and the TypeScript code that calls it; writing or reviewing a request/response contract; generating or checking TypeScript types against the API's OpenAPI document.
---

# API Contract

One contract, written before either side is coded. The server implements it, the client consumes
it, and generated types prove afterwards that the two agree.

## Contract format

State every point; a point left out is a point the two sides will guess differently.

```
POST /api/orders/{orderId}/notes        auth: Bearer, policy "Orders.Write"

Request   { "text": string (1..2000), "pinned": boolean? }
201       { "id": string (guid), "text": string, "pinned": boolean, "createdAt": string (ISO 8601) }
400       ProblemDetails + errors: { "text": ["..."] }      validation failed
404       ProblemDetails                                    order not found
409       ProblemDetails, type ".../order-closed"           order is closed
```

- Property names are the **wire names** (camelCase by default), not the C# names.
- Mark each property required, optional (may be absent) or nullable (present, may be `null`).
- List every status code the client must handle. Each one needs a UI answer.

## The seam module

The client declares the contract's types in **one** module (for example `src/api/orders.ts`) and
every component imports them from there. While the API is being built, the types are written by
hand from the contract. Afterwards the module re-exports the generated types, so a mismatch is a
compiler error in one known file and not a runtime surprise in a component.

```ts
import type { components } from './schema';

export type OrderNote = components['schemas']['OrderNoteResponse'];
export type CreateOrderNote = components['schemas']['CreateOrderNoteRequest'];
```

## Generating the types

An existing script in the client's `package.json` wins. Use it and do not add a second generator
(`openapi-typescript`, orval, NSwag and hand-written `fetch` types do not mix).

When the project has none, the build-time document plus `openapi-typescript` is the default:

```xml
<!-- API .csproj -->
<PackageReference Include="Microsoft.Extensions.ApiDescription.Server" Version="..." PrivateAssets="all" />
<PropertyGroup>
  <OpenApiGenerateDocumentsOnBuild>true</OpenApiGenerateDocumentsOnBuild>
  <OpenApiDocumentsDirectory>$(MSBuildProjectDirectory)/openapi</OpenApiDocumentsDirectory>
</PropertyGroup>
```

```bash
dotnet build <Api.csproj>
npx openapi-typescript <path>/<ApiProject>.json -o <frontend>/src/api/schema.d.ts
npx tsc --noEmit -p <frontend>
```

- Without `OpenApiDocumentsDirectory` the document lands in `obj/`, named after the project.
- Adding the package is a package decision. Ask before adding it.
- **Build-time generation runs the app's startup code.** An API whose startup needs a live
  database or a secret store can fail to generate. Guard that code on the entry assembly, or fall
  back to the existing script.
- Generate from the document the **local** build produced. A script that downloads the document
  from a deployed environment cannot see an endpoint that is not deployed yet.
- With `openapi-fetch`, `createClient<paths>()` types the routes too, so a wrong URL or verb is
  also a compiler error.

Server-side OpenAPI setup (`AddOpenApi`, transformers, one document per API version) is in
`skills/aspnet-api-patterns/SKILL.md`.

## Mismatches that bite

| C# side | On the wire | TypeScript consequence |
|---------|-------------|------------------------|
| `PascalCase` property | `camelCase` by default | A hand-typed `OrderId` reads `undefined`. A `[JsonPropertyName]` or a naming-policy change renames the wire field |
| `enum` | **number** by default | `status === 'Shipped'` is never true. A string union is correct only when `JsonStringEnumConverter` is registered |
| `DateTime`, `DateTimeOffset`, `DateOnly` | ISO 8601 **string** | The type is `string`, not `Date`. Parse at the seam. `DateTime` with `Kind=Unspecified` carries no offset, so the browser reads it as local time |
| `long`, `ulong` | JSON number | Values above 2^53 lose precision in JavaScript. Send identifiers of that size as strings |
| `decimal` | JSON number | Becomes a binary float. Do not do money arithmetic on it in the client |
| `Guid` | string | No client-side type check beyond `string` |
| `string?` vs `string` | nullable vs required | Follows nullable reference types. A project with nullable disabled reports everything as optional |
| `T?` property that is omitted when null | absent, not `null` | `prop?: T` and `prop: T \| null` are different types. Match the serializer's `DefaultIgnoreCondition` |
| `Dictionary<string, T>` | object | `Record<string, T>`. Keys keep their original casing; the naming policy does not touch them |
| Error result | `application/problem+json` | The error body is `ProblemDetails` (`type`, `title`, `status`, `detail`, plus `errors` for validation), not the success type. Type both branches |

A `200` with an empty body, a `204`, and a `201` with a `Location` header are three different
client code paths. The contract says which one.

## Contract changes

The contract is fixed once both sides start. A side that needs a change stops and reports it; it
does not edit its own half and continue. The other side is working from the old text.
