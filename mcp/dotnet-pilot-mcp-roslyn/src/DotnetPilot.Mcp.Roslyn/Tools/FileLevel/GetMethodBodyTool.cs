using System.ComponentModel;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.FileLevel;

[McpServerToolType]
public sealed class GetMethodBodyTool
{
    [McpServerTool(Name = "get_method_body"), Description("Returns the full source of a specific method. More token-efficient than reading an entire file when you need one method.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Relative file path from solution root")] string filePath,
        [Description("Method name to retrieve")] string methodName,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var document = GetClassOutlineTool.FindDocument(solution, filePath);

        if (document is null)
            return $"File not found: {filePath}";

        var root = await document.GetSyntaxRootAsync(ct);
        var model = await document.GetSemanticModelAsync(ct);
        if (root is null || model is null) return "Could not load syntax/semantic model.";

        // Search methods, constructors, and properties
        foreach (var method in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
        {
            if (method.Identifier.Text == methodName)
            {
                var lineSpan = method.GetLocation().GetLineSpan();
                return FormatResult(method.ToFullString().Trim(), filePath, lineSpan.StartLinePosition.Line + 1);
            }
        }

        foreach (var ctor in root.DescendantNodes().OfType<ConstructorDeclarationSyntax>())
        {
            if (ctor.Identifier.Text == methodName)
            {
                var lineSpan = ctor.GetLocation().GetLineSpan();
                return FormatResult(ctor.ToFullString().Trim(), filePath, lineSpan.StartLinePosition.Line + 1);
            }
        }

        foreach (var prop in root.DescendantNodes().OfType<PropertyDeclarationSyntax>())
        {
            if (prop.Identifier.Text == methodName)
            {
                var lineSpan = prop.GetLocation().GetLineSpan();
                return FormatResult(prop.ToFullString().Trim(), filePath, lineSpan.StartLinePosition.Line + 1);
            }
        }

        return $"Method '{methodName}' not found in {filePath}";
    }

    private static string FormatResult(string source, string filePath, int line)
    {
        return $"// {filePath}:{line}\n{source}";
    }
}
