using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using DotnetPilot.Mcp.Roslyn.Models;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

internal sealed class ScanAnalysis
{
    public required DiScan Scan { get; init; }
    public required List<DiRegistration> Registrations { get; init; }

    /// <summary>Generic-stripped service names a partially modelled selection could register.</summary>
    public required HashSet<string> PlausibleServices { get; init; }

    /// <summary>The assembly source is unknown, so any type could be registered.</summary>
    public bool MayRegisterAnything { get; init; }

    public DiScanRef ToRef() => new() { File = Scan.File, Line = Scan.Line };
}

/// <summary>
/// Statically evaluates a Scrutor <c>services.Scan(s => ...)</c> selector. Scrutor is not
/// referenced by this project, so its fluent methods are recognised by name and, when the
/// consumer's compilation binds them, by their Scrutor selector containing type.
/// Anything not modelled is recorded as a reason and degrades the scan to
/// <c>partial</c> (candidate superset known) or <c>unresolved</c> (source unknown).
/// </summary>
internal static class ScrutorScanResolver
{
    private static readonly HashSet<string> SelectorTypes = new(StringComparer.Ordinal)
    {
        "IFluentInterface", "IAssemblySelector", "ITypeSourceSelector", "IImplementationTypeSelector",
        "IServiceTypeSelector", "ILifetimeSelector", "IImplementationTypeFilter",
    };

    private static readonly SymbolDisplayFormat DisplayFormat = SymbolDisplayFormat.MinimallyQualifiedFormat;

    public static bool IsScrutorScan(InvocationExpressionSyntax invocation, SemanticModel model)
    {
        if (model.GetSymbolInfo(invocation).Symbol is IMethodSymbol method)
        {
            var definition = method.ReducedFrom ?? method;
            if (definition.ContainingNamespace?.ToDisplayString() == "Scrutor" ||
                definition.ContainingAssembly?.Name == "Scrutor")
                return true;

            // Real Scrutor declares Scan in Microsoft.Extensions.DependencyInjection.
            return definition.Parameters.Length == 2 &&
                   definition.Parameters[0].Type.Name == "IServiceCollection" &&
                   definition.Parameters[1].Type is INamedTypeSymbol { Name: "Action", TypeArguments: [{ Name: "ITypeSourceSelector" }] };
        }

        // Scrutor is not resolvable (missing reference): fall back to its fluent shape.
        return invocation.ToString().Contains("AddClasses", StringComparison.Ordinal);
    }

    public static ScanAnalysis Analyze(InvocationExpressionSyntax scan, SemanticModel model, string file)
    {
        var line = scan.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
        var walker = new Walker(model);
        walker.Walk(scan);
        return walker.Build(file, line);
    }

    private enum MappingKind { Self, ImplementedInterfaces, SelfWithInterfaces, MatchingInterface, Explicit }

    private sealed class Mapping
    {
        public required MappingKind Kind { get; init; }
        public List<INamedTypeSymbol> Types { get; init; } = [];
        public string? Lifetime { get; set; }
    }

    private sealed class Selection
    {
        public List<IAssemblySymbol>? Assemblies { get; init; }
        public List<INamedTypeSymbol>? ExplicitTypes { get; init; }
        public bool PublicOnly { get; set; } = true;
        public List<Func<INamedTypeSymbol, bool>> Filters { get; } = [];
        public bool Exact { get; set; } = true;
        public List<Mapping> Mappings { get; } = [];
        public string? ImplicitLifetime { get; set; }
    }

    private sealed class Walker(SemanticModel model)
    {
        private readonly List<Selection> _selections = [];
        private readonly List<string> _reasons = [];
        private bool _unresolved;

        public void Walk(InvocationExpressionSyntax scan)
        {
            var argument = scan.ArgumentList.Arguments.FirstOrDefault()?.Expression;
            if (!TryGetLambda(argument, out var parameter, out var body))
            {
                Unresolved("the selector passed to Scan is not an inline lambda");
                return;
            }

            if (!TryGetStatements(body, out var statements))
            {
                Unresolved("the selector lambda contains statements other than fluent calls");
                return;
            }

            foreach (var statement in statements)
            {
                var calls = Flatten(statement, parameter);
                if (calls is null)
                {
                    Unresolved($"'{statement}' does not start at the selector parameter '{parameter}'");
                    continue;
                }

                WalkChain(calls);
            }
        }

