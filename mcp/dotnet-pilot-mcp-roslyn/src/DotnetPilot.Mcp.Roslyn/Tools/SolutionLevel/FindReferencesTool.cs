using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class FindReferencesTool
{
    [McpServerTool(Name = "find_references"), Description("Finds all references to a symbol (class, method, property, interface) across the solution. Returns file, line, and surrounding code for each reference.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Relative file path from solution root where the symbol is defined")] string filePath,
        [Description("Name of the symbol to find references for")] string symbolName,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var document = FileLevel.GetClassOutlineTool.FindDocument(solution, filePath);

        if (document is null)
            return $"File not found: {filePath}";

        var root = await document.GetSyntaxRootAsync(ct);
        var model = await document.GetSemanticModelAsync(ct);
        if (root is null || model is null) return "Could not load syntax/semantic model.";

        var symbol = FindSymbol(root, model, symbolName);
        if (symbol is null)
            return $"Symbol '{symbolName}' not found in {filePath}";

        IEnumerable<ReferencedSymbol> refs;
        try
        {
            refs = await SymbolFinder.FindReferencesAsync(symbol, solution, ct);
        }
        catch (InvalidOperationException)
        {
            // Workaround for UnresolvedAnalyzerReference in projects with missing analyzers
            refs = [];
        }

        var results = new List<object>();

        foreach (var refGroup in refs)
        {
            foreach (var location in refGroup.Locations)
            {
                var lineSpan = location.Location.GetLineSpan();
                var sourceTree = location.Location.SourceTree;
                if (sourceTree is null) continue;

                var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
                var relPath = Path.GetRelativePath(solutionDir, sourceTree.FilePath).Replace('\\', '/');
                var line = lineSpan.StartLinePosition.Line + 1;

                var sourceText = await sourceTree.GetTextAsync(ct);
                var lineText = sourceText.Lines[lineSpan.StartLinePosition.Line].ToString().Trim();

                results.Add(new Dictionary<string, object>
                {
                    ["file"] = relPath,
                    ["line"] = line,
                    ["column"] = lineSpan.StartLinePosition.Character + 1,
                    ["code"] = lineText
                });
            }
        }

        if (results.Count == 0)
            return $"No references found for '{symbolName}'";

        return JsonSerializer.Serialize(new
        {
            symbol = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            kind = symbol.Kind.ToString(),
            referenceCount = results.Count,
            references = results
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    private static ISymbol? FindSymbol(SyntaxNode root, SemanticModel model, string name)
    {
        foreach (var node in root.DescendantNodes())
        {
            ISymbol? symbol = node switch
            {
                TypeDeclarationSyntax t when t.Identifier.Text == name => model.GetDeclaredSymbol(t),
                MethodDeclarationSyntax m when m.Identifier.Text == name => model.GetDeclaredSymbol(m),
                PropertyDeclarationSyntax p when p.Identifier.Text == name => model.GetDeclaredSymbol(p),
                EnumDeclarationSyntax e when e.Identifier.Text == name => model.GetDeclaredSymbol(e),
                InterfaceDeclarationSyntax i when i.Identifier.Text == name => model.GetDeclaredSymbol(i),
                ConstructorDeclarationSyntax c when c.Identifier.Text == name => model.GetDeclaredSymbol(c),
                EventDeclarationSyntax ev when ev.Identifier.Text == name => model.GetDeclaredSymbol(ev),
                DelegateDeclarationSyntax d when d.Identifier.Text == name => model.GetDeclaredSymbol(d),
                _ => null
            };
            if (symbol is not null) return symbol;
        }
        return null;
    }
}
