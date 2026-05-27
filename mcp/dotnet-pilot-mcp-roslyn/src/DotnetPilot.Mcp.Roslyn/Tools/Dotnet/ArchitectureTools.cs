using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

[McpServerToolType]
public sealed class ArchitectureTools
{
    [McpServerTool(Name = "check_architecture_violations"), Description("Analyzes project references against clean architecture rules. Detects violations like Domain referencing Infrastructure or Application referencing API. Returns layer classification and all violations.")]
    public static async Task<string> CheckViolations(
        WorkspaceCache workspace,
        [Description("Architecture style to enforce. Currently only 'clean' is supported. Defaults to 'clean'.")] string style,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var report = ArchitectureAnalyzer.Analyze(solution, string.IsNullOrWhiteSpace(style) ? "clean" : style);
        return JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
    }
}
