using System.Text.Json.Serialization;

namespace DotnetPilot.Mcp.Roslyn.Models;

public sealed class EfCoreReport
{
    [JsonPropertyName("contexts")]
    public required List<DbContextInfo> Contexts { get; init; }
}

public sealed class DbContextInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }

    [JsonPropertyName("entities")]
    public required List<EntityInfo> Entities { get; init; }

    [JsonPropertyName("project")]
    public required string Project { get; init; }
}

public sealed class EntityInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("dbSetProperty")]
    public string? DbSetProperty { get; init; }

    [JsonPropertyName("properties")]
    public required List<EntityPropertyInfo> Properties { get; init; }

    [JsonPropertyName("navigations")]
    public required List<NavigationInfo> Navigations { get; init; }

    [JsonPropertyName("configuredVia")]
    public required string ConfiguredVia { get; init; }
}

public sealed class EntityPropertyInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isNullable")]
    public bool IsNullable { get; init; }

    [JsonPropertyName("isKey")]
    public bool IsKey { get; init; }

    [JsonPropertyName("hasColumnAttribute")]
    public bool HasColumnAttribute { get; init; }
}

public sealed class NavigationInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isCollection")]
    public bool IsCollection { get; init; }

    [JsonPropertyName("targetEntity")]
    public required string TargetEntity { get; init; }
}
