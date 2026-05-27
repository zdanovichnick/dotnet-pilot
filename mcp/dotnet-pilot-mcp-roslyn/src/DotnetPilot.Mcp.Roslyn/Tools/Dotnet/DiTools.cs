using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

[McpServerToolType]
public sealed class DiTools
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    [McpServerTool(Name = "find_di_registrations"), Description("Finds all DI service registrations across the solution. Returns interface, implementation, lifetime, method, file, and line for each registration.")]
    public static async Task<string> FindRegistrations(WorkspaceCache workspace, CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var registrations = await DiAnalyzer.FindRegistrationsAsync(solution, ct);
        return JsonSerializer.Serialize(registrations, JsonOptions);
    }

    [McpServerTool(Name = "find_di_consumers"), Description("Finds all classes with constructor injection across the solution. Returns type, file, line, and constructor parameter types for each consumer.")]
    public static async Task<string> FindConsumers(WorkspaceCache workspace, CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var consumers = await DiAnalyzer.FindConsumersAsync(solution, ct);
        return JsonSerializer.Serialize(consumers, JsonOptions);
    }

    [McpServerTool(Name = "check_di_completeness"), Description("Cross-references DI registrations with consumers. Returns registered services, missing registrations (consumed but not registered), and captive dependencies (Scoped inside Singleton).")]
    public static async Task<string> CheckCompleteness(WorkspaceCache workspace, CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var report = await DiAnalyzer.CheckCompletenessAsync(solution, ct);
        return JsonSerializer.Serialize(report, JsonOptions);
    }
}
