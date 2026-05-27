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
}

public sealed class DiMissing
{
    [JsonPropertyName("interface")]
    public required string Interface { get; init; }

    [JsonPropertyName("consumedBy")]
    public required List<DiConsumerRef> ConsumedBy { get; init; }
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
