using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using DotnetPilot.Mcp.Roslyn.Models;

namespace DotnetPilot.Mcp.Roslyn.Tools.Dotnet;

/// <summary>
/// Semantic analysis of DI registrations and consumers across a Roslyn Solution.
/// Handles AddScoped/AddTransient/AddSingleton, keyed variants, TryAdd*,
/// AddHttpClient, AddDbContext, and Scrutor assembly scanning.
/// </summary>
public static class DiAnalyzer
{
    private static readonly HashSet<string> LifetimeMethods = new(StringComparer.Ordinal)
    {
        "AddScoped", "AddTransient", "AddSingleton",
        "AddKeyedScoped", "AddKeyedTransient", "AddKeyedSingleton",
        "TryAddScoped", "TryAddTransient", "TryAddSingleton",
        "TryAddKeyedScoped", "TryAddKeyedTransient", "TryAddKeyedSingleton",
    };

    private static readonly HashSet<string> SpecialRegistrations = new(StringComparer.Ordinal)
    {
        "AddHttpClient", "AddDbContext", "AddDbContextPool",
        "AddDbContextFactory", "AddHostedService",
    };

    // Framework types that are always available without explicit registration
    private static readonly HashSet<string> FrameworkTypes = new(StringComparer.Ordinal)
    {
        "ILogger", "ILoggerFactory", "IConfiguration", "IOptions",
        "IOptionsMonitor", "IOptionsSnapshot", "IHostEnvironment",
        "IWebHostEnvironment", "IHttpContextAccessor", "IMemoryCache",
        "IDistributedCache", "IServiceProvider", "IServiceScopeFactory",
        "LinkGenerator", "IUrlHelperFactory",
    };

