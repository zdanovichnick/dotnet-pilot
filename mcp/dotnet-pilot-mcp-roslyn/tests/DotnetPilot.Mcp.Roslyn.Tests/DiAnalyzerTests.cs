using DotnetPilot.Mcp.Roslyn.Tools.Dotnet;
using DotnetPilot.Mcp.Roslyn.Workspace;
using System.Reflection;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
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
}
