using System.Text.Json.Serialization;

namespace DotnetPilot.Mcp.Roslyn.Models;

public sealed class ArchitectureReport
{
    [JsonPropertyName("style")]
    public required string Style { get; init; }

    [JsonPropertyName("layers")]
    public required List<LayerInfo> Layers { get; init; }

    [JsonPropertyName("violations")]
    public required List<ArchitectureViolation> Violations { get; init; }

    [JsonPropertyName("violationCount")]
    public int ViolationCount => Violations.Count;
}

public sealed class LayerInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("layer")]
    public required string Layer { get; init; }

    [JsonPropertyName("allowedDependencies")]
    public required List<string> AllowedDependencies { get; init; }

    [JsonPropertyName("actualDependencies")]
    public required List<string> ActualDependencies { get; init; }
}

public sealed class ArchitectureViolation
{
    [JsonPropertyName("severity")]
    public required string Severity { get; init; }

    [JsonPropertyName("sourceProject")]
    public required string SourceProject { get; init; }

    [JsonPropertyName("sourceLayer")]
    public required string SourceLayer { get; init; }

    [JsonPropertyName("targetProject")]
    public required string TargetProject { get; init; }

    [JsonPropertyName("targetLayer")]
    public required string TargetLayer { get; init; }

    [JsonPropertyName("rule")]
    public required string Rule { get; init; }
}