        public ScanAnalysis Build(string file, int line)
        {
            var registrations = new List<DiRegistration>();
            var plausible = new HashSet<string>(StringComparer.Ordinal);
            var mayRegisterAnything = _unresolved;
            var seen = new HashSet<(string?, string)>();

            foreach (var selection in _selections)
            {
                if (selection.Assemblies is null && selection.ExplicitTypes is null)
                {
                    mayRegisterAnything = true;
                    continue;
                }

                var candidates = (selection.ExplicitTypes ?? Candidates(selection))
                    .Where(t => selection.Filters.All(f => f(t)))
                    .ToList();

                var mappings = selection.Mappings.Count > 0
                    ? selection.Mappings
                    : [new Mapping { Kind = MappingKind.Self, Lifetime = selection.ImplicitLifetime }];

                foreach (var candidate in candidates)
                {
                    var implementation = candidate.ToDisplayString(DisplayFormat);

                    if (!selection.Exact)
                    {
                        foreach (var service in SelfBasesAndInterfaces(candidate))
                            plausible.Add(StripGeneric(service.ToDisplayString(DisplayFormat)));
                        continue;
                    }

                    foreach (var mapping in mappings)
                    {
                        foreach (var service in Services(candidate, mapping))
                        {
                            var isSelf = SymbolEqualityComparer.Default.Equals(service, candidate);
                            var serviceName = isSelf ? null : service.ToDisplayString(DisplayFormat);
                            if (!seen.Add((serviceName, implementation))) continue;

                            registrations.Add(new DiRegistration
                            {
                                Interface = serviceName,
                                Implementation = implementation,
                                Lifetime = mapping.Lifetime ?? "Transient",
                                RegistrationMethod = "Scan",
                                File = file,
                                Line = line
                            });
                        }
                    }
                }
            }

            var status = mayRegisterAnything && registrations.Count == 0 && plausible.Count == 0
                ? "unresolved"
                : _reasons.Count > 0 ? "partial" : "resolved";

            return new ScanAnalysis
            {
                Scan = new DiScan
                {
                    File = file,
                    Line = line,
                    Status = status,
                    Reasons = _reasons.Distinct(StringComparer.Ordinal).ToList(),
                    RegisteredCount = registrations.Count
                },
                Registrations = registrations,
                PlausibleServices = plausible,
                MayRegisterAnything = mayRegisterAnything
            };
        }

