using System.ComponentModel;
using DotnetPilot.Mcp.Roslyn.Workspace;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.Workspace;

[McpServerToolType]
public sealed class ReloadSolutionTool
{
    [McpServerTool(Name = "reload_solution"), Description("Discards the cached workspace and loads the solution from disk. Pass solutionPath to load a different solution, or the first one when another tool reports that no solution is loaded. Edited, added and deleted .cs files and project/solution/Directory.Build.* changes are picked up automatically on every tool call; otherwise use this only when a result contradicts the code on disk.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Absolute path of a .sln/.slnx file, or a directory to search upward from. Omit to reload the current solution.")] string? solutionPath = null,
        CancellationToken ct = default)
    {
        var solution = await workspace.ReloadAsync(solutionPath, ct);
        return $"Solution reloaded. {solution.ProjectIds.Count} projects loaded from {workspace.SolutionPath}.";
    }
}
