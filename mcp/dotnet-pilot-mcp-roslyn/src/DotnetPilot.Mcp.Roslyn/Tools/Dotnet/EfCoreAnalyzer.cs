using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using DotnetPilot.Mcp.Roslyn.Models;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

public static class EfCoreAnalyzer
{
    private static readonly HashSet<string> DbContextBaseTypes = new(StringComparer.Ordinal)
    {
        "DbContext", "IdentityDbContext", "IdentityDbContext`1",
        "IdentityDbContext`3", "ApiAuthorizationDbContext",
    };

    private static readonly HashSet<string> CollectionTypes = new(StringComparer.Ordinal)
    {
        "ICollection", "IList", "List", "IEnumerable",
        "IReadOnlyCollection", "IReadOnlyList", "HashSet",
    };

    private static readonly HashSet<string> KeyAttributes = new(StringComparer.Ordinal)
    {
        "Key", "KeyAttribute",
    };

    public static async Task<EfCoreReport> AnalyzeAsync(Solution solution, CancellationToken ct)
    {
        var contexts = new List<DbContextInfo>();

        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync(ct);
            if (compilation is null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                ct.ThrowIfCancellationRequested();
                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(ct);

                foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
                {
                    if (model.GetDeclaredSymbol(classDecl) is not INamedTypeSymbol symbol) continue;
                    if (!IsDbContext(symbol)) continue;

                    var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
                    var filePath = tree.FilePath;
                    var relPath = Path.GetRelativePath(solutionDir, filePath).Replace('\\', '/');
                    var line = classDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                    var entities = ExtractEntities(symbol, compilation, solution, solutionDir, ct);

                    contexts.Add(new DbContextInfo
                    {
                        Name = symbol.Name,
                        FullName = symbol.ToDisplayString(),
                        File = relPath,
                        Line = line,
                        Project = project.Name,
                        Entities = entities
                    });
                }
            }
        }

