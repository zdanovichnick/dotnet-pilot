using DotnetPilot.Mcp.Roslyn.Tools.Dotnet;
using DotnetPilot.Mcp.Roslyn.Workspace;
using System.Reflection;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Xunit;

namespace DotnetPilot.Mcp.Roslyn.Tests;

public class DiAnalyzerTests : IAsyncLifetime
{
    private static readonly string? SolutionPath =
        Environment.GetEnvironmentVariable("DNP_TEST_SOLUTION");

    private WorkspaceCache? _workspace;

    static DiAnalyzerTests()
    {
        if (!MSBuildLocator.IsRegistered)
        {
            var instance = MSBuildLocator.QueryVisualStudioInstances()
                .OrderByDescending(i => i.Version)
                .First();
            MSBuildLocator.RegisterInstance(instance);
        }
    }

    public async Task InitializeAsync()
    {
        if (string.IsNullOrEmpty(SolutionPath) || !File.Exists(SolutionPath))
            return;

        _workspace = new WorkspaceCache(new WorkspaceOptions(SolutionPath));
        await _workspace.GetSolutionAsync(CancellationToken.None);
    }

    public Task DisposeAsync()
    {
        _workspace?.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task FindRegistrations_ReturnsResults()
    {
        if (_workspace is null)
            return; // Solution not available in this environment

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var registrations = await DiAnalyzer.FindRegistrationsAsync(solution, CancellationToken.None);

        Assert.NotEmpty(registrations);
        Assert.All(registrations, r =>
        {
            Assert.NotNull(r.Implementation);
            Assert.NotNull(r.Lifetime);
            Assert.NotNull(r.File);
            Assert.True(r.Line > 0);
        });
    }

    [Fact]
    public async Task FindConsumers_ReturnsResults()
    {
        if (_workspace is null)
            return;

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var consumers = await DiAnalyzer.FindConsumersAsync(solution, CancellationToken.None);

        Assert.NotEmpty(consumers);
        Assert.All(consumers, c =>
        {
            Assert.NotNull(c.Type);
            Assert.NotEmpty(c.ConstructorParams);
        });
    }

    [Fact]
    public async Task CheckCompleteness_ScrutorScan_IsReportedWithNote()
    {
        const string source = """
            using Scrutor;

            namespace Scrutor
            {
                public static class ScanExtensions
                {
                    public static object Scan(this object services, System.Action<object> selector) => services;
                }
            }

            public interface IClock { }
            public class Consumer(IClock clock) { }

            public static class DependencyInjection
            {
                public static void Wire(object services) => services.Scan(s => { });
            }
            """;

        using var workspace = new AdhocWorkspace();
        var project = workspace.AddProject("Demo", LanguageNames.CSharp)
            .AddMetadataReference(MetadataReference.CreateFromFile(typeof(object).Assembly.Location))
            .AddMetadataReference(MetadataReference.CreateFromFile(
                Assembly.Load("System.Runtime").Location));
        var document = project.AddDocument("DependencyInjection.cs", source);

        var report = await DiAnalyzer.CheckCompletenessAsync(document.Project.Solution, CancellationToken.None);

        var scan = Assert.Single(report.Scans);
        Assert.Equal(16, scan.Line);
        Assert.NotNull(report.Note);
    }

    [Fact]
    public async Task CheckCompleteness_NoScan_HasNoNote()
    {
        using var workspace = new AdhocWorkspace();
        var project = workspace.AddProject("Demo", LanguageNames.CSharp)
            .AddMetadataReference(MetadataReference.CreateFromFile(typeof(object).Assembly.Location));
        var document = project.AddDocument("Plain.cs", "public class Plain { }");

        var report = await DiAnalyzer.CheckCompletenessAsync(document.Project.Solution, CancellationToken.None);

        Assert.Empty(report.Scans);
        Assert.Null(report.Note);
    }

    [Fact]
    public async Task CheckCompleteness_ProducesReport()
    {
        if (_workspace is null)
            return;

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var report = await DiAnalyzer.CheckCompletenessAsync(solution, CancellationToken.None);

        Assert.NotNull(report);
        Assert.NotNull(report.Registered);
        Assert.NotNull(report.Missing);
        Assert.NotNull(report.Captive);
    }

    // Mirrors the public API of Scrutor 6.1.0: Scan lives in
    // Microsoft.Extensions.DependencyInjection.ServiceCollectionExtensions, the selectors in Scrutor.
    // FromCallingAssembly/FromExecutingAssembly are absent from 6.1.0 and kept for earlier releases.
    private const string ScrutorStub = """
        namespace Microsoft.Extensions.DependencyInjection
        {
            public interface IServiceCollection { }
            public enum ServiceLifetime { Singleton, Scoped, Transient }

            public static class ServiceCollectionExtensions
            {
                public static IServiceCollection Scan(this IServiceCollection services, System.Action<Scrutor.ITypeSourceSelector> action) => services;
                public static IServiceCollection AddScoped<TService, TImplementation>(this IServiceCollection services) where TImplementation : TService => services;
            }
        }

        namespace Scrutor
        {
            using System;
            using System.Collections.Generic;
            using System.Reflection;
            using Microsoft.Extensions.DependencyInjection;

            public interface IFluentInterface { }

            public interface IAssemblySelector : IFluentInterface
            {
                IImplementationTypeSelector FromCallingAssembly();
                IImplementationTypeSelector FromExecutingAssembly();
                IImplementationTypeSelector FromEntryAssembly();
                IImplementationTypeSelector FromApplicationDependencies();
                IImplementationTypeSelector FromApplicationDependencies(Func<Assembly, bool> predicate);
                IImplementationTypeSelector FromAssemblyDependencies(Assembly assembly);
                IImplementationTypeSelector FromAssemblyOf<T>();
                IImplementationTypeSelector FromAssembliesOf(params Type[] types);
                IImplementationTypeSelector FromAssembliesOf(IEnumerable<Type> types);
                IImplementationTypeSelector FromAssemblies(params Assembly[] assemblies);
                IImplementationTypeSelector FromAssemblies(IEnumerable<Assembly> assemblies);
            }

            public interface ITypeSelector : IFluentInterface
            {
                IServiceTypeSelector FromTypes(params Type[] types);
                IServiceTypeSelector FromTypes(IEnumerable<Type> types);
            }

            public interface ITypeSourceSelector : IAssemblySelector, ITypeSelector { }

            public static class TypeSelectorExtensions
            {
                public static IServiceTypeSelector FromType<T>(this ITypeSelector selector) => selector.FromTypes(typeof(T));
            }

            public interface IImplementationTypeSelector : IAssemblySelector
            {
                IServiceTypeSelector AddClasses();
                IServiceTypeSelector AddClasses(bool publicOnly);
                IServiceTypeSelector AddClasses(Action<IImplementationTypeFilter> action);
                IServiceTypeSelector AddClasses(Action<IImplementationTypeFilter> action, bool publicOnly);
            }

            public interface IServiceTypeSelector : IImplementationTypeSelector
            {
                ILifetimeSelector AsSelf();
                ILifetimeSelector As<T>();
                ILifetimeSelector As(params Type[] types);
                ILifetimeSelector As(IEnumerable<Type> types);
                ILifetimeSelector AsImplementedInterfaces();
                ILifetimeSelector AsImplementedInterfaces(Func<Type, bool> predicate);
                ILifetimeSelector AsSelfWithInterfaces();
                ILifetimeSelector AsSelfWithInterfaces(Func<Type, bool> predicate);
                ILifetimeSelector AsMatchingInterface();
                ILifetimeSelector AsMatchingInterface(Action<Type, IImplementationTypeFilter> action);
                ILifetimeSelector As(Func<Type, IEnumerable<Type>> selector);
                IImplementationTypeSelector UsingAttributes();
                IServiceTypeSelector UsingRegistrationStrategy(RegistrationStrategy registrationStrategy);
            }

            public interface ILifetimeSelector : IServiceTypeSelector
            {
                IImplementationTypeSelector WithSingletonLifetime();
                IImplementationTypeSelector WithScopedLifetime();
                IImplementationTypeSelector WithTransientLifetime();
                IImplementationTypeSelector WithLifetime(ServiceLifetime lifetime);
                IImplementationTypeSelector WithLifetime(Func<Type, ServiceLifetime> selector);
            }

            public interface IImplementationTypeFilter : IFluentInterface
            {
                IImplementationTypeFilter AssignableTo<T>();
                IImplementationTypeFilter AssignableTo(Type type);
                IImplementationTypeFilter AssignableToAny(params Type[] types);
                IImplementationTypeFilter WithAttribute<T>() where T : Attribute;
                IImplementationTypeFilter WithAttribute(Type attributeType);
                IImplementationTypeFilter WithAttribute<T>(Func<T, bool> predicate) where T : Attribute;
                IImplementationTypeFilter WithoutAttribute<T>() where T : Attribute;
                IImplementationTypeFilter WithoutAttribute(Type attributeType);
                IImplementationTypeFilter InNamespaceOf<T>();
                IImplementationTypeFilter InNamespaceOf(params Type[] types);
                IImplementationTypeFilter InNamespaces(params string[] namespaces);
                IImplementationTypeFilter InExactNamespaceOf<T>();
                IImplementationTypeFilter InExactNamespaces(params string[] namespaces);
                IImplementationTypeFilter NotInNamespaceOf<T>();
                IImplementationTypeFilter NotInNamespaces(params string[] namespaces);
                IImplementationTypeFilter Where(Func<Type, bool> predicate);
            }

            public abstract class RegistrationStrategy
            {
                public static readonly RegistrationStrategy Skip = null!;
            }
        }
        """;

    private static async Task<Models.DiCompletenessReport> AnalyzeAsync(string appSource, string? libSource = null)
    {
        using var workspace = new AdhocWorkspace();
        var references = new[]
        {
            MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.Runtime").Location),
            MetadataReference.CreateFromFile(typeof(IServiceProvider).Assembly.Location),
        };
        var options = new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary, nullableContextOptions: NullableContextOptions.Enable);

        var solution = workspace.CurrentSolution;
        ProjectId? libId = null;
        if (libSource is not null)
        {
            var lib = solution.AddProject("Lib", "Lib", LanguageNames.CSharp)
                .WithCompilationOptions(options)
                .AddMetadataReferences(references)
                .AddDocument("Lib.cs", libSource).Project;
            libId = lib.Id;
            solution = lib.Solution;
        }

        var app = solution.AddProject("App", "App", LanguageNames.CSharp)
            .WithCompilationOptions(options)
            .AddMetadataReferences(references)
            .AddDocument("Scrutor.cs", ScrutorStub).Project
            .AddDocument("DependencyInjection.cs", appSource).Project;
        if (libId is not null)
            app = app.AddProjectReference(new ProjectReference(libId));
        solution = app.Solution;

        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync();
            var errors = compilation!.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToList();
            Assert.True(errors.Count == 0, string.Join(Environment.NewLine, errors));
        }

