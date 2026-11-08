using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;
using Xunit;

namespace DotnetPilot.Mcp.Roslyn.Tests;

public class FindDeadCodeToolTests
{
    private const string LibrarySource = """
        namespace Lib;

        internal class Orphan { }

        public class Worker
        {
            private void NeverCalled() { }
            public void Run() { }
        }

        public static class Registration
        {
            public static int AddLib(this string s) => s.Length;
        }
        """;

    private const string AppSource = """
        using Lib;

        namespace App;

        internal class Consumer
        {
            public int Go() => "x".AddLib();
            public void Use() => new Lib.Worker().Run();
        }
        """;

    private static Solution BuildSolution()
    {
        var workspace = new AdhocWorkspace(MefHostServices.DefaultHost);
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!)
            .Split(Path.PathSeparator)
            .Select(p => (MetadataReference)MetadataReference.CreateFromFile(p))
            .ToList();

        var libId = ProjectId.CreateNewId();
        var appId = ProjectId.CreateNewId();
        var options = new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary);

        var solution = workspace.AddSolution(SolutionInfo.Create(SolutionId.CreateNewId(), VersionStamp.Create(), Path.GetFullPath("sln/Test.sln")))
            .AddProject(ProjectInfo.Create(libId, VersionStamp.Create(), "Lib", "Lib", LanguageNames.CSharp,
                compilationOptions: options, metadataReferences: refs))
            .AddDocument(DocumentId.CreateNewId(libId), "Lib.cs", SourceText.From(LibrarySource), filePath: Path.GetFullPath("sln/Lib.cs"))
            .AddProject(ProjectInfo.Create(appId, VersionStamp.Create(), "App", "App", LanguageNames.CSharp,
                compilationOptions: options, metadataReferences: refs))
            .AddProjectReference(appId, new ProjectReference(libId))
            .AddDocument(DocumentId.CreateNewId(appId), "App.cs", SourceText.From(AppSource), filePath: Path.GetFullPath("sln/App.cs"));

        return solution;
    }

    private static async Task<List<JsonElement>> RunAsync()
    {
        var json = await FindDeadCodeTool.AnalyzeAsync(BuildSolution(), "", CancellationToken.None);
        return JsonDocument.Parse(json).RootElement.GetProperty("items").EnumerateArray().ToList();
    }

    [Fact]
    public async Task Analyze_TypeVisibleThroughProjectReference_ReportedOnce()
    {
        var items = await RunAsync();

        Assert.Single(items, i => i.GetProperty("name").GetString() == "Orphan");
    }

    [Fact]
    public async Task Analyze_DeadType_AttributedToDeclaringProject()
    {
        var items = await RunAsync();

        var orphan = Assert.Single(items, i => i.GetProperty("name").GetString() == "Orphan");
        Assert.Equal("Lib", orphan.GetProperty("project").GetString());
    }

    [Fact]
    public async Task Analyze_StaticClassWithCalledExtensionMethod_NotReported()
    {
        var items = await RunAsync();

        Assert.DoesNotContain(items, i => i.GetProperty("name").GetString() == "Registration");
    }

    [Fact]
    public async Task Analyze_UnusedPrivateMethod_ReportedWithHighConfidence()
    {
        var items = await RunAsync();

        var method = Assert.Single(items, i => i.GetProperty("name").GetString()!.Contains("NeverCalled"));
        Assert.Equal("high", method.GetProperty("confidence").GetString());
    }

    [Fact]
    public async Task Analyze_InspectedSymbols_CountsDistinctSourceSymbols()
    {
        var json = await FindDeadCodeTool.AnalyzeAsync(BuildSolution(), "", CancellationToken.None);
        var inspected = JsonDocument.Parse(json).RootElement.GetProperty("inspectedSymbols").GetInt32();

        // Types: Orphan, Worker, Registration, Consumer; members: Worker.NeverCalled (public members of public types are skipped)
        Assert.Equal(5, inspected);
    }
}