        private void WalkChain(List<(string Name, InvocationExpressionSyntax Invocation)> calls)
        {
            List<IAssemblySymbol>? assemblies = null;
            var hasSource = false;
            Selection? current = null;

            foreach (var (name, invocation) in calls)
            {
                if (!IsSelectorMethod(invocation))
                {
                    Unknown(name, ref current, ref assemblies, ref hasSource);
                    continue;
                }

                switch (name)
                {
                    case "FromCallingAssembly" or "FromExecutingAssembly":
                        assemblies = [model.Compilation.Assembly];
                        hasSource = true;
                        current = null;
                        break;

                    case "FromAssemblyOf":
                        assemblies = TypeArguments(invocation) is [var marker] ? [marker.ContainingAssembly] : null;
                        if (assemblies is null) Reason($"{name}<T>() type argument could not be resolved");
                        hasSource = true;
                        current = null;
                        break;

                    case "FromAssembliesOf":
                        assemblies = TypeOfArguments(invocation)?.Select(t => t.ContainingAssembly).ToList();
                        if (assemblies is null) Reason($"{name}(...) arguments are not all typeof(...) expressions");
                        hasSource = true;
                        current = null;
                        break;

                    case "FromAssemblies":
                        assemblies = AssemblyArguments(invocation);
                        if (assemblies is null)
                            Reason($"{name}(...) arguments are not all typeof(X).Assembly or Assembly.GetExecutingAssembly()");
                        hasSource = true;
                        current = null;
                        break;

                    case "FromEntryAssembly" or "FromApplicationDependencies" or "FromAssemblyDependencies"
                        or "FromDependencyContext":
                        Reason($"{name}(...) selects assemblies at runtime");
                        assemblies = null;
                        hasSource = true;
                        current = null;
                        break;

                    case "AddClasses":
                        if (!hasSource) Reason("AddClasses(...) is not preceded by an assembly source");
                        current = new Selection { Assemblies = hasSource ? assemblies : null };
                        ParseAddClasses(invocation, current);
                        _selections.Add(current);
                        break;

                    case "FromType" or "FromTypes":
                        var types = TypeArguments(invocation) is { Count: > 0 } generic ? generic : TypeOfArguments(invocation);
                        if (types is null) Reason($"{name}(...) arguments are not all typeof(...) expressions");
                        current = new Selection { ExplicitTypes = types };
                        _selections.Add(current);
                        break;

                    case "AsSelf" or "AsImplementedInterfaces" or "AsSelfWithInterfaces" or "AsMatchingInterface" or "As":
                        if (current is null)
                        {
                            Reason($"{name}(...) is not preceded by AddClasses(...)");
                            break;
                        }
                        ParseMapping(name, invocation, current);
                        break;

                    case "WithSingletonLifetime" or "WithScopedLifetime" or "WithTransientLifetime" or "WithLifetime":
                        if (current is null) break;
                        ApplyLifetime(current, LifetimeOf(name, invocation));
                        break;

                    case "UsingRegistrationStrategy":
                        Reason("UsingRegistrationStrategy(...) may skip or replace registrations, so the recorded lifetimes may not be the ones that win");
                        break;

                    case "UsingAttributes":
                        if (current is not null) current.Exact = false;
                        Reason("UsingAttributes() reads [ServiceDescriptor] attributes, which are not evaluated");
                        break;

                    default:
                        Unknown(name, ref current, ref assemblies, ref hasSource);
                        break;
                }
            }
        }

        private void Unknown(string name, ref Selection? current, ref List<IAssemblySymbol>? assemblies, ref bool hasSource)
        {
            Reason($"{name}(...) is not a recognised Scrutor method");
            if (current is not null)
            {
                current.Exact = false;
                return;
            }

            assemblies = null;
            hasSource = true;
        }

        private void ParseAddClasses(InvocationExpressionSyntax invocation, Selection selection)
        {
            foreach (var argument in invocation.ArgumentList.Arguments)
            {
                if (TryGetLambda(argument.Expression, out var parameter, out var body))
                {
                    ParseFilters(parameter, body, selection);
                    continue;
                }

                if (model.GetConstantValue(argument.Expression) is { HasValue: true, Value: bool publicOnly })
                {
                    selection.PublicOnly = publicOnly;
                    continue;
                }

                selection.Exact = false;
                Reason($"AddClasses argument '{argument}' is not a literal or inline filter lambda");
            }
        }

        private void ParseFilters(string parameter, CSharpSyntaxNode body, Selection selection)
        {
            if (!TryGetStatements(body, out var statements))
            {
                selection.Exact = false;
                Reason("an AddClasses filter lambda contains statements other than filter calls");
                return;
            }

            foreach (var statement in statements)
            {
                var calls = Flatten(statement, parameter);
                if (calls is null)
                {
                    selection.Exact = false;
                    Reason($"AddClasses filter '{statement}' does not start at the filter parameter");
                    continue;
                }

                foreach (var (name, invocation) in calls)
                {
                    var filter = IsSelectorMethod(invocation) ? ParseFilter(name, invocation) : null;
                    if (filter is not null)
                    {
                        selection.Filters.Add(filter);
                        continue;
                    }

                    selection.Exact = false;
                    Reason(name == "Where"
                        ? "Where(...) predicate in AddClasses is not evaluated; the scan may register fewer types than reported as candidates"
                        : $"AddClasses filter {name}(...) is not evaluated");
                }
            }
        }

