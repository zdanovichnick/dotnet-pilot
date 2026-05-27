using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

[McpServerToolType]
public sealed class EfCoreTools
{
    [McpServerTool(Name = "get_ef_models"), Description("Discovers all EF Core DbContexts and their entity models across the solution. Returns entity properties, navigation relationships, key detection, and configuration method (fluent/annotations/convention) for each entity.")]
    public static async Task<string> GetModels(WorkspaceCache workspace, CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var report = await EfCoreAnalyzer.AnalyzeAsync(solution, ct);
        return JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
    }
}
