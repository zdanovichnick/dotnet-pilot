using System.ComponentModel;
using DotnetPilot.Mcp.Roslyn.Workspace;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.Workspace;

[McpServerToolType]
public sealed class ReloadSolutionTool
{
    [McpServerTool(Name = "reload_solution"), Description("Invalidates the cached workspace and reloads the solution from disk. Use after adding/removing projects or making structural changes.")]
    public static async Task<string> Execute(WorkspaceCache workspace, CancellationToken ct)
    {
        await workspace.ReloadAsync(ct);
        var solution = await workspace.GetSolutionAsync(ct);
        return $"Solution reloaded. {solution.ProjectIds.Count} projects loaded.";
    }
}