        private Func<INamedTypeSymbol, bool>? ParseFilter(string name, InvocationExpressionSyntax invocation)
        {
            var hasArguments = invocation.ArgumentList.Arguments.Count > 0;
            var generic = TypeArguments(invocation);
            var types = generic is { Count: > 0 }
                // A generic overload taking an argument (WithAttribute<T>(predicate)) is not modelled.
                ? hasArguments ? null : generic
                : hasArguments ? TypeOfArguments(invocation) : null;

            switch (name)
            {
                case "AssignableTo" or "AssignableToAny" when types is not null:
                    return t => types.Any(target => IsAssignableTo(t, target));

                case "WithAttribute" when types is [var attribute]:
                    return t => HasAttribute(t, attribute);

                case "WithoutAttribute" when types is [var attribute]:
                    return t => !HasAttribute(t, attribute);

                case "InNamespaceOf" or "InExactNamespaceOf" or "NotInNamespaceOf" when types is not null:
                    return NamespaceFilter(name.Replace("Of", "s", StringComparison.Ordinal),
                        types.Select(NamespaceOf).ToList());

                case "InNamespaces" or "InExactNamespaces" or "NotInNamespaces":
                    var namespaces = StringArguments(invocation);
                    return namespaces is null ? null : NamespaceFilter(name, namespaces);

                default:
                    return null;
            }
        }

        private static Func<INamedTypeSymbol, bool> NamespaceFilter(string kind, List<string> namespaces) => kind switch
        {
            "InExactNamespaces" => t => namespaces.Contains(NamespaceOf(t), StringComparer.Ordinal),
            "NotInNamespaces" => t => !namespaces.Any(ns => IsInNamespace(NamespaceOf(t), ns)),
            _ => t => namespaces.Any(ns => IsInNamespace(NamespaceOf(t), ns)),
        };

        private void ParseMapping(string name, InvocationExpressionSyntax invocation, Selection selection)
        {
            var hasArguments = invocation.ArgumentList.Arguments.Count > 0;
            Mapping? mapping = name switch
            {
                "AsSelf" => new Mapping { Kind = MappingKind.Self },
                "AsImplementedInterfaces" when !hasArguments => new Mapping { Kind = MappingKind.ImplementedInterfaces },
                "AsSelfWithInterfaces" when !hasArguments => new Mapping { Kind = MappingKind.SelfWithInterfaces },
                "AsMatchingInterface" when !hasArguments => new Mapping { Kind = MappingKind.MatchingInterface },
                "As" => (TypeArguments(invocation) is { Count: > 0 } generic ? generic : TypeOfArguments(invocation)) is { } types
                    ? new Mapping { Kind = MappingKind.Explicit, Types = types }
                    : null,
                _ => null,
            };

            if (mapping is null)
            {
                selection.Exact = false;
                Reason($"{name}(...) with a predicate or selector argument is not evaluated");
                return;
            }

            selection.Mappings.Add(mapping);
        }

        private void ApplyLifetime(Selection selection, string lifetime)
        {
            if (selection.Mappings.Count == 0)
            {
                selection.ImplicitLifetime = lifetime;
                return;
            }

            foreach (var mapping in selection.Mappings.Where(m => m.Lifetime is null))
                mapping.Lifetime = lifetime;
        }

        private string LifetimeOf(string name, InvocationExpressionSyntax invocation)
        {
            if (name != "WithLifetime")
                return name["With".Length..^"Lifetime".Length];

            var argument = invocation.ArgumentList.Arguments.FirstOrDefault()?.Expression;
            if (argument is not null &&
                model.GetSymbolInfo(argument).Symbol is IFieldSymbol { ContainingType.Name: "ServiceLifetime" } field)
                return field.Name;

            Reason("WithLifetime(...) argument is not a ServiceLifetime member; lifetime recorded as Unknown");
            return "Unknown";
        }

        private bool IsSelectorMethod(InvocationExpressionSyntax invocation)
        {
            var info = model.GetSymbolInfo(invocation);
            var symbol = info.Symbol ?? info.CandidateSymbols.FirstOrDefault();
            if (symbol?.ContainingType is not { } type) return true;
            return SelectorTypes.Contains(type.Name) || type.ContainingNamespace?.ToDisplayString() == "Scrutor";
        }

