using System.ComponentModel;
using System.Text.Json;
using System.Text.RegularExpressions;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.FindSymbols;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class FindDeadCodeTool
{
    private const int MaxResults = 100;

    private static readonly Regex InterfaceNameRegex = new("^I[A-Z]", RegexOptions.Compiled);

    private static readonly HashSet<string> EntryPointNames = new(StringComparer.Ordinal)
    {
        "Program", "Startup", "Main", "GlobalUsings"
    };

    [McpServerTool(Name = "find_dead_code"), Description("Identifies unreferenced types and members across the solution using semantic analysis. Returns confidence-scored results (high for private, medium for internal, low for public). Skips tests, fixtures, migrations, interfaces, entry points, and framework conventions to reduce false positives. Capped at 100 items.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Optional project name filter (e.g. 'MyApp.Application'). Pass empty string to scan all non-test projects.")] string scope,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
        var scopeFilter = string.IsNullOrWhiteSpace(scope) ? null : scope;
        var items = new List<object>();
        var inspected = 0;

        foreach (var project in solution.Projects)
        {
            if (items.Count >= MaxResults) break;
            if (scopeFilter is not null && !project.Name.Equals(scopeFilter, StringComparison.OrdinalIgnoreCase)) continue;
            if (project.Name.Contains("Test", StringComparison.OrdinalIgnoreCase)) continue;

            var compilation = await project.GetCompilationAsync(ct);
            if (compilation is null) continue;

            foreach (var typeSymbol in EnumerateNamedTypes(compilation.GlobalNamespace))
            {
                if (items.Count >= MaxResults) break;
                if (ShouldSkipType(typeSymbol)) continue;

                inspected++;
                if (await IsUnreferencedAsync(typeSymbol, solution, ct))
                {
                    AddItem(items, typeSymbol, solutionDir, project.Name);
                    continue;
                }

                foreach (var member in typeSymbol.GetMembers())
                {
                    if (items.Count >= MaxResults) break;
                    if (ShouldSkipMember(member)) continue;

                    inspected++;
                    if (await IsUnreferencedAsync(member, solution, ct))
                    {
                        AddItem(items, member, solutionDir, project.Name);
                    }
                }
            }
        }

        return JsonSerializer.Serialize(new
        {
            inspectedSymbols = inspected,
            deadCount = items.Count,
            truncated = items.Count >= MaxResults,
            items
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    private static IEnumerable<INamedTypeSymbol> EnumerateNamedTypes(INamespaceSymbol ns)
    {
        foreach (var type in ns.GetTypeMembers())
        {
            yield return type;
            foreach (var nested in type.GetTypeMembers())
                yield return nested;
        }
        foreach (var child in ns.GetNamespaceMembers())
        {
            foreach (var type in EnumerateNamedTypes(child))
                yield return type;
        }
    }

    private static bool ShouldSkipType(INamedTypeSymbol type)
    {
        if (type.IsImplicitlyDeclared) return true;
        if (type.Locations.All(l => !l.IsInSource)) return true;
        if (EntryPointNames.Contains(type.Name)) return true;
        if (type.Name.Contains("Test", StringComparison.Ordinal)) return true;
        if (type.Name.Contains("Fixture", StringComparison.Ordinal)) return true;
        if (type.Name.EndsWith("Extensions", StringComparison.Ordinal)) return true;
        if (type.Name.EndsWith("Attribute", StringComparison.Ordinal)) return true;
        if (type.TypeKind == TypeKind.Interface) return true;
        if (type.TypeKind == TypeKind.Delegate) return true;
        if (InterfaceNameRegex.IsMatch(type.Name) && type.TypeKind == TypeKind.Interface) return true;

        // Skip EF Core migrations / generated code
        if (type.Locations.Any(l => l.IsInSource &&
            (l.GetLineSpan().Path.Contains("/Migrations/", StringComparison.OrdinalIgnoreCase) ||
             l.GetLineSpan().Path.Contains("\\Migrations\\", StringComparison.OrdinalIgnoreCase) ||
             l.GetLineSpan().Path.EndsWith(".g.cs", StringComparison.OrdinalIgnoreCase) ||
             l.GetLineSpan().Path.EndsWith(".designer.cs", StringComparison.OrdinalIgnoreCase))))
            return true;

        return false;
    }

    private static bool ShouldSkipMember(ISymbol member)
    {
        if (member.IsImplicitlyDeclared) return true;
        if (member.Kind == SymbolKind.NamedType) return true;
        if (member.Locations.All(l => !l.IsInSource)) return true;

        // Constructors: skip — references appear on the type, not on the ctor
        if (member is IMethodSymbol m && m.MethodKind is MethodKind.Constructor or MethodKind.StaticConstructor or MethodKind.Destructor)
            return true;

        // Property/event accessors are tracked through the parent
        if (member is IMethodSymbol m2 && m2.MethodKind is MethodKind.PropertyGet or MethodKind.PropertySet or MethodKind.EventAdd or MethodKind.EventRemove)
            return true;

        // Override / interface impl is "used" by polymorphism — Roslyn rarely flags them correctly
        if (member is IMethodSymbol m3 && (m3.IsOverride || m3.ExplicitInterfaceImplementations.Length > 0))
            return true;

        // Skip public members in libraries — likely external callers
        if (member.DeclaredAccessibility == Accessibility.Public &&
            member.ContainingType?.DeclaredAccessibility == Accessibility.Public)
            return true;

        if (member.Name.StartsWith("op_", StringComparison.Ordinal)) return true;

        return false;
    }

    private static async Task<bool> IsUnreferencedAsync(ISymbol symbol, Solution solution, CancellationToken ct)
    {
        try
        {
            var refs = await SymbolFinder.FindReferencesAsync(symbol, solution, ct);
            return !refs.SelectMany(r => r.Locations).Any();
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private static void AddItem(List<object> items, ISymbol symbol, string solutionDir, string projectName)
    {
        var location = symbol.Locations.FirstOrDefault(l => l.IsInSource);
        if (location is null) return;

        var lineSpan = location.GetLineSpan();
        var relPath = Path.GetRelativePath(solutionDir, lineSpan.Path).Replace('\\', '/');

        items.Add(new Dictionary<string, object?>
        {
            ["name"] = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            ["kind"] = symbol.Kind.ToString(),
            ["accessibility"] = symbol.DeclaredAccessibility.ToString(),
            ["confidence"] = ConfidenceFor(symbol.DeclaredAccessibility),
            ["project"] = projectName,
            ["file"] = relPath,
            ["line"] = lineSpan.StartLinePosition.Line + 1
        });
    }

    private static string ConfidenceFor(Accessibility accessibility) => accessibility switch
    {
        Accessibility.Private => "high",
        Accessibility.Internal or Accessibility.ProtectedAndInternal => "medium",
        _ => "low"
    };
}
