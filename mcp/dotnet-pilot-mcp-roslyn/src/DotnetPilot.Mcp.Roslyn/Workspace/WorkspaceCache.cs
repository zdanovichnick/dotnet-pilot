using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.Extensions.Logging;

namespace DotnetPilot.Mcp.Roslyn.Workspace;

/// <summary>
/// Lazily loads and caches an MSBuildWorkspace + Solution for the lifetime of the MCP server process.
/// </summary>
public sealed class WorkspaceCache : IDisposable
{
    private readonly WorkspaceOptions _options;
    private readonly ILogger<WorkspaceCache> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private MSBuildWorkspace? _workspace;
    private Solution? _solution;

    public WorkspaceCache(WorkspaceOptions options, ILogger<WorkspaceCache>? logger = null)
    {
        _options = options;
        _logger = logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<WorkspaceCache>.Instance;
    }

    public async Task<Solution> GetSolutionAsync(CancellationToken ct)
    {
        if (_solution is not null)
            return _solution;

        await _gate.WaitAsync(ct);
        try
        {
            if (_solution is not null)
                return _solution;

            _logger.LogInformation("Loading solution: {Path}", _options.SolutionPath);

            _workspace = MSBuildWorkspace.Create();
            _workspace.RegisterWorkspaceFailedHandler(e =>
            {
                if (e.Diagnostic.Kind == WorkspaceDiagnosticKind.Failure)
                    _logger.LogWarning("Workspace failure: {Message}", e.Diagnostic.Message);
                else
                    _logger.LogDebug("Workspace diagnostic: {Message}", e.Diagnostic.Message);
            });

            _solution = await _workspace.OpenSolutionAsync(_options.SolutionPath, cancellationToken: ct);

            _logger.LogInformation("Solution loaded: {Count} projects", _solution.ProjectIds.Count);

            return _solution;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<Compilation?> GetCompilationAsync(ProjectId projectId, CancellationToken ct)
    {
        var solution = await GetSolutionAsync(ct);
        var project = solution.GetProject(projectId);
        return project is null ? null : await project.GetCompilationAsync(ct);
    }

    public async Task ReloadAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            _solution = null;
            _workspace?.Dispose();
            _workspace = null;
        }
        finally
        {
            _gate.Release();
        }

        await GetSolutionAsync(ct);
    }

    public void Dispose()
    {
        _workspace?.Dispose();
        _gate.Dispose();
    }
}
