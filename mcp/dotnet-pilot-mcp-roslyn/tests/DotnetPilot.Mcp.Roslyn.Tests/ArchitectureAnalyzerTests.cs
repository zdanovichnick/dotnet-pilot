using DotnetPilot.Mcp.Roslyn.Tools.Dotnet;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.Build.Locator;
using Xunit;

namespace DotnetPilot.Mcp.Roslyn.Tests;

public class ArchitectureAnalyzerTests : IAsyncLifetime
{
    private static readonly string? SolutionPath =
        Environment.GetEnvironmentVariable("DNP_TEST_SOLUTION");

    private WorkspaceCache? _workspace;

    static ArchitectureAnalyzerTests()
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
    public async Task Analyze_ProducesReport()
    {
        if (_workspace is null) return;

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var report = ArchitectureAnalyzer.Analyze(solution);

        Assert.NotNull(report);
        Assert.Equal("clean", report.Style);
        Assert.NotEmpty(report.Layers);
        Assert.All(report.Layers, layer =>
        {
            Assert.NotNull(layer.Name);
            Assert.NotNull(layer.Layer);
        });
    }

    [Fact]
    public void ClassifyLayer_CorrectlyClassifies()
    {
        Assert.Equal("Domain", ArchitectureAnalyzer.ClassifyLayer("MyApp.Domain"));
        Assert.Equal("Application", ArchitectureAnalyzer.ClassifyLayer("MyApp.Application"));
        Assert.Equal("Infrastructure", ArchitectureAnalyzer.ClassifyLayer("MyApp.Infrastructure"));
        Assert.Equal("Api", ArchitectureAnalyzer.ClassifyLayer("MyApp.Api"));
        Assert.Equal("Tests", ArchitectureAnalyzer.ClassifyLayer("MyApp.Tests"));
        Assert.Equal("Persistence", ArchitectureAnalyzer.ClassifyLayer("MyApp.Data"));
        Assert.Equal("Web", ArchitectureAnalyzer.ClassifyLayer("MyApp.Blazor"));
        Assert.Equal("Domain", ArchitectureAnalyzer.ClassifyLayer("MyApp.Shared"));
        Assert.Equal("Domain", ArchitectureAnalyzer.ClassifyLayer("MyApp.Contracts"));
        Assert.Equal("Domain", ArchitectureAnalyzer.ClassifyLayer("MyApp.BuildingBlocks"));
        Assert.Equal("Infrastructure", ArchitectureAnalyzer.ClassifyLayer("Gateway"));
        Assert.Equal("Api", ArchitectureAnalyzer.ClassifyLayer("Identity.Api"));
    }
}
