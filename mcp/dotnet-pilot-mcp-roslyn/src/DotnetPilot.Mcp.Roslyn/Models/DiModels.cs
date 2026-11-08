using System.Text.Json.Serialization;

namespace DotnetPilot.Mcp.Roslyn.Models;

public sealed class DiRegistration
{
    [JsonPropertyName("interface")]
    public string? Interface { get; init; }

    [JsonPropertyName("implementation")]
    public required string Implementation { get; init; }

    [JsonPropertyName("lifetime")]
    public required string Lifetime { get; init; }

    [JsonPropertyName("registrationMethod")]
    public required string RegistrationMethod { get; init; }

    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }
}

public sealed class DiConsumer
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }

    [JsonPropertyName("constructorParams")]
    public required List<DiParam> ConstructorParams { get; init; }
}

public sealed class DiParam
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }
}

public sealed class DiCompletenessReport
{
    [JsonPropertyName("registered")]
    public required List<DiRegistration> Registered { get; init; }

    [JsonPropertyName("missing")]
    public required List<DiMissing> Missing { get; init; }

    [JsonPropertyName("captive")]
    public required List<DiCaptive> Captive { get; init; }

    [JsonPropertyName("scans")]
    public required List<DiScan> Scans { get; init; }

    [JsonPropertyName("note")]
    public string? Note { get; init; }
}

public sealed class DiScan
{
    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }

    /// <summary><c>resolved</c>, <c>partial</c> or <c>unresolved</c>.</summary>
    [JsonPropertyName("status")]
    public string Status { get; init; } = "resolved";

    [JsonPropertyName("reasons")]
    public List<string> Reasons { get; init; } = [];

    [JsonPropertyName("registeredCount")]
    public int RegisteredCount { get; init; }
}

public sealed class DiScanRef
{
    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }
}

public sealed class DiMissing
{
    [JsonPropertyName("interface")]
    public required string Interface { get; init; }

    [JsonPropertyName("consumedBy")]
    public required List<DiConsumerRef> ConsumedBy { get; init; }

    /// <summary>True when a partial or unresolved Scrutor scan could register this type.</summary>
    [JsonPropertyName("possiblyRegisteredByScan")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? PossiblyRegisteredByScan { get; set; }

    [JsonPropertyName("candidateScans")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<DiScanRef>? CandidateScans { get; set; }
}

public sealed class DiConsumerRef
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }
}

public sealed class DiCaptive
{
    [JsonPropertyName("dependency")]
    public required string Dependency { get; init; }

    [JsonPropertyName("lifetime")]
    public required string Lifetime { get; init; }

    [JsonPropertyName("consumer")]
    public required string Consumer { get; init; }

    [JsonPropertyName("consumerLifetime")]
    public required string ConsumerLifetime { get; init; }

    [JsonPropertyName("file")]
    public required string File { get; init; }

    [JsonPropertyName("line")]
    public int Line { get; init; }
}
