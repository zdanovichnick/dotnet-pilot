using System.Diagnostics;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using ModelContextProtocol;
using Xunit;

namespace DotnetPilot.Mcp.Roslyn.Tests;

public class WorkspaceRefreshTests : IAsyncLifetime
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "dnp-refresh-" + Guid.NewGuid().ToString("N"));
    private string ProjectDir => Path.Combine(_root, "src", "Sample");
    private string ProjectPath => Path.Combine(ProjectDir, "Sample.csproj");
    private string SolutionPath => Path.Combine(_root, "Sample.slnx");

    private WorkspaceCache _workspace = null!;

    static WorkspaceRefreshTests()
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
        Directory.CreateDirectory(ProjectDir);
        // Pins the generated solution to the SDK running the tests, independent of any global.json above %TEMP%.
        File.WriteAllText(Path.Combine(_root, "global.json"),
            $$"""{ "sdk": { "version": "{{SdkVersion()}}", "rollForward": "latestFeature" } }""");
        File.WriteAllText(SolutionPath,
            """
            <Solution>
              <Project Path="src/Sample/Sample.csproj" />
            </Solution>
            """);
        WriteProject(string.Empty);
        File.WriteAllText(Path.Combine(ProjectDir, "Existing.cs"),
            "namespace Sample;\npublic class Existing { public int Value => 1; }\n");
        File.WriteAllText(Path.Combine(ProjectDir, "Doomed.cs"),
            "namespace Sample;\npublic class Doomed { }\n");

        await RunDotnetAsync("restore", ProjectPath);

        _workspace = new WorkspaceCache(new WorkspaceOptions(SolutionPath));
        await _workspace.GetSolutionAsync(CancellationToken.None);
    }

    public Task DisposeAsync()
    {
        _workspace.Dispose();
        try { Directory.Delete(_root, recursive: true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        return Task.CompletedTask;
    }

    [Fact]
    public async Task GetSolutionAsync_WhenNothingChanged_ReturnsSameSnapshot()
    {
        var first = await _workspace.GetSolutionAsync(CancellationToken.None);
        var second = await _workspace.GetSolutionAsync(CancellationToken.None);

        Assert.Same(first, second);
    }

    [Fact]
    public async Task GetSolutionAsync_AfterDocumentEdited_ReturnsNewTextWithoutReload()
    {
        var before = await WarmAsync();
        var path = Path.Combine(ProjectDir, "Existing.cs");

        File.WriteAllText(path, "namespace Sample;\npublic class Existing { public int Renamed => 2; }\n");
        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        var text = await SingleDocument(after, path).GetTextAsync();
        Assert.Contains("Renamed", text.ToString());
        Assert.Equal(before.Id, after.Id);
        var type = (await after.Projects.Single().GetCompilationAsync())!.GetTypeByMetadataName("Sample.Existing");
        Assert.NotEmpty(type!.GetMembers("Renamed"));
    }

    [Fact]
    public async Task GetSolutionAsync_AfterFileAdded_IncludesNewDocumentButNotBinOrObj()
    {
        var before = await _workspace.GetSolutionAsync(CancellationToken.None);
        var added = Path.Combine(ProjectDir, "Features", "Added.cs");
        Directory.CreateDirectory(Path.GetDirectoryName(added)!);
        File.WriteAllText(added, "namespace Sample.Features;\npublic class Added { }\n");
        File.WriteAllText(Path.Combine(ProjectDir, "obj", "Stray.cs"), "public class StrayObj { }\n");
        Directory.CreateDirectory(Path.Combine(ProjectDir, "bin"));
        File.WriteAllText(Path.Combine(ProjectDir, "bin", "Stray.cs"), "public class StrayBin { }\n");

        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        var document = SingleDocument(after, added);
        Assert.Equal(["Features"], document.Folders);
        Assert.Equal(before.Id, after.Id);
        var compilation = (await after.Projects.Single().GetCompilationAsync())!;
        Assert.NotNull(compilation.GetTypeByMetadataName("Sample.Features.Added"));
        Assert.Null(compilation.GetTypeByMetadataName("StrayObj"));
        Assert.Null(compilation.GetTypeByMetadataName("StrayBin"));
    }

    [Fact]
    public async Task GetSolutionAsync_AfterFileDeleted_RemovesDocument()
    {
        var path = Path.Combine(ProjectDir, "Doomed.cs");

        File.Delete(path);
        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        Assert.Empty(after.GetDocumentIdsWithFilePath(path));
        var compilation = (await after.Projects.Single().GetCompilationAsync())!;
        Assert.Null(compilation.GetTypeByMetadataName("Sample.Doomed"));
    }

    [Fact]
    public async Task GetSolutionAsync_AfterProjectFileChanged_ReloadsSolution()
    {
        var before = await _workspace.GetSolutionAsync(CancellationToken.None);

        WriteProject("<AssemblyName>Renamed.Sample</AssemblyName>");
        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        Assert.NotEqual(before.Id, after.Id);
        Assert.Equal("Renamed.Sample", after.Projects.Single().AssemblyName);
    }

    [Fact]
    public async Task GetSolutionAsync_AfterDirectoryBuildPropsCreated_ReloadsSolution()
    {
        var before = await _workspace.GetSolutionAsync(CancellationToken.None);

        File.WriteAllText(Path.Combine(_root, "Directory.Build.props"),
            "<Project><PropertyGroup><AssemblyName>FromProps</AssemblyName></PropertyGroup></Project>");
        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        Assert.NotEqual(before.Id, after.Id);
        Assert.Equal("FromProps", after.Projects.Single().AssemblyName);
    }

    [Fact]
    public async Task GetSolutionAsync_FileAddedToProjectWithCompileRemove_HonoursMsBuildEvaluation()
    {
        WriteProject(string.Empty, """<ItemGroup><Compile Remove="Excluded/**" /></ItemGroup>""");
        await _workspace.GetSolutionAsync(CancellationToken.None);

        var excluded = Path.Combine(ProjectDir, "Excluded", "Hidden.cs");
        var included = Path.Combine(ProjectDir, "Included.cs");
        Directory.CreateDirectory(Path.GetDirectoryName(excluded)!);
        File.WriteAllText(excluded, "namespace Sample;\npublic class Hidden { }\n");
        File.WriteAllText(included, "namespace Sample;\npublic class Included { }\n");
        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        Assert.Empty(after.GetDocumentIdsWithFilePath(excluded));
        Assert.Single(after.GetDocumentIdsWithFilePath(included));
    }

    [Fact]
    public async Task GetSolutionAsync_ConcurrentCallsAfterEdit_AllObserveTheSameUpdatedSnapshot()
    {
        await WarmAsync();
        var path = Path.Combine(ProjectDir, "Existing.cs");
        File.WriteAllText(path, "namespace Sample;\npublic class Existing { public int Concurrent => 3; }\n");

        var results = await Task.WhenAll(Enumerable.Range(0, 8)
            .Select(_ => Task.Run(() => _workspace.GetSolutionAsync(CancellationToken.None))));

        Assert.All(results, s => Assert.Same(results[0], s));
        var text = await SingleDocument(results[0], path).GetTextAsync();
        Assert.Contains("Concurrent", text.ToString());
    }

    [Fact]
    public async Task ReloadAsync_Always_LoadsFreshSolution()
    {
        var before = await _workspace.GetSolutionAsync(CancellationToken.None);

        await _workspace.ReloadAsync(null, CancellationToken.None);
        var after = await _workspace.GetSolutionAsync(CancellationToken.None);

        Assert.NotEqual(before.Id, after.Id);
    }

    [Fact]
    public async Task GetSolutionAsync_WhenNoSolutionBound_ThrowsMcpExceptionNamingReloadSolution()
    {
        using var unbound = new WorkspaceCache(new WorkspaceOptions(null));

        var error = await Assert.ThrowsAsync<McpException>(() => unbound.GetSolutionAsync(CancellationToken.None));

        Assert.Contains("reload_solution", error.Message);
        Assert.Contains("solutionPath", error.Message);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ReloadAsync_WithSolutionPath_BindsUnboundCache(bool passDirectory)
    {
        using var unbound = new WorkspaceCache(new WorkspaceOptions(null));

        var solution = await unbound.ReloadAsync(passDirectory ? ProjectDir : SolutionPath, CancellationToken.None);

        Assert.Equal(Path.GetFullPath(SolutionPath), unbound.SolutionPath);
        Assert.Single(solution.ProjectIds);
        Assert.Same(solution, await unbound.GetSolutionAsync(CancellationToken.None));
    }

    [Fact]
    public async Task ReloadAsync_WithPathWithoutSolution_ThrowsAndKeepsCurrentSolution()
    {
        var missing = Path.Combine(Path.GetPathRoot(_root)!, "dnp-no-solution-" + Guid.NewGuid().ToString("N"), "App.slnx");

        await Assert.ThrowsAsync<McpException>(() => _workspace.ReloadAsync(missing, CancellationToken.None));

        Assert.Equal(SolutionPath, _workspace.SolutionPath);
        Assert.Single((await _workspace.GetSolutionAsync(CancellationToken.None)).ProjectIds);
    }

    // Earlier tool calls have already materialised document text; without this the lazy loader would read disk anyway.
    private async Task<Solution> WarmAsync()
    {
        var solution = await _workspace.GetSolutionAsync(CancellationToken.None);
        foreach (var project in solution.Projects)
            await project.GetCompilationAsync();
        return solution;
    }

    private static Document SingleDocument(Solution solution, string path) =>
        solution.GetDocument(Assert.Single(solution.GetDocumentIdsWithFilePath(path)))!;

    private void WriteProject(string extraProperties, string extraItems = "") =>
        File.WriteAllText(ProjectPath,
            $"""
            <Project Sdk="Microsoft.NET.Sdk">
              <PropertyGroup>
                <TargetFramework>net{Environment.Version.Major}.0</TargetFramework>
                <Nullable>enable</Nullable>
                {extraProperties}
              </PropertyGroup>
              {extraItems}
            </Project>
            """);

    private static string SdkVersion()
    {
        var sdkDir = Path.GetFileName(Path.TrimEndingDirectorySeparator(
            MSBuildLocator.QueryVisualStudioInstances().OrderByDescending(i => i.Version).First().MSBuildPath));
        return sdkDir;
    }

    private static async Task RunDotnetAsync(params string[] args)
    {
        var psi = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var arg in args)
            psi.ArgumentList.Add(arg);

        using var process = Process.Start(psi)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        Assert.True(process.ExitCode == 0, $"dotnet {string.Join(' ', args)} failed:\n{await stdout}\n{await stderr}");
    }
}
