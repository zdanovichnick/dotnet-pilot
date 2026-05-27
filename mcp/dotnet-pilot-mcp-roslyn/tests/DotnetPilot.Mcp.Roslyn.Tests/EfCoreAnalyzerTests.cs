using DotnetPilot.Mcp.Roslyn.Tools.Dotnet;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.Build.Locator;
using Xunit;

namespace DotnetPilot.Mcp.Roslyn.Tests;

public class EfCoreAnalyzerTests : IAsyncLifetime
{
    private static readonly string? SolutionPath =
        Environment.GetEnvironmentVariable("DNP_TEST_SOLUTION");

    private WorkspaceCache? _workspace;

    static EfCoreAnalyzerTests()
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
    public async Task Analyze_FindsDbContexts()
    {
        if (_workspace is null) return;

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var report = await EfCoreAnalyzer.AnalyzeAsync(solution, CancellationToken.None);

        Assert.NotNull(report);
        Assert.NotEmpty(report.Contexts);
        Assert.All(report.Contexts, ctx =>
        {
            Assert.NotNull(ctx.Name);
            Assert.Contains("DbContext", ctx.Name);
            Assert.NotEmpty(ctx.Entities);
            Assert.NotNull(ctx.Project);
            Assert.NotNull(ctx.File);
        });
    }

    [Fact]
    public async Task Analyze_EntitiesHaveProperties()
    {
        if (_workspace is null) return;

        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        var report = await EfCoreAnalyzer.AnalyzeAsync(solution, CancellationToken.None);

        var allEntities = report.Contexts.SelectMany(c => c.Entities).ToList();
        Assert.NotEmpty(allEntities);

        var entitiesWithProps = allEntities.Where(e => e.Properties.Count > 0).ToList();
        Assert.NotEmpty(entitiesWithProps);

        Assert.All(entitiesWithProps, entity =>
        {
            Assert.All(entity.Properties, prop =>
            {
                Assert.NotNull(prop.Name);
                Assert.NotNull(prop.Type);
            });
        });
    }
}
