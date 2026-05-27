using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Models;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.Workspace;

[McpServerToolType]
public sealed class GetSolutionStructureTool
{
    [McpServerTool(Name = "get_solution_structure"), Description("Returns the full solution structure: projects, references, document counts, and detected frameworks.")]
    public static async Task<string> Execute(WorkspaceCache workspace, CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);

        var projects = new List<Models.ProjectInfo>();
        foreach (var project in solution.Projects.OrderBy(p => p.Name))
        {
            var refs = project.ProjectReferences
                .Select(r => solution.GetProject(r.ProjectId)?.Name)
                .Where(n => n is not null)
                .Cast<string>()
                .ToList();

            var compilation = await project.GetCompilationAsync(ct);
            var outputKind = compilation?.Options.OutputKind switch
            {
                Microsoft.CodeAnalysis.OutputKind.ConsoleApplication => "exe",
                Microsoft.CodeAnalysis.OutputKind.DynamicallyLinkedLibrary => "library",
                Microsoft.CodeAnalysis.OutputKind.WindowsApplication => "winexe",
                _ => compilation?.Options.OutputKind.ToString()
            };

            projects.Add(new Models.ProjectInfo
            {
                Name = project.Name,
                Path = GetRelativePath(solution, project),
                OutputKind = outputKind,
                TargetFramework = DetectTargetFramework(project),
                DocumentCount = project.DocumentIds.Count,
                ProjectReferences = refs
            });
        }

        var result = new SolutionStructure
        {
            SolutionPath = solution.FilePath ?? "unknown",
            Projects = projects
        };

        return JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
    }

    private static string GetRelativePath(Solution solution, Project project)
    {
        if (solution.FilePath is null || project.FilePath is null)
            return project.FilePath ?? project.Name;

        var solutionDir = Path.GetDirectoryName(solution.FilePath)!;
        return Path.GetRelativePath(solutionDir, project.FilePath).Replace('\\', '/');
    }

    private static string? DetectTargetFramework(Project project)
    {
        var parseOptions = project.ParseOptions;
        if (parseOptions is Microsoft.CodeAnalysis.CSharp.CSharpParseOptions csOptions)
        {
            return csOptions.LanguageVersion switch
            {
                >= Microsoft.CodeAnalysis.CSharp.LanguageVersion.CSharp13 => "net10.0+",
                >= Microsoft.CodeAnalysis.CSharp.LanguageVersion.CSharp12 => "net8.0+",
                >= Microsoft.CodeAnalysis.CSharp.LanguageVersion.CSharp11 => "net7.0+",
                >= Microsoft.CodeAnalysis.CSharp.LanguageVersion.CSharp10 => "net6.0+",
                _ => null
            };
        }
        return null;
    }
}
