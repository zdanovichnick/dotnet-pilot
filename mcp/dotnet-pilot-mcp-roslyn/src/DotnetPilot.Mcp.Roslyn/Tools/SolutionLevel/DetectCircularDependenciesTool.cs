using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class DetectCircularDependenciesTool
{
    [McpServerTool(Name = "detect_circular_dependencies"), Description("Detects circular dependencies in the project reference graph using DFS. Cycles between projects break the build and indicate architectural issues. Returns each cycle as an ordered list of project names.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var projects = solution.Projects.ToList();
        var idToName = projects.ToDictionary(p => p.Id, p => p.Name);
        var graph = projects.ToDictionary(
            p => p.Id,
            p => p.ProjectReferences.Select(r => r.ProjectId).Where(idToName.ContainsKey).ToList());

        var cycles = new List<List<string>>();
        var visited = new HashSet<ProjectId>();
        var seenCycles = new HashSet<string>(StringComparer.Ordinal);

        foreach (var project in projects)
        {
            if (visited.Contains(project.Id)) continue;
            var stack = new List<ProjectId>();
            var onStack = new HashSet<ProjectId>();
            Dfs(project.Id, graph, idToName, visited, stack, onStack, cycles, seenCycles);
        }

        return JsonSerializer.Serialize(new
        {
            projectCount = projects.Count,
            cycleCount = cycles.Count,
            projectCycles = cycles.Select(c => new { cycle = c }).ToList()
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    private static void Dfs(
        ProjectId current,
        Dictionary<ProjectId, List<ProjectId>> graph,
        Dictionary<ProjectId, string> idToName,
        HashSet<ProjectId> visited,
        List<ProjectId> stack,
        HashSet<ProjectId> onStack,
        List<List<string>> cycles,
        HashSet<string> seenCycles)
    {
        stack.Add(current);
        onStack.Add(current);

        foreach (var next in graph[current])
        {
            if (onStack.Contains(next))
            {
                var startIndex = stack.IndexOf(next);
                var cycle = stack.Skip(startIndex).Select(id => idToName[id]).ToList();
                cycle.Add(idToName[next]);

                var key = string.Join("|", cycle.OrderBy(n => n, StringComparer.Ordinal));
                if (seenCycles.Add(key))
                    cycles.Add(cycle);
            }
            else if (!visited.Contains(next))
            {
                Dfs(next, graph, idToName, visited, stack, onStack, cycles, seenCycles);
            }
        }

        stack.RemoveAt(stack.Count - 1);
        onStack.Remove(current);
        visited.Add(current);
    }
}
