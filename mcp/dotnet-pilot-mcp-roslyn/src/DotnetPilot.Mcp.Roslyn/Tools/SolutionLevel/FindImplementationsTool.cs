using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class FindImplementationsTool
{
    [McpServerTool(Name = "find_implementations"), Description("Finds all implementations of an interface or overrides of a virtual/abstract method across the solution. Returns the implementing type, file, and line.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Relative file path from solution root where the interface or base type is defined")] string filePath,
        [Description("Name of the interface, abstract class, or virtual method")] string symbolName,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var document = FileLevel.GetClassOutlineTool.FindDocument(solution, filePath);

        if (document is null)
            return $"File not found: {filePath}";

        var root = await document.GetSyntaxRootAsync(ct);
        var model = await document.GetSemanticModelAsync(ct);
        if (root is null || model is null) return "Could not load syntax/semantic model.";

        var symbol = FindNamedSymbol(root, model, symbolName);
        if (symbol is null)
            return $"Symbol '{symbolName}' not found in {filePath}";

        var results = new List<object>();

        try
        {
            if (symbol is INamedTypeSymbol typeSymbol)
            {
                var implementations = await SymbolFinder.FindImplementationsAsync(typeSymbol, solution, cancellationToken: ct);
                foreach (var impl in implementations)
                    AddResult(results, impl, solution);

                var derivedClasses = await SymbolFinder.FindDerivedClassesAsync(typeSymbol, solution, cancellationToken: ct);
                foreach (var derived in derivedClasses)
                    AddResult(results, derived, solution);
            }
            else if (symbol is IMethodSymbol methodSymbol)
            {
                var overrides = await SymbolFinder.FindOverridesAsync(methodSymbol, solution, cancellationToken: ct);
                foreach (var ov in overrides)
                    AddResult(results, ov, solution);

                if (methodSymbol.ContainingType.TypeKind == TypeKind.Interface)
                {
                    var implMethods = await SymbolFinder.FindImplementationsAsync(methodSymbol, solution, cancellationToken: ct);
                    foreach (var impl in implMethods)
                        AddResult(results, impl, solution);
                }
            }
        }
        catch (InvalidOperationException)
        {
            // Workaround for UnresolvedAnalyzerReference in projects with missing analyzers
        }

        if (results.Count == 0)
            return $"No implementations found for '{symbolName}'";

        return JsonSerializer.Serialize(new
        {
            symbol = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            kind = symbol.Kind.ToString(),
            implementationCount = results.Count,
            implementations = results
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    private static void AddResult(List<object> results, ISymbol symbol, Solution solution)
    {
        var location = symbol.Locations.FirstOrDefault();
        if (location is null || !location.IsInSource) return;

        var lineSpan = location.GetLineSpan();
        var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
        var relPath = Path.GetRelativePath(solutionDir, lineSpan.Path).Replace('\\', '/');

        results.Add(new Dictionary<string, object>
        {
            ["name"] = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            ["kind"] = symbol.Kind.ToString(),
            ["containingType"] = symbol.ContainingType?.Name ?? "",
            ["file"] = relPath,
            ["line"] = lineSpan.StartLinePosition.Line + 1
        });
    }

    private static ISymbol? FindNamedSymbol(SyntaxNode root, SemanticModel model, string name)
    {
        foreach (var node in root.DescendantNodes())
        {
            ISymbol? symbol = node switch
            {
                InterfaceDeclarationSyntax i when i.Identifier.Text == name => model.GetDeclaredSymbol(i),
                ClassDeclarationSyntax c when c.Identifier.Text == name => model.GetDeclaredSymbol(c),
                MethodDeclarationSyntax m when m.Identifier.Text == name => model.GetDeclaredSymbol(m),
                PropertyDeclarationSyntax p when p.Identifier.Text == name => model.GetDeclaredSymbol(p),
                _ => null
            };
            if (symbol is not null) return symbol;
        }
        return null;
    }
}