        return await DiAnalyzer.CheckCompletenessAsync(solution, CancellationToken.None);
    }

    private static string Wire(string scanBody, string extraMembers = "") => $$"""
        using Microsoft.Extensions.DependencyInjection; using Scrutor;

        public static class DependencyInjection
        {
            {{extraMembers}}
            public static void Wire(IServiceCollection services)
            {
                services.Scan({{scanBody}});
            }
        }

        """;

    private const string FooAndConsumer = """
        namespace App.Services
        {
            public interface IFoo { }
            public class Foo : IFoo { }
            public class FooConsumer(IFoo foo) { }
        }
        """;

    [Fact]
    public async Task CheckCompleteness_FromAssemblyOfAsImplementedInterfaces_CountsScanRegistration()
    {
        var report = await AnalyzeAsync(
            Wire("s => s.FromAssemblyOf<App.Services.Foo>().AddClasses().AsImplementedInterfaces().WithScopedLifetime()")
            + FooAndConsumer);

        Assert.DoesNotContain(report.Missing, m => m.Interface == "IFoo");
        var scan = Assert.Single(report.Scans);
        Assert.Equal("resolved", scan.Status);
        Assert.Empty(scan.Reasons);
        Assert.Equal(8, scan.Line);
        var reg = Assert.Single(report.Registered, r => r.Interface == "IFoo");
        Assert.Equal("Foo", reg.Implementation);
        Assert.Equal("Scoped", reg.Lifetime);
        Assert.Equal("Scan", reg.RegistrationMethod);
        Assert.Equal(scan.File, reg.File);
        Assert.Equal(scan.Line, reg.Line);
    }

    [Fact]
    public async Task CheckCompleteness_FromAssembliesOfAcrossProjects_ResolvesReferencedProject()
    {
        const string lib = """
            namespace Lib
            {
                public interface IBar { }
                public class Bar : IBar { }
                public class LibMarker { }
            }
            """;
        var report = await AnalyzeAsync(
            Wire("s => s.FromAssembliesOf(typeof(Lib.LibMarker), typeof(App.Services.Foo)).AddClasses().AsImplementedInterfaces()")
            + FooAndConsumer + "public class BarConsumer(Lib.IBar bar) { }",
            lib);

        Assert.Empty(report.Missing);
        Assert.Equal("resolved", Assert.Single(report.Scans).Status);
        Assert.Contains(report.Registered, r => r.Interface == "IBar" && r.Implementation == "Bar" && r.Lifetime == "Transient");
    }

    [Theory]
    [InlineData("FromCallingAssembly()")]
    [InlineData("FromExecutingAssembly()")]
    [InlineData("FromAssemblies(typeof(App.Services.Foo).Assembly)")]
    [InlineData("FromAssemblies(System.Reflection.Assembly.GetExecutingAssembly())")]
    public async Task CheckCompleteness_CallingProjectSources_Resolve(string source)
    {
        var report = await AnalyzeAsync(Wire($"s => s.{source}.AddClasses().AsImplementedInterfaces()") + FooAndConsumer);

        Assert.Empty(report.Missing);
        Assert.Equal("resolved", Assert.Single(report.Scans).Status);
    }

    [Theory]
    [InlineData("FromApplicationDependencies()")]
    [InlineData("FromEntryAssembly()")]
    [InlineData("FromAssemblies(Assemblies)")]
    public async Task CheckCompleteness_UnresolvableSource_FlagsMissingAsPossiblyScanned(string source)
    {
        var report = await AnalyzeAsync(
            Wire($"s => s.{source}.AddClasses().AsImplementedInterfaces()",
                "public static System.Reflection.Assembly[] Assemblies = [];")
            + FooAndConsumer);

        var scan = Assert.Single(report.Scans);
        Assert.Equal("unresolved", scan.Status);
        Assert.NotEmpty(scan.Reasons);
        var missing = Assert.Single(report.Missing);
        Assert.Equal("IFoo", missing.Interface);
        Assert.True(missing.PossiblyRegisteredByScan);
        Assert.Contains(missing.CandidateScans!, c => c.File == scan.File && c.Line == scan.Line);
        Assert.Contains($"{scan.File}:{scan.Line}", report.Note);
    }

    [Fact]
    public async Task CheckCompleteness_AddClassesDefault_SkipsInternalClasses()
    {
        const string types = """
            public interface IHidden { }
            internal class Hidden : IHidden { }
            public class HiddenConsumer(IHidden hidden) { }
            """;

        var publicOnly = await AnalyzeAsync(Wire("s => s.FromCallingAssembly().AddClasses().AsImplementedInterfaces()") + types);
        var all = await AnalyzeAsync(Wire("s => s.FromCallingAssembly().AddClasses(publicOnly: false).AsImplementedInterfaces()") + types);

        var missing = Assert.Single(publicOnly.Missing);
        Assert.Equal("IHidden", missing.Interface);
        Assert.Null(missing.PossiblyRegisteredByScan);
        Assert.Empty(all.Missing);
    }

    [Fact]
    public async Task CheckCompleteness_AssignableToFilter_RegistersOnlyMatchingClasses()
    {
        const string types = """
            public interface IHandler { }
            public interface IOther { }
            public class Handler : IHandler { }
            public class Other : IOther { }
            public class Consumer(IHandler h, IOther o) { }
            """;

        var report = await AnalyzeAsync(
            Wire("s => s.FromCallingAssembly().AddClasses(c => c.AssignableTo<IHandler>()).AsImplementedInterfaces()") + types);

        var missing = Assert.Single(report.Missing);
        Assert.Equal("IOther", missing.Interface);
        Assert.Null(missing.PossiblyRegisteredByScan);
        Assert.Equal("resolved", Assert.Single(report.Scans).Status);
    }

    [Fact]
    public async Task CheckCompleteness_AssignableToOpenGeneric_RegistersClosedImplementations()
    {
        const string types = """
            public class Order { }
            public interface IHandler<T> { }
            public class OrderHandler : IHandler<Order> { }
            public class Consumer(IHandler<Order> handler) { }
            """;

        var report = await AnalyzeAsync(
            Wire("s => s.FromCallingAssembly().AddClasses(c => c.AssignableTo(typeof(IHandler<>))).AsImplementedInterfaces()") + types);

        Assert.Empty(report.Missing);
        Assert.Contains(report.Registered, r => r.Interface == "IHandler<Order>" && r.Implementation == "OrderHandler");
    }

    [Theory]
    [InlineData("c => c.InNamespaceOf<App.Services.Foo>()")]
    [InlineData("c => c.InNamespaces(\"App.Services\")")]
    [InlineData("c => c.InNamespaces(\"App\")")]
    [InlineData("c => c.WithAttribute<App.Services.ScanMeAttribute>()")]
    public async Task CheckCompleteness_NamespaceAndAttributeFilters_SelectOnlyMatchingClasses(string filter)
    {
        const string types = """
            namespace App.Services
            {
                public class ScanMeAttribute : System.Attribute { }
                public interface IFoo { }
                [ScanMe] public class Foo : IFoo { }
            }
            namespace Elsewhere
            {
                public interface IBaz { }
                public class Baz : IBaz { }
                public class Consumer(App.Services.IFoo foo, IBaz baz) { }
            }
            """;

        var report = await AnalyzeAsync(
            Wire($"s => s.FromCallingAssembly().AddClasses({filter}).AsImplementedInterfaces()") + types);

        var missing = Assert.Single(report.Missing);
        Assert.Equal("IBaz", missing.Interface);
        Assert.Equal("resolved", Assert.Single(report.Scans).Status);
    }

    [Theory]
    [InlineData("AsSelf()", "Foo", true)]
    [InlineData("AsSelf()", "IFoo", false)]
    [InlineData("AsSelfWithInterfaces()", "Foo", true)]
    [InlineData("AsSelfWithInterfaces()", "IFoo", true)]
    [InlineData("AsMatchingInterface()", "IFoo", true)]
    [InlineData("AsMatchingInterface()", "IUnrelated", false)]
    [InlineData("As<App.Services.IUnrelated>()", "IUnrelated", true)]
    [InlineData("As<App.Services.IUnrelated>()", "IFoo", false)]
    [InlineData("AsImplementedInterfaces()", "IUnrelated", true)]
    public async Task CheckCompleteness_ServiceMapping_RegistersExpectedServiceTypes(
        string mapping, string service, bool registered)
    {
        const string types = """
            namespace App.Services
            {
                public interface IFoo { }
                public interface IUnrelated { }
                public class Foo : IFoo, IUnrelated { }
            }
            public class Consumer(App.Services.Foo self, App.Services.IFoo foo, App.Services.IUnrelated other) { }
            """;

        var report = await AnalyzeAsync(
            Wire($"s => s.FromCallingAssembly().AddClasses(c => c.InNamespaces(\"App.Services\")).{mapping}") + types);

        Assert.Equal(!registered, report.Missing.Any(m => m.Interface == service));
    }

    [Theory]
    [InlineData("WithSingletonLifetime()", "Singleton")]
    [InlineData("WithScopedLifetime()", "Scoped")]
    [InlineData("WithTransientLifetime()", "Transient")]
    [InlineData("WithLifetime(ServiceLifetime.Scoped)", "Scoped")]
    [InlineData("", "Transient")]
    public async Task CheckCompleteness_ScanLifetime_IsRecorded(string lifetimeCall, string expected)
    {
        var chain = "s => s.FromCallingAssembly().AddClasses(c => c.InNamespaces(\"App.Services\")).AsImplementedInterfaces()"
                    + (lifetimeCall.Length == 0 ? "" : "." + lifetimeCall);

        var report = await AnalyzeAsync(Wire(chain) + FooAndConsumer);

        Assert.Equal(expected, Assert.Single(report.Registered, r => r.Interface == "IFoo").Lifetime);
    }

    [Fact]
    public async Task CheckCompleteness_SingletonScanConsumingScoped_ReportsCaptive()
    {
        const string app = """
            using Microsoft.Extensions.DependencyInjection;

            namespace App.Caching
            {
                public interface ICache { }
                public class Cache(App.Data.IRepo repo) : ICache { }
            }
            namespace App.Data
            {
                public interface IRepo { }
                public class Repo : IRepo { }
            }

            public static class DependencyInjection
            {
                public static void Wire(IServiceCollection services)
                {
                    services.AddScoped<App.Data.IRepo, App.Data.Repo>();
                    services.Scan(s => s.FromCallingAssembly()
                        .AddClasses(c => c.InNamespaceOf<App.Caching.Cache>())
                        .AsSelfWithInterfaces()
                        .WithSingletonLifetime());
                }
            }
            """;

        var report = await AnalyzeAsync(app);

        var captive = Assert.Single(report.Captive);
        Assert.Equal("Cache", captive.Consumer);
        Assert.Equal("Singleton", captive.ConsumerLifetime);
        Assert.Equal("IRepo", captive.Dependency);
        Assert.Equal("Scoped", captive.Lifetime);
    }

    [Fact]
    public async Task CheckCompleteness_WhereLambda_IsPartialAndFlagsPlausibleMissing()
    {
        const string types = """
            namespace App.Services
            {
                public interface IFoo { }
                public class Foo : IFoo { }
                public interface INeverImplemented { }
                public class FooConsumer(IFoo foo, INeverImplemented never) { }
            }
            """;

        var report = await AnalyzeAsync(
            Wire("s => s.FromCallingAssembly().AddClasses(c => c.Where(t => t.Name.EndsWith(\"Foo\"))).AsImplementedInterfaces()") + types);

        var scan = Assert.Single(report.Scans);
        Assert.Equal("partial", scan.Status);
        Assert.Contains(scan.Reasons, r => r.Contains("Where", StringComparison.Ordinal));

        var foo = Assert.Single(report.Missing, m => m.Interface == "IFoo");
        Assert.True(foo.PossiblyRegisteredByScan);
        Assert.Contains(foo.CandidateScans!, c => c.Line == scan.Line);

        var never = Assert.Single(report.Missing, m => m.Interface == "INeverImplemented");
        Assert.Null(never.PossiblyRegisteredByScan);
        Assert.Contains("partial", report.Note);
    }

    [Fact]
    public async Task CheckCompleteness_MultipleSelectionsInBlockBody_ResolvesEach()
    {
        const string types = """
            namespace App.A { public interface IA { } public class A : IA { } }
            namespace App.B { public interface IB { } public class B : IB { } }
            public class Consumer(App.A.IA a, App.B.B b) { }
            """;

        var report = await AnalyzeAsync(Wire("""
            s =>
                    {
                        s.FromCallingAssembly()
                            .AddClasses(c => c.InNamespaces("App.A")).AsImplementedInterfaces().WithScopedLifetime()
                            .AddClasses(c => c.InExactNamespaces("App.B")).AsSelf().WithSingletonLifetime();
                    }
            """) + types);

        Assert.Empty(report.Missing);
        Assert.Equal("resolved", Assert.Single(report.Scans).Status);
        Assert.Contains(report.Registered, r => r.Interface == "IA" && r.Lifetime == "Scoped");
        Assert.Contains(report.Registered, r => r.Interface is null && r.Implementation == "B" && r.Lifetime == "Singleton");
    }

    [Fact]
    public async Task CheckCompleteness_UsingRegistrationStrategy_IsPartialButCounted()
    {
        var report = await AnalyzeAsync(
            Wire("s => s.FromCallingAssembly().AddClasses().UsingRegistrationStrategy(Scrutor.RegistrationStrategy.Skip).AsImplementedInterfaces()")
            + FooAndConsumer);

        var scan = Assert.Single(report.Scans);
        Assert.Equal("partial", scan.Status);
        Assert.Contains(scan.Reasons, r => r.Contains("UsingRegistrationStrategy", StringComparison.Ordinal));
        Assert.Empty(report.Missing);
    }

    [Fact]
    public async Task CheckCompleteness_NoScrutor_OutputShapeUnchanged()
    {
        const string source = """
            namespace Microsoft.Extensions.DependencyInjection
            {
                public interface IServiceCollection { }
                public static class Ext
                {
                    public static IServiceCollection AddScoped<TService, TImpl>(this IServiceCollection s) where TImpl : TService => s;
                }
            }
            public interface IFoo { }
            public interface IMissing { }
            public class Foo : IFoo { }
            public class Consumer(IFoo foo, IMissing missing) { }
            public static class Wiring
            {
                public static void Wire(Microsoft.Extensions.DependencyInjection.IServiceCollection services) =>
                    Microsoft.Extensions.DependencyInjection.Ext.AddScoped<IFoo, Foo>(services);
            }
            """;

        using var workspace = new AdhocWorkspace();
        var project = workspace.AddProject("Demo", LanguageNames.CSharp)
            .AddMetadataReference(MetadataReference.CreateFromFile(typeof(object).Assembly.Location));
        var document = project.AddDocument("Wiring.cs", source);

        var report = await DiAnalyzer.CheckCompletenessAsync(document.Project.Solution, CancellationToken.None);

        Assert.Null(report.Note);
        Assert.Empty(report.Scans);
        Assert.Equal("IFoo", Assert.Single(report.Registered).Interface);
        var json = System.Text.Json.JsonSerializer.Serialize(Assert.Single(report.Missing));
        Assert.Equal("""{"interface":"IMissing","consumedBy":[{"type":"Consumer","file":"Wiring.cs","line":12}]}""", json);
    }

    [Fact]
    public async Task CheckCompleteness_FromTypeSource_RegistersOnlyThatType()
    {
        const string types = """
            public interface IA { }
            public interface IB { }
            public class A : IA { }
            public class B : IB { }
            public class Consumer(IA a, IB b) { }
            """;

        var report = await AnalyzeAsync(Wire("s => s.FromType<A>().AsImplementedInterfaces()") + types);

        Assert.Equal("IB", Assert.Single(report.Missing).Interface);
        Assert.Equal("resolved", Assert.Single(report.Scans).Status);
    }

    [Fact]
    public async Task CheckCompleteness_WithAttributePredicate_IsPartial()
    {
        var report = await AnalyzeAsync(
            Wire("s => s.FromAssemblyOf<App.Services.Foo>().AddClasses(c => c.WithAttribute<System.ObsoleteAttribute>(a => a.IsError)).AsImplementedInterfaces()")
            + FooAndConsumer);

        Assert.Equal("partial", Assert.Single(report.Scans).Status);
        Assert.True(Assert.Single(report.Missing).PossiblyRegisteredByScan);
    }

    [Theory]
    [InlineData("System.Collections.Generic.IEnumerable<IUnregistered>")]
    [InlineData("System.IServiceProvider")]
    [InlineData("Microsoft.Extensions.DependencyInjection.IServiceScopeFactory")]
    [InlineData("Microsoft.Extensions.Logging.ILogger<Consumer>")]
    [InlineData("Microsoft.Extensions.Options.IOptions<Settings>")]
    [InlineData("Microsoft.Extensions.Options.IOptionsSnapshot<Settings>")]
    [InlineData("Microsoft.Extensions.Options.IOptionsMonitor<Settings>")]
    [InlineData("Microsoft.Extensions.Configuration.IConfiguration")]
    [InlineData("Microsoft.Extensions.Hosting.IHostEnvironment")]
    [InlineData("Microsoft.AspNetCore.Hosting.IWebHostEnvironment")]
    public async Task CheckCompleteness_HostProvidedType_IsNotMissing(string parameterType)
    {
        var source = $$"""
            namespace Microsoft.Extensions.DependencyInjection { public interface IServiceScopeFactory { } }
            namespace Microsoft.Extensions.Logging { public interface ILogger<T> { } }
            namespace Microsoft.Extensions.Options
            {
                public interface IOptions<T> { }
                public interface IOptionsSnapshot<T> { }
                public interface IOptionsMonitor<T> { }
            }
            namespace Microsoft.Extensions.Configuration { public interface IConfiguration { } }
            namespace Microsoft.Extensions.Hosting { public interface IHostEnvironment { } }
            namespace Microsoft.AspNetCore.Hosting { public interface IWebHostEnvironment { } }
            namespace System.Net.Http { public interface IHttpClientFactory { } }
            public class Settings { }
            public interface IUnregistered { }
            public class Consumer({{parameterType}} dependency) { }
            """;

        var report = await AnalyzeAsync(source);

        Assert.Empty(report.Missing);
    }

    [Theory]
    [InlineData("AddDbContext", "DbContextOptions<AppDb>")]
    [InlineData("AddDbContextPool", "DbContextOptions<AppDb>")]
    [InlineData("AddDbContextFactory", "DbContextOptions<AppDb>")]
    [InlineData("AddDbContext", "DbContextOptions")]
    [InlineData("AddDbContextFactory", "IDbContextFactory<AppDb>")]
    public async Task CheckCompleteness_DbContextRegistration_ProvidesOptions(string method, string parameterType)
    {
        var source = $$"""
            using Microsoft.EntityFrameworkCore;
            using Microsoft.Extensions.DependencyInjection;

            namespace Microsoft.EntityFrameworkCore
            {
                public class DbContextOptions { }
                public class DbContextOptions<TContext> : DbContextOptions where TContext : DbContext { }
                public class DbContextOptionsBuilder { }
                public interface IDbContextFactory<TContext> where TContext : DbContext { }
                public class DbContext
                {
                    public DbContext(DbContextOptions options) { }
                }
            }

            namespace Microsoft.Extensions.DependencyInjection
            {
                public static class EntityFrameworkServiceCollectionExtensions
                {
                    public static IServiceCollection {{method}}<TContext>(this IServiceCollection services, System.Action<DbContextOptionsBuilder>? options = null)
                        where TContext : DbContext => services;
                }
            }

            public sealed class AppDb(DbContextOptions<AppDb> options) : DbContext(options) { }
            public sealed class Consumer({{parameterType}} dependency) { }

            public static class Wiring
            {
                public static void Wire(IServiceCollection services) => services.{{method}}<AppDb>();
            }
            """;

        var report = await AnalyzeAsync(source);

        Assert.Empty(report.Missing);
    }

    private const string HttpClientStubs = """
        using Microsoft.Extensions.DependencyInjection;

        namespace System.Net.Http { public interface IHttpClientFactory { } }

        namespace Microsoft.Extensions.DependencyInjection
        {
            public static class HttpClientFactoryServiceCollectionExtensions
            {
                public static IServiceCollection AddHttpClient(this IServiceCollection services) => services;
                public static IServiceCollection AddHttpClient(this IServiceCollection services, string name) => services;
                public static IServiceCollection AddHttpClient<TClient>(this IServiceCollection services) where TClient : class => services;
            }
        }

        public sealed class GitHubClient { }
        """;

    [Theory]
    [InlineData("System.TimeProvider")]
    [InlineData("System.Net.Http.IHttpClientFactory")]
    public async Task CheckCompleteness_TypeTheHostDoesNotRegister_IsMissing(string parameterType)
    {
        var report = await AnalyzeAsync(HttpClientStubs + $$"""
            public sealed class Consumer({{parameterType}} dependency) { }
            """);

        Assert.Single(report.Missing);
    }

    [Theory]
    [InlineData("services.AddHttpClient()")]
    [InlineData("services.AddHttpClient(\"github\")")]
    [InlineData("services.AddHttpClient<GitHubClient>()")]
    public async Task CheckCompleteness_AddHttpClient_ProvidesFactory(string call)
    {
        var report = await AnalyzeAsync(HttpClientStubs + $$"""
            public sealed class Consumer(System.Net.Http.IHttpClientFactory factory) { }

            public static class Wiring
            {
                public static void Wire(IServiceCollection services) => {{call}};
            }
            """);

        Assert.Empty(report.Missing);
    }

    [Fact]
    public async Task CheckCompleteness_TypedHttpClient_RegisteredAsTransient()
    {
        var report = await AnalyzeAsync(HttpClientStubs + """
            public static class Wiring
            {
                public static void Wire(IServiceCollection services) => services.AddHttpClient<GitHubClient>();
            }
            """);

        var typed = Assert.Single(report.Registered, r => r.Implementation == "GitHubClient");
        Assert.Equal("Transient", typed.Lifetime);
    }

    [Fact]
    public async Task CheckCompleteness_SmokeSolution_ReportsOnlyIntendedDefects()
    {
        if (_workspace is null || Path.GetFileName(SolutionPath) != "SmokeSolution.slnx")
            return;

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var report = await DiAnalyzer.CheckCompletenessAsync(solution, CancellationToken.None);

        var scan = Assert.Single(report.Scans);
        Assert.Equal("resolved", scan.Status);
        Assert.EndsWith("Smoke.Infrastructure/DependencyInjection.cs", scan.File);
        Assert.Equal(16, scan.Line);
        Assert.Equal(
            ["AuditHandler", "NotifyHandler"],
            report.Registered.Where(r => r.Interface == "IOrderHandler").Select(r => r.Implementation).Order());
        Assert.All(report.Registered.Where(r => r.Interface == "IOrderHandler"), r => Assert.Equal("Scoped", r.Lifetime));

        var missing = Assert.Single(report.Missing);
        Assert.Equal("IPaymentGateway", missing.Interface);
        Assert.Equal("OrderService", Assert.Single(missing.ConsumedBy).Type);
        Assert.Null(missing.PossiblyRegisteredByScan);

        var captive = Assert.Single(report.Captive);
        Assert.Equal("OrderCache", captive.Consumer);
        Assert.Equal("Singleton", captive.ConsumerLifetime);
        Assert.Equal("IOrderRepository", captive.Dependency);
        Assert.Equal("Scoped", captive.Lifetime);
    }
}
