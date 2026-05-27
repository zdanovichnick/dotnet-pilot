using System.ComponentModel;
using System.Text;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.FileLevel;

[McpServerToolType]
public sealed class GetClassOutlineTool
{
    [McpServerTool(Name = "get_class_outline"), Description("Returns member signatures (no bodies) for classes in a file. Provide a relative file path and optionally a class name to filter.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Relative file path from solution root (e.g. src/MyApp.Api/Services/UserService.cs)")] string filePath,
        [Description("Class name to filter. Pass empty string to return all classes in the file.")] string className,
        CancellationToken ct)
    {
        string? classFilter = string.IsNullOrWhiteSpace(className) ? null : className;
        var solution = await workspace.GetSolutionAsync(ct);
        var document = FindDocument(solution, filePath);

        if (document is null)
            return $"File not found: {filePath}";

        var root = await document.GetSyntaxRootAsync(ct);
        var model = await document.GetSemanticModelAsync(ct);
        if (root is null || model is null) return "Could not load syntax/semantic model.";

        var results = new List<object>();

        foreach (var classDecl in root.DescendantNodes().OfType<TypeDeclarationSyntax>())
        {
            if (model.GetDeclaredSymbol(classDecl) is not INamedTypeSymbol symbol) continue;
            if (classFilter is not null && symbol.Name != classFilter) continue;

            var members = new List<object>();
            foreach (var member in symbol.GetMembers())
            {
                if (member.IsImplicitlyDeclared) continue;

                var entry = new Dictionary<string, object?>
                {
                    ["kind"] = member.Kind.ToString(),
                    ["name"] = member.Name,
                    ["signature"] = member.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                    ["accessibility"] = member.DeclaredAccessibility.ToString(),
                    ["isStatic"] = member.IsStatic,
                    ["line"] = member.Locations.FirstOrDefault()?.GetLineSpan().StartLinePosition.Line + 1
                };

                members.Add(entry);
            }

            results.Add(new Dictionary<string, object?>
            {
                ["name"] = symbol.Name,
                ["kind"] = classDecl.Kind().ToString(),
                ["baseType"] = symbol.BaseType?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                ["interfaces"] = symbol.Interfaces.Select(i => i.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)).ToList(),
                ["members"] = members,
                ["line"] = classDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1
            });
        }

        if (results.Count == 0)
            return classFilter is not null ? $"Class '{classFilter}' not found in {filePath}" : $"No classes found in {filePath}";

        return JsonSerializer.Serialize(results, new JsonSerializerOptions { WriteIndented = true });
    }

    internal static Document? FindDocument(Solution solution, string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/');
        foreach (var project in solution.Projects)
        {
            foreach (var doc in project.Documents)
            {
                if (doc.FilePath is null) continue;
                var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
                var rel = Path.GetRelativePath(solutionDir, doc.FilePath).Replace('\\', '/');
                if (rel.Equals(normalized, StringComparison.OrdinalIgnoreCase))
                    return doc;
            }
        }
        return null;
    }
}