    public static async Task<List<DiRegistration>> FindRegistrationsAsync(Solution solution, CancellationToken ct)
    {
        var registrations = new List<DiRegistration>();

        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync(ct);
            if (compilation is null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                ct.ThrowIfCancellationRequested();

                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(ct);
                var filePath = GetRelativePath(solution, tree.FilePath);

                foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    var registration = TryParseRegistration(invocation, model, filePath);
                    if (registration is not null)
                        registrations.Add(registration);
                }
            }
        }

        return registrations;
    }

    public static async Task<List<DiConsumer>> FindConsumersAsync(Solution solution, CancellationToken ct)
    {
        var consumers = new List<DiConsumer>();

        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync(ct);
            if (compilation is null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                ct.ThrowIfCancellationRequested();

                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(ct);
                var filePath = GetRelativePath(solution, tree.FilePath);

                foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
                {
                    var consumer = TryParseConsumer(classDecl, model, filePath);
                    if (consumer is not null)
                        consumers.Add(consumer);
                }
            }
        }

        return consumers;
    }

    public static async Task<DiCompletenessReport> CheckCompletenessAsync(Solution solution, CancellationToken ct)
    {
        var registrations = await FindRegistrationsAsync(solution, ct);
        var consumers = await FindConsumersAsync(solution, ct);

        var registeredTypes = new HashSet<string>(StringComparer.Ordinal);
        var lifetimeByType = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var reg in registrations)
        {
            if (reg.Interface is not null)
                registeredTypes.Add(StripGeneric(reg.Interface));
            registeredTypes.Add(StripGeneric(reg.Implementation));

            var key = reg.Interface ?? reg.Implementation;
            lifetimeByType.TryAdd(StripGeneric(key), reg.Lifetime);
        }

        // Find missing registrations
        var missing = new List<DiMissing>();
        foreach (var consumer in consumers)
        {
            foreach (var param in consumer.ConstructorParams)
            {
                var typeName = StripGeneric(param.Type);
                if (FrameworkTypes.Contains(typeName)) continue;
                if (registeredTypes.Contains(typeName)) continue;

                var existing = missing.FirstOrDefault(m => m.Interface == param.Type);
                if (existing is not null)
                {
                    existing.ConsumedBy.Add(new DiConsumerRef
                    {
                        Type = consumer.Type,
                        File = consumer.File,
                        Line = consumer.Line
                    });
                }
                else
                {
                    missing.Add(new DiMissing
                    {
                        Interface = param.Type,
                        ConsumedBy =
                        [
                            new DiConsumerRef
                            {
                                Type = consumer.Type,
                                File = consumer.File,
                                Line = consumer.Line
                            }
                        ]
                    });
                }
            }
        }

        // Detect captive dependencies (Scoped inside Singleton)
        var captive = new List<DiCaptive>();
        foreach (var consumer in consumers)
        {
            var consumerType = StripGeneric(consumer.Type);
            if (!lifetimeByType.TryGetValue(consumerType, out var consumerLifetime))
                continue;

            foreach (var param in consumer.ConstructorParams)
            {
                var depType = StripGeneric(param.Type);
                if (!lifetimeByType.TryGetValue(depType, out var depLifetime))
                    continue;

                if (IsCaptive(consumerLifetime, depLifetime))
                {
                    captive.Add(new DiCaptive
                    {
                        Dependency = param.Type,
                        Lifetime = depLifetime,
                        Consumer = consumer.Type,
                        ConsumerLifetime = consumerLifetime,
                        File = consumer.File,
                        Line = consumer.Line
                    });
                }
            }
        }

        return new DiCompletenessReport
        {
            Registered = registrations,
            Missing = missing,
            Captive = captive
        };
    }

    private static DiRegistration? TryParseRegistration(
        InvocationExpressionSyntax invocation, SemanticModel model, string filePath)
    {
        var methodName = GetMethodName(invocation);
        if (methodName is null) return null;

        string? lifetime = null;
        string? registrationMethod = null;

        if (LifetimeMethods.Contains(methodName))
        {
            lifetime = ExtractLifetime(methodName);
            registrationMethod = methodName;
        }
        else if (SpecialRegistrations.Contains(methodName))
        {
            lifetime = methodName switch
            {
                "AddHostedService" => "Singleton",
                _ => "Scoped" // DbContext defaults to Scoped
            };
            registrationMethod = methodName;
        }
        else if (methodName == "TryAddEnumerable")
        {
            registrationMethod = "TryAddEnumerable";
            lifetime = "Unknown";
        }
        else
        {
            return null;
        }

        // Extract type arguments
        string? interfaceType = null;
        string? implType = null;

        if (invocation.Expression is MemberAccessExpressionSyntax memberAccess &&
            memberAccess.Name is GenericNameSyntax generic)
        {
            var typeArgs = generic.TypeArgumentList.Arguments;
            if (typeArgs.Count == 2)
            {
                interfaceType = GetTypeDisplayName(typeArgs[0], model);
                implType = GetTypeDisplayName(typeArgs[1], model);
            }
            else if (typeArgs.Count == 1)
            {
                implType = GetTypeDisplayName(typeArgs[0], model);
            }
        }

        // Try typeof() arguments
        if (implType is null)
        {
            var args = invocation.ArgumentList.Arguments;
            foreach (var arg in args)
            {
                if (arg.Expression is TypeOfExpressionSyntax typeOf)
                {
                    var name = GetTypeDisplayName(typeOf.Type, model);
                    if (interfaceType is null && implType is null)
                        interfaceType = name;
                    else
                        implType = name;
                }
            }

            // If only one typeof was found, it's the implementation
            if (interfaceType is not null && implType is null)
            {
                implType = interfaceType;
                interfaceType = null;
            }
        }

        if (implType is null) return null;

        var lineSpan = invocation.GetLocation().GetLineSpan();

        return new DiRegistration
        {
            Interface = interfaceType,
            Implementation = implType,
            Lifetime = lifetime,
            RegistrationMethod = registrationMethod,
            File = filePath,
            Line = lineSpan.StartLinePosition.Line + 1
        };
    }

    private static DiConsumer? TryParseConsumer(
        ClassDeclarationSyntax classDecl, SemanticModel model, string filePath)
    {
        var symbol = model.GetDeclaredSymbol(classDecl);
        if (symbol is null || symbol.IsAbstract || symbol.IsStatic) return null;

        // Find the primary or explicit constructor with the most parameters
        IMethodSymbol? ctor = null;

        if (classDecl.ParameterList is not null)
        {
            // Primary constructor
            ctor = symbol.Constructors
                .FirstOrDefault(c => !c.IsStatic && c.Parameters.Length == classDecl.ParameterList.Parameters.Count);
        }

        ctor ??= symbol.Constructors
            .Where(c => !c.IsStatic && c.DeclaredAccessibility == Accessibility.Public)
            .OrderByDescending(c => c.Parameters.Length)
            .FirstOrDefault();

        if (ctor is null || ctor.Parameters.Length == 0) return null;

        // Only include classes that inject at least one non-primitive type
        var injectedParams = new List<DiParam>();
        foreach (var param in ctor.Parameters)
        {
            if (param.Type.SpecialType != SpecialType.None) continue;
            if (param.Type.TypeKind is TypeKind.Enum or TypeKind.Struct) continue;

            injectedParams.Add(new DiParam
            {
                Type = param.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                Name = param.Name
            });
        }

        if (injectedParams.Count == 0) return null;

        var lineSpan = classDecl.GetLocation().GetLineSpan();

        return new DiConsumer
        {
            Type = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            File = filePath,
            Line = lineSpan.StartLinePosition.Line + 1,
            ConstructorParams = injectedParams
        };
    }

    private static string? GetMethodName(InvocationExpressionSyntax invocation)
    {
        return invocation.Expression switch
        {
            MemberAccessExpressionSyntax { Name: GenericNameSyntax generic } => generic.Identifier.Text,
            MemberAccessExpressionSyntax memberAccess => memberAccess.Name.Identifier.Text,
            IdentifierNameSyntax identifier => identifier.Identifier.Text,
            _ => null
        };
    }

    private static string GetTypeDisplayName(TypeSyntax typeSyntax, SemanticModel model)
    {
        var typeInfo = model.GetTypeInfo(typeSyntax);
        if (typeInfo.Type is not null)
            return typeInfo.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat);
        return typeSyntax.ToString();
    }

    private static string ExtractLifetime(string methodName)
    {
        if (methodName.Contains("Scoped", StringComparison.Ordinal)) return "Scoped";
        if (methodName.Contains("Transient", StringComparison.Ordinal)) return "Transient";
        if (methodName.Contains("Singleton", StringComparison.Ordinal)) return "Singleton";
        return "Unknown";
    }

    private static string StripGeneric(string typeName)
    {
        var idx = typeName.IndexOf('<');
        return idx >= 0 ? typeName[..idx] : typeName;
    }

    private static bool IsCaptive(string consumerLifetime, string depLifetime)
    {
        // Singleton consuming Scoped or Transient is a captive dependency
        // Scoped consuming Transient is technically fine (transient gets new per-resolve)
        return consumerLifetime == "Singleton" && depLifetime is "Scoped" or "Transient";
    }

    private static string GetRelativePath(Solution solution, string filePath)
    {
        if (solution.FilePath is null) return filePath;
        var solutionDir = Path.GetDirectoryName(solution.FilePath)!;
        return Path.GetRelativePath(solutionDir, filePath).Replace('\\', '/');
    }
}
