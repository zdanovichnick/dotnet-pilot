using Microsoft.CodeAnalysis;
using DotnetPilot.Mcp.Roslyn.Models;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

public static class ArchitectureAnalyzer
{
    private static readonly Dictionary<string, string[]> CleanArchRules = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Domain"] = [],
        ["Application"] = ["Domain"],
        ["Infrastructure"] = ["Domain", "Application"],
        ["Persistence"] = ["Domain", "Application"],
        ["Api"] = ["Domain", "Application", "Infrastructure", "Persistence"],
        ["Web"] = ["Domain", "Application", "Infrastructure", "Persistence"],
        ["Host"] = ["Domain", "Application", "Infrastructure", "Persistence"],
        ["Tests"] = ["Domain", "Application", "Infrastructure", "Persistence", "Api", "Web", "Host"],
    };

    public static ArchitectureReport Analyze(Solution solution, string style = "clean")
    {
        var projects = solution.Projects.ToList();
        var layers = new List<LayerInfo>();
        var violations = new List<ArchitectureViolation>();

        foreach (var project in projects)
        {
            var layer = ClassifyLayer(project.Name);
            var refs = project.ProjectReferences
                .Select(r => solution.GetProject(r.ProjectId)?.Name)
                .Where(n => n is not null)
                .Cast<string>()
                .ToList();

            var allowedLayers = CleanArchRules.GetValueOrDefault(layer, []);
            var allowedDeps = new List<string>();
            foreach (var allowedLayer in allowedLayers)
            {
                allowedDeps.AddRange(projects
                    .Where(p => ClassifyLayer(p.Name).Equals(allowedLayer, StringComparison.OrdinalIgnoreCase))
                    .Select(p => p.Name));
            }
            // A project can always reference projects in the same layer
            allowedDeps.AddRange(projects
                .Where(p => ClassifyLayer(p.Name).Equals(layer, StringComparison.OrdinalIgnoreCase) && p.Name != project.Name)
                .Select(p => p.Name));

            layers.Add(new LayerInfo
            {
                Name = project.Name,
                Layer = layer,
                AllowedDependencies = allowedDeps,
                ActualDependencies = refs
            });

            foreach (var refName in refs)
            {
                var refLayer = ClassifyLayer(refName);
                if (!IsAllowed(layer, refLayer))
                {
                    violations.Add(new ArchitectureViolation
                    {
                        Severity = GetSeverity(layer, refLayer),
                        SourceProject = project.Name,
                        SourceLayer = layer,
                        TargetProject = refName,
                        TargetLayer = refLayer,
                        Rule = $"{layer} must not reference {refLayer}"
                    });
                }
            }
        }

        return new ArchitectureReport
        {
            Style = style,
            Layers = layers,
            Violations = violations
        };
    }

    public static string ClassifyLayer(string projectName)
    {
        var parts = projectName.Split('.');
        var suffix = parts.Length > 1 ? parts[^1] : projectName;

        var lowerSuffix = suffix.ToLowerInvariant();
        var lowerFull = projectName.ToLowerInvariant();

        return lowerSuffix switch
        {
            "domain" or "core" => "Domain",
            "application" or "usecases" => "Application",
            "infrastructure" => "Infrastructure",
            "persistence" or "data" or "dal" => "Persistence",
            "api" or "webapi" => "Api",
            "web" or "mvc" or "razor" or "blazor" => "Web",
            "host" or "apphost" or "servicedefaults" => "Host",
            "contracts" or "shared" or "common" or "buildingblocks" or "sharedkernel" => "Domain",
            "gateway" => "Infrastructure",
            _ when lowerSuffix.Contains("test") => "Tests",
            _ when lowerSuffix.Contains("migration") => "Persistence",
            _ when lowerFull.Contains(".api") => "Api",
            _ when lowerFull.Contains(".domain") => "Domain",
            _ when lowerFull.Contains(".infrastructure") => "Infrastructure",
            _ when lowerFull.Contains(".application") => "Application",
            _ => "Unknown"
        };
    }

    private static bool IsAllowed(string sourceLayer, string targetLayer)
    {
        if (sourceLayer == "Unknown" || targetLayer == "Unknown") return true;
        if (sourceLayer.Equals(targetLayer, StringComparison.OrdinalIgnoreCase)) return true;

        var allowed = CleanArchRules.GetValueOrDefault(sourceLayer, []);
        return allowed.Any(a => a.Equals(targetLayer, StringComparison.OrdinalIgnoreCase));
    }

    private static string GetSeverity(string sourceLayer, string targetLayer)
    {
        if (sourceLayer == "Domain" && targetLayer is "Infrastructure" or "Persistence" or "Api" or "Web")
            return "error";
        if (sourceLayer == "Application" && targetLayer is "Infrastructure" or "Persistence" or "Api" or "Web")
            return "error";
        return "warning";
    }
}
