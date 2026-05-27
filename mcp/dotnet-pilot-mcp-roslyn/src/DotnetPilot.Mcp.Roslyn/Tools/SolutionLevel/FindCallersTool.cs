using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class FindCallersTool
{
    [McpServerTool(Name = "find_callers"), Description("Finds all callers of a specific method using semantic call-graph analysis (not text search). Returns each call site's file, line, surrounding code, and the containing method. Useful for impact analysis and hot-path identification.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Relative file path from solution root where the method is defined")] string filePath,
        [Description("Name of the method to find callers for (case-sensitive). If overloaded, all overloads are searched.")] string methodName,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(filePath)) return "filePath is required.";
        if (string.IsNullOrWhiteSpace(methodName)) return "methodName is required.";

        var solution = await workspace.GetSolutionAsync(ct);
        var document = FileLevel.GetClassOutlineTool.FindDocument(solution, filePath);
        if (document is null)
            return $"File not found: {filePath}";

        var root = await document.GetSyntaxRootAsync(ct);
        var model = await document.GetSemanticModelAsync(ct);
        if (root is null || model is null) return "Could not load syntax/semantic model.";

        var methodSymbols = root.DescendantNodes()
            .OfType<MethodDeclarationSyntax>()
            .Where(m => m.Identifier.Text == methodName)
            .Select(m => model.GetDeclaredSymbol(m))
            .OfType<IMethodSymbol>()
            .ToList();

        if (methodSymbols.Count == 0)
            return $"Method '{methodName}' not found in {filePath}";

        var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var results = new List<object>();

        foreach (var methodSymbol in methodSymbols)
        {
            IEnumerable<SymbolCallerInfo> callers;
            try
            {
                callers = await SymbolFinder.FindCallersAsync(methodSymbol, solution, ct);
            }
            catch (InvalidOperationException)
            {
                continue;
            }

            foreach (var caller in callers)
            {
                foreach (var location in caller.Locations)
                {
                    if (!location.IsInSource) continue;
                    var lineSpan = location.GetLineSpan();
                    var sourceTree = location.SourceTree;
                    if (sourceTree is null) continue;

                    var relPath = Path.GetRelativePath(solutionDir, sourceTree.FilePath).Replace('\\', '/');
                    var line = lineSpan.StartLinePosition.Line + 1;

                    var dedupeKey = $"{relPath}:{line}";
                    if (!seen.Add(dedupeKey)) continue;

                    var sourceText = await sourceTree.GetTextAsync(ct);
                    var lineText = sourceText.Lines[lineSpan.StartLinePosition.Line].ToString().Trim();

                    results.Add(new Dictionary<string, object?>
                    {
                        ["file"] = relPath,
                        ["line"] = line,
                        ["callerMethod"] = caller.CallingSymbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                        ["callerKind"] = caller.CallingSymbol.Kind.ToString(),
                        ["code"] = lineText
                    });
                }
            }
        }

        return JsonSerializer.Serialize(new
        {
            method = methodName,
            overloadCount = methodSymbols.Count,
            callerCount = results.Count,
            callers = results
        }, new JsonSerializerOptions { WriteIndented = true });
    }
}
