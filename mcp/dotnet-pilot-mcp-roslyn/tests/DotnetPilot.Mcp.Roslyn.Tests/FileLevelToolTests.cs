using DotnetPilot.Mcp.Roslyn.Tools.FileLevel;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.Build.Locator;
using Xunit;

namespace DotnetPilot.Mcp.Roslyn.Tests;

public class FileLevelToolTests : IAsyncLifetime
{
    private static readonly string? SolutionPath =
        Environment.GetEnvironmentVariable("DNP_TEST_SOLUTION");

    private WorkspaceCache? _workspace;
    private string? _firstCsFile;

    static FileLevelToolTests()
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
        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);

        var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";
        foreach (var project in solution.Projects)
        {
            foreach (var doc in project.Documents)
            {
                if (doc.FilePath is not null && doc.FilePath.EndsWith(".cs"))
                {
                    _firstCsFile = Path.GetRelativePath(solutionDir, doc.FilePath).Replace('\\', '/');
                    return;
                }
            }
        }
    }

    public Task DisposeAsync()
    {
        _workspace?.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task GetClassOutline_ReturnsMembers()
    {
        if (_workspace is null || _firstCsFile is null) return;

        var result = await GetClassOutlineTool.Execute(_workspace, _firstCsFile, "", CancellationToken.None);

        Assert.NotNull(result);
        Assert.DoesNotContain("File not found", result);
    }

    [Fact]
    public async Task GetClassOutline_FileNotFound_ReturnsError()
    {
        if (_workspace is null) return;

        var result = await GetClassOutlineTool.Execute(_workspace, "nonexistent/File.cs", "", CancellationToken.None);

        Assert.Contains("File not found", result);
    }

    [Fact]
    public async Task GetMethodBody_MethodNotFound_ReturnsError()
    {
        if (_workspace is null || _firstCsFile is null) return;

        var result = await GetMethodBodyTool.Execute(_workspace, _firstCsFile, "NonExistentMethod", CancellationToken.None);

        Assert.Contains("not found", result);
    }
}
