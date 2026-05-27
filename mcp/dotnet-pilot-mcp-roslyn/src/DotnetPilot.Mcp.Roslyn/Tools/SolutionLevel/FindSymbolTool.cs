using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class FindSymbolTool
{
    [McpServerTool(Name = "find_symbol"), Description("Locates a type, method, property, field, or event by name across the entire solution. Returns each definition's file, line, kind, and containing type. Useful when you don't know which file a symbol lives in.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Name of the symbol to find (case-sensitive). Pass the bare identifier, e.g. 'UserService' not 'MyApp.UserService'.")] string symbolName,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(symbolName))
            return "symbolName is required.";

        var solution = await workspace.GetSolutionAsync(ct);
        var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var results = new List<object>();

        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync(ct);
            if (compilation is null) continue;

            IEnumerable<ISymbol> symbols;
            try
            {
                symbols = compilation.GetSymbolsWithName(symbolName, SymbolFilter.All, ct);
            }
            catch (OperationCanceledException) { throw; }
            catch
            {
                continue;
            }

            foreach (var symbol in symbols)
            {
                foreach (var location in symbol.Locations)
                {
                    if (!location.IsInSource) continue;
                    var lineSpan = location.GetLineSpan();
                    var relPath = Path.GetRelativePath(solutionDir, lineSpan.Path).Replace('\\', '/');
                    var line = lineSpan.StartLinePosition.Line + 1;

                    var dedupeKey = $"{relPath}:{line}:{symbol.Name}";
                    if (!seen.Add(dedupeKey)) continue;

                    results.Add(new Dictionary<string, object?>
                    {
                        ["name"] = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                        ["kind"] = symbol.Kind.ToString(),
                        ["containingType"] = symbol.ContainingType?.Name ?? "",
                        ["containingNamespace"] = symbol.ContainingNamespace?.ToDisplayString() ?? "",
                        ["accessibility"] = symbol.DeclaredAccessibility.ToString(),
                        ["project"] = project.Name,
                        ["file"] = relPath,
                        ["line"] = line
                    });
                }
            }
        }

        if (results.Count == 0)
            return $"No symbol named '{symbolName}' found in the solution.";

        return JsonSerializer.Serialize(new
        {
            symbolName,
            count = results.Count,
            definitions = results
        }, new JsonSerializerOptions { WriteIndented = true });
    }
}
