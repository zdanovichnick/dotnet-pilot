using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.Build.Locator;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol;

// MSBuildLocator must be called before any Roslyn workspace types are loaded.
// This ensures the correct MSBuild assemblies are resolved at runtime.
if (!MSBuildLocator.IsRegistered)
{
    var instances = MSBuildLocator.QueryVisualStudioInstances().ToList();
    if (instances.Count == 0)
    {
        Console.Error.WriteLine("ERROR: No MSBuild instance found. Install the .NET SDK or Visual Studio Build Tools.");
        return 1;
    }

    MSBuildLocator.RegisterInstance(instances.OrderByDescending(i => i.Version).First());
}

// Handle subcommands before starting the MCP host
if (args.Length > 0)
{
    switch (args[0].ToLowerInvariant())
    {
        case "version":
            var version = typeof(WorkspaceCache).Assembly.GetName().Version;
            Console.WriteLine($"dnp-roslyn {version?.Major}.{version?.Minor}.{version?.Build}");
            return 0;

        case "doctor":
            return await RunDoctor(args);
    }
}

// Parse --solution / --verbose from args
string? solutionPath = null;
var verbose = false;

for (var i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--solution" when i + 1 < args.Length:
            solutionPath = args[++i];
            break;
        case "--verbose":
            verbose = true;
            break;
    }
}

solutionPath ??= FindSolution(Directory.GetCurrentDirectory());

if (solutionPath is null)
{
    Console.Error.WriteLine("ERROR: No .sln or .slnx file found. Use --solution <path> or run from a directory containing a solution file.");
    return 1;
}

solutionPath = Path.GetFullPath(solutionPath);
if (!File.Exists(solutionPath))
{
    Console.Error.WriteLine($"ERROR: Solution file not found: {solutionPath}");
    return 1;
}

var builder = Host.CreateApplicationBuilder(args);

builder.Logging.ClearProviders();
if (verbose)
    builder.Logging.AddConsole(opts => opts.LogToStandardErrorThreshold = LogLevel.Trace)
        .SetMinimumLevel(LogLevel.Debug);
else
    builder.Logging.SetMinimumLevel(LogLevel.Warning);

builder.Services.AddSingleton(new WorkspaceOptions(solutionPath));
builder.Services.AddSingleton<WorkspaceCache>();

builder.Services
    .AddMcpServer()
    .WithStdioServerTransport()
    .WithToolsFromAssembly();

var app = builder.Build();

// Eagerly start workspace loading in the background
_ = app.Services.GetRequiredService<WorkspaceCache>().GetSolutionAsync(CancellationToken.None);

await app.RunAsync();
return 0;

static string? FindSolution(string startDir)
{
    var dir = new DirectoryInfo(startDir);
    while (dir is not null)
    {
        var slnx = dir.GetFiles("*.slnx").FirstOrDefault();
        if (slnx is not null) return slnx.FullName;

        var sln = dir.GetFiles("*.sln").FirstOrDefault();
        if (sln is not null) return sln.FullName;

        dir = dir.Parent;
    }
    return null;
}

static async Task<int> RunDoctor(string[] args)
{
    string? solutionPath = null;
    for (var i = 1; i < args.Length; i++)
    {
        if (args[i] == "--solution" && i + 1 < args.Length)
            solutionPath = args[++i];
    }

    solutionPath ??= FindSolution(Directory.GetCurrentDirectory());

    Console.WriteLine("dnp-roslyn doctor");
    Console.WriteLine("=================");

    var msbuild = MSBuildLocator.QueryVisualStudioInstances().OrderByDescending(i => i.Version).FirstOrDefault();
    Console.WriteLine($"MSBuild:     {msbuild?.Name} {msbuild?.Version} ({msbuild?.MSBuildPath})");
    Console.WriteLine($".NET SDK:    {Environment.Version}");

    if (solutionPath is null)
    {
        Console.WriteLine("Solution:    NOT FOUND");
        Console.WriteLine("\nFix: run from a directory with a .sln/.slnx file, or pass --solution <path>");
        return 1;
    }

    Console.WriteLine($"Solution:    {solutionPath}");

    try
    {
        var cache = new WorkspaceCache(new WorkspaceOptions(Path.GetFullPath(solutionPath)));
        var solution = await cache.GetSolutionAsync(CancellationToken.None);
        Console.WriteLine($"Projects:    {solution.ProjectIds.Count}");
        foreach (var project in solution.Projects.OrderBy(p => p.Name))
        {
            var docCount = project.DocumentIds.Count;
            Console.WriteLine($"  - {project.Name} ({docCount} files)");
        }
        Console.WriteLine("\nAll checks passed.");
        return 0;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"\nFailed to load solution: {ex.Message}");
        if (ex.InnerException is not null)
            Console.WriteLine($"  Inner: {ex.InnerException.Message}");
        return 1;
    }
}
