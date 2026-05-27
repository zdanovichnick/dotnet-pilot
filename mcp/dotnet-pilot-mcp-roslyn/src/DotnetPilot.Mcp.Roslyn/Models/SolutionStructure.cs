using System.Text.Json.Serialization;

namespace DotnetPilot.Mcp.Roslyn.Models;

public sealed class SolutionStructure
{
    [JsonPropertyName("solutionPath")]
    public required string SolutionPath { get; init; }

    [JsonPropertyName("projects")]
    public required List<ProjectInfo> Projects { get; init; }
}

public sealed class ProjectInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("path")]
    public required string Path { get; init; }

    [JsonPropertyName("outputKind")]
    public string? OutputKind { get; init; }

    [JsonPropertyName("targetFramework")]
    public string? TargetFramework { get; init; }

    [JsonPropertyName("documentCount")]
    public int DocumentCount { get; init; }

    [JsonPropertyName("projectReferences")]
    public required List<string> ProjectReferences { get; init; }

    [JsonPropertyName("packageReferences")]
    public List<string>? PackageReferences { get; init; }
}