        private List<INamedTypeSymbol>? TypeArguments(InvocationExpressionSyntax invocation)
        {
            if (invocation.Expression is not MemberAccessExpressionSyntax { Name: GenericNameSyntax generic })
                return [];

            var types = new List<INamedTypeSymbol>();
            foreach (var argument in generic.TypeArgumentList.Arguments)
            {
                if (model.GetTypeInfo(argument).Type is not INamedTypeSymbol { TypeKind: not TypeKind.Error } type)
                    return null;
                types.Add(type);
            }

            return types;
        }

        private List<INamedTypeSymbol>? TypeOfArguments(InvocationExpressionSyntax invocation)
        {
            var types = new List<INamedTypeSymbol>();
            foreach (var argument in invocation.ArgumentList.Arguments)
            {
                if (argument.Expression is not TypeOfExpressionSyntax typeOf ||
                    model.GetTypeInfo(typeOf.Type).Type is not INamedTypeSymbol { TypeKind: not TypeKind.Error } type)
                    return null;
                types.Add(type);
            }

            return types.Count > 0 ? types : null;
        }

        private List<IAssemblySymbol>? AssemblyArguments(InvocationExpressionSyntax invocation)
        {
            var assemblies = new List<IAssemblySymbol>();
            foreach (var argument in invocation.ArgumentList.Arguments)
            {
                var assembly = ResolveAssembly(argument.Expression);
                if (assembly is null) return null;
                assemblies.Add(assembly);
            }

            return assemblies.Count > 0 ? assemblies : null;
        }

        private IAssemblySymbol? ResolveAssembly(ExpressionSyntax expression)
        {
            if (expression is MemberAccessExpressionSyntax { Name.Identifier.Text: "Assembly" } member)
            {
                var target = member.Expression;
                if (target is InvocationExpressionSyntax
                    {
                        Expression: MemberAccessExpressionSyntax { Name.Identifier.Text: "GetTypeInfo" } getTypeInfo
                    })
                    target = getTypeInfo.Expression;

                return target is TypeOfExpressionSyntax typeOf &&
                       model.GetTypeInfo(typeOf.Type).Type is { TypeKind: not TypeKind.Error } type
                    ? type.ContainingAssembly
                    : null;
            }

            if (expression is InvocationExpressionSyntax call &&
                model.GetSymbolInfo(call).Symbol is IMethodSymbol { Name: "GetExecutingAssembly" } method &&
                method.ContainingType.ToDisplayString() == "System.Reflection.Assembly")
                return model.Compilation.Assembly;

            return null;
        }

        private List<string>? StringArguments(InvocationExpressionSyntax invocation)
        {
            var values = new List<string>();
            foreach (var argument in invocation.ArgumentList.Arguments)
            {
                if (model.GetConstantValue(argument.Expression) is not { HasValue: true, Value: string value })
                    return null;
                values.Add(value);
            }

            return values.Count > 0 ? values : null;
        }

        private List<INamedTypeSymbol> Candidates(Selection selection)
        {
            var result = new List<INamedTypeSymbol>();
            foreach (var assembly in selection.Assemblies!.Distinct<IAssemblySymbol>(SymbolEqualityComparer.Default))
            {
                if (!selection.PublicOnly && !assembly.Locations.Any(l => l.IsInSource))
                    Reason($"assembly '{assembly.Name}' is loaded from metadata; its non-public classes may be invisible");

                result.AddRange(AllTypes(assembly.GlobalNamespace).Where(t =>
                    t.TypeKind == TypeKind.Class && !t.IsAbstract && !t.IsStatic && !t.IsImplicitlyDeclared &&
                    (!selection.PublicOnly || t.DeclaredAccessibility == Accessibility.Public)));
            }

            return result;
        }

        private void Reason(string reason) => _reasons.Add(reason);

        private void Unresolved(string reason)
        {
            _unresolved = true;
            Reason(reason);
        }
    }

    private static IEnumerable<INamedTypeSymbol> Services(INamedTypeSymbol candidate, Mapping mapping) => mapping.Kind switch
    {
        MappingKind.Self => [candidate],
        MappingKind.ImplementedInterfaces => candidate.AllInterfaces,
        MappingKind.SelfWithInterfaces => [candidate, .. candidate.AllInterfaces],
        MappingKind.MatchingInterface => candidate.AllInterfaces.Where(i => i.Name == "I" + candidate.Name),
        _ => mapping.Types,
    };