        return new EfCoreReport { Contexts = contexts };
    }

    private static bool IsDbContext(INamedTypeSymbol symbol)
    {
        var current = symbol.BaseType;
        while (current is not null)
        {
            if (DbContextBaseTypes.Contains(current.MetadataName) ||
                DbContextBaseTypes.Contains(current.Name))
                return true;
            current = current.BaseType;
        }
        return false;
    }

    private static List<EntityInfo> ExtractEntities(
        INamedTypeSymbol contextSymbol, Compilation compilation,
        Solution solution, string solutionDir, CancellationToken ct)
    {
        var entities = new Dictionary<string, EntityInfo>(StringComparer.Ordinal);
        var fluentConfigured = new HashSet<string>(StringComparer.Ordinal);

        // Scan OnModelCreating first to identify fluent-configured entities
        var onModelCreating = contextSymbol.GetMembers("OnModelCreating")
            .OfType<IMethodSymbol>()
            .FirstOrDefault();

        if (onModelCreating is not null)
        {
            foreach (var syntaxRef in onModelCreating.DeclaringSyntaxReferences)
            {
                var syntax = syntaxRef.GetSyntax(ct);
                var tree = syntax.SyntaxTree;
                var model = compilation.GetSemanticModel(tree);

                foreach (var invocation in syntax.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) continue;
                    if (memberAccess.Name is not GenericNameSyntax { Identifier.Text: "Entity" } genericName) continue;
                    if (genericName.TypeArgumentList.Arguments.Count != 1) continue;

                    var typeInfo = model.GetTypeInfo(genericName.TypeArgumentList.Arguments[0], ct);
                    if (typeInfo.Type is INamedTypeSymbol entityType)
                    {
                        fluentConfigured.Add(entityType.ToDisplayString());
                    }
                }
            }
        }

        // Find DbSet<T> properties
        foreach (var member in contextSymbol.GetMembers().OfType<IPropertySymbol>())
        {
            if (member.Type is not INamedTypeSymbol propType) continue;
            if (propType.Name != "DbSet" || propType.TypeArguments.Length != 1) continue;

            var entityType = propType.TypeArguments[0] as INamedTypeSymbol;
            if (entityType is null) continue;

            var key = entityType.ToDisplayString();
            if (!entities.ContainsKey(key))
            {
                entities[key] = BuildEntityInfo(entityType, member.Name, compilation, solutionDir, fluentConfigured);
            }
        }

        // Add entities discovered only via OnModelCreating (no DbSet property)
        if (onModelCreating is not null)
        {
            foreach (var syntaxRef in onModelCreating.DeclaringSyntaxReferences)
            {
                var syntax = syntaxRef.GetSyntax(ct);
                var tree = syntax.SyntaxTree;
                var model = compilation.GetSemanticModel(tree);

                foreach (var invocation in syntax.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) continue;
                    if (memberAccess.Name is not GenericNameSyntax { Identifier.Text: "Entity" } genericName) continue;
                    if (genericName.TypeArgumentList.Arguments.Count != 1) continue;

                    var typeInfo = model.GetTypeInfo(genericName.TypeArgumentList.Arguments[0], ct);
                    if (typeInfo.Type is INamedTypeSymbol entityType)
                    {
                        var key = entityType.ToDisplayString();
                        if (!entities.ContainsKey(key))
                        {
                            entities[key] = BuildEntityInfo(entityType, null, compilation, solutionDir, fluentConfigured);
                        }
                    }
                }
            }
        }

        return entities.Values.ToList();
    }

    private static EntityInfo BuildEntityInfo(
        INamedTypeSymbol entityType, string? dbSetProperty,
        Compilation compilation, string solutionDir,
        HashSet<string> fluentConfigured)
    {
        var properties = new List<EntityPropertyInfo>();
        var navigations = new List<NavigationInfo>();
        var configuredVia = "convention";

        foreach (var member in entityType.GetMembers().OfType<IPropertySymbol>())
        {
            if (member.IsImplicitlyDeclared || member.IsStatic) continue;

            var isNavigation = IsNavigationProperty(member);

            if (isNavigation)
            {
                var targetType = GetNavigationTargetType(member);
                var isCollection = IsCollectionType(member.Type);
                navigations.Add(new NavigationInfo
                {
                    Name = member.Name,
                    Type = member.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                    IsCollection = isCollection,
                    TargetEntity = targetType
                });
            }
            else
            {
                var isKey = member.Name == "Id" ||
                            member.Name == entityType.Name + "Id" ||
                            HasAttribute(member, KeyAttributes);
                var isNullable = member.NullableAnnotation == NullableAnnotation.Annotated ||
                                 member.Type.IsValueType && member.Type is INamedTypeSymbol { IsGenericType: true } nt &&
                                 nt.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T;
                var hasColumn = HasAttribute(member, new HashSet<string> { "Column", "ColumnAttribute" });

                properties.Add(new EntityPropertyInfo
                {
                    Name = member.Name,
                    Type = member.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                    IsNullable = isNullable,
                    IsKey = isKey,
                    HasColumnAttribute = hasColumn
                });
            }
        }

        // Check for data annotations on the class itself
        if (HasAttribute(entityType, new HashSet<string> { "Table", "TableAttribute" }))
            configuredVia = "data-annotations";

        // Check for fluent configuration: inline in OnModelCreating or via IEntityTypeConfiguration<T>
        if (fluentConfigured.Contains(entityType.ToDisplayString()) || HasFluentConfiguration(entityType, compilation))
            configuredVia = configuredVia == "data-annotations" ? "data-annotations+fluent" : "fluent";

        return new EntityInfo
        {
            Name = entityType.Name,
            FullName = entityType.ToDisplayString(),
            DbSetProperty = dbSetProperty,
            Properties = properties,
            Navigations = navigations,
            ConfiguredVia = configuredVia
        };
    }

    private static bool IsNavigationProperty(IPropertySymbol property)
    {
        var type = property.Type;
        if (type.TypeKind == TypeKind.Class && type.SpecialType == SpecialType.None)
        {
            if (type is INamedTypeSymbol named && named.IsGenericType)
                return IsCollectionType(type);
            if (type.Name != "string" && type.Name != "String" && type.Name != "Byte")
                return HasEntityShape(type);
        }
        return false;
    }

    private static bool HasEntityShape(ITypeSymbol type)
    {
        if (type is not INamedTypeSymbol named) return false;
        return named.GetMembers().OfType<IPropertySymbol>()
            .Any(p => p.Name == "Id" || p.Name == named.Name + "Id");
    }

    private static bool IsCollectionType(ITypeSymbol type)
    {
        if (type is INamedTypeSymbol named)
        {
            if (CollectionTypes.Contains(named.Name)) return true;
            return named.AllInterfaces.Any(i => CollectionTypes.Contains(i.Name));
        }
        return false;
    }

    private static string GetNavigationTargetType(IPropertySymbol property)
    {
        var type = property.Type;
        if (type is INamedTypeSymbol { IsGenericType: true } named && named.TypeArguments.Length > 0)
            return named.TypeArguments[0].Name;
        return type.Name;
    }

    private static bool HasAttribute(ISymbol symbol, HashSet<string> attributeNames)
    {
        return symbol.GetAttributes()
            .Any(a => a.AttributeClass is not null &&
                      (attributeNames.Contains(a.AttributeClass.Name) ||
                       attributeNames.Contains(a.AttributeClass.Name.Replace("Attribute", ""))));
    }

    private static bool HasFluentConfiguration(INamedTypeSymbol entityType, Compilation compilation)
    {
        var configInterface = compilation.GetTypeByMetadataName(
            "Microsoft.EntityFrameworkCore.IEntityTypeConfiguration`1");
        if (configInterface is null) return false;

        var targetConfig = configInterface.Construct(entityType);

        foreach (var tree in compilation.SyntaxTrees)
        {
            var model = compilation.GetSemanticModel(tree);
            var root = tree.GetRoot();

            foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
            {
                if (model.GetDeclaredSymbol(classDecl) is not INamedTypeSymbol classSymbol) continue;

                if (classSymbol.AllInterfaces.Any(i =>
                    SymbolEqualityComparer.Default.Equals(i, targetConfig)))
                    return true;
            }
        }

        return false;
    }
}