    private static IEnumerable<INamedTypeSymbol> SelfBasesAndInterfaces(INamedTypeSymbol type)
    {
        for (var current = type; current is not null && current.SpecialType != SpecialType.System_Object; current = current.BaseType)
            yield return current;
        foreach (var @interface in type.AllInterfaces)
            yield return @interface;
    }

    private static bool IsAssignableTo(INamedTypeSymbol candidate, INamedTypeSymbol target)
    {
        var open = target.IsUnboundGenericType ||
                   (target.IsGenericType && SymbolEqualityComparer.Default.Equals(target, target.OriginalDefinition));
        var targetKey = Key(open ? target.OriginalDefinition : target);

        return SelfBasesAndInterfaces(candidate)
            .Any(t => Key(open ? t.OriginalDefinition : t) == targetKey);
    }

    private static bool HasAttribute(INamedTypeSymbol candidate, INamedTypeSymbol attribute)
    {
        var attributeKey = Key(attribute);
        for (var type = candidate; type is not null; type = type.BaseType)
        {
            foreach (var data in type.GetAttributes())
            {
                for (var attributeClass = data.AttributeClass; attributeClass is not null; attributeClass = attributeClass.BaseType)
                {
                    if (Key(attributeClass) == attributeKey) return true;
                }
            }
        }

        return false;
    }

    private static bool IsInNamespace(string typeNamespace, string @namespace) =>
        typeNamespace == @namespace ||
        typeNamespace.StartsWith(@namespace + ".", StringComparison.Ordinal);

    private static string NamespaceOf(INamedTypeSymbol type) =>
        type.ContainingNamespace is null or { IsGlobalNamespace: true } ? "" : type.ContainingNamespace.ToDisplayString();

    private static string Key(ITypeSymbol type) => type.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);

    private static IEnumerable<INamedTypeSymbol> AllTypes(INamespaceSymbol ns)
    {
        foreach (var member in ns.GetMembers())
        {
            if (member is INamespaceSymbol child)
            {
                foreach (var type in AllTypes(child)) yield return type;
            }
            else if (member is INamedTypeSymbol type)
            {
                foreach (var nested in WithNested(type)) yield return nested;
            }
        }
    }

    private static IEnumerable<INamedTypeSymbol> WithNested(INamedTypeSymbol type)
    {
        yield return type;
        foreach (var nested in type.GetTypeMembers().SelectMany(WithNested))
            yield return nested;
    }

    private static bool TryGetLambda(ExpressionSyntax? expression, out string parameter, out CSharpSyntaxNode body)
    {
        switch (expression)
        {
            case SimpleLambdaExpressionSyntax simple:
                parameter = simple.Parameter.Identifier.Text;
                body = simple.Body;
                return true;
            case ParenthesizedLambdaExpressionSyntax { ParameterList.Parameters: [var single] } parenthesized:
                parameter = single.Identifier.Text;
                body = parenthesized.Body;
                return true;
            default:
                parameter = "";
                body = null!;
                return false;
        }
    }

    private static bool TryGetStatements(CSharpSyntaxNode body, out List<ExpressionSyntax> statements)
    {
        statements = [];
        if (body is ExpressionSyntax expression)
        {
            statements.Add(expression);
            return true;
        }

        if (body is not BlockSyntax block) return false;

        foreach (var statement in block.Statements)
        {
            if (statement is not ExpressionStatementSyntax expressionStatement) return false;
            statements.Add(expressionStatement.Expression);
        }

        return true;
    }

    private static List<(string Name, InvocationExpressionSyntax Invocation)>? Flatten(ExpressionSyntax expression, string parameter)
    {
        var calls = new List<(string, InvocationExpressionSyntax)>();
        while (expression is InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax member } invocation)
        {
            calls.Add((member.Name.Identifier.Text, invocation));
            expression = member.Expression;
        }

        if (expression is not IdentifierNameSyntax identifier || identifier.Identifier.Text != parameter)
            return null;

        calls.Reverse();
        return calls;
    }

    private static string StripGeneric(string typeName)
    {
        var idx = typeName.IndexOf('<');
        return idx >= 0 ? typeName[..idx] : typeName;
    }
}
