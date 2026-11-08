using System.Diagnostics;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.CodeAnalysis.Text;
using Microsoft.Extensions.Logging;
using ModelContextProtocol;

namespace DotnetPilot.Mcp.Roslyn.Workspace;

/// <summary>
/// Loads an MSBuildWorkspace + Solution once and keeps it in step with disk. Every
/// <see cref="GetSolutionAsync"/> reconciles the cached solution against a <see cref="DiskSnapshot"/>:
/// edited, added and deleted <c>.cs</c> files are applied incrementally; a change to a project, solution or
/// <c>Directory.*</c>/<c>global.json</c> build input triggers a full reload.
/// </summary>
public sealed class WorkspaceCache : IDisposable
{
    /// <summary>Editors and <c>dotnet add package</c> write build inputs several times in quick succession.</summary>
    private static readonly TimeSpan BuildInputQuietPeriod = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan BuildInputMaxWait = TimeSpan.FromSeconds(2);

    private readonly ILogger<WorkspaceCache> _logger;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private string? _solutionPath;
    private MSBuildWorkspace? _workspace;
    private Solution? _solution;
    private DiskSnapshot? _snapshot;

    public WorkspaceCache(WorkspaceOptions options, ILogger<WorkspaceCache>? logger = null, TimeProvider? timeProvider = null)
    {
        _solutionPath = options.SolutionPath;
        _logger = logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<WorkspaceCache>.Instance;
        _time = timeProvider ?? TimeProvider.System;
    }

    public string? SolutionPath => _solutionPath;

    /// <exception cref="McpException">No solution is bound yet; the message tells the caller how to bind one.</exception>
    public async Task<Solution> GetSolutionAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var path = _solutionPath ?? throw NoSolution();
            if (_solution is null || _snapshot is null)
                return await LoadAsync(path, ct);

            return await RefreshAsync(path, _solution, _snapshot, ct);
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

    /// <summary>
    /// Discards the cached solution and loads it again, regardless of what changed on disk. A
    /// <paramref name="solutionPath"/> (a solution file, or a directory to search upward from) switches to that
    /// solution; the current one stays bound if it cannot be found or loaded.
    /// </summary>
    public async Task<Solution> ReloadAsync(string? solutionPath, CancellationToken ct)
    {
        string? target = null;
        if (solutionPath is not null)
        {
            target = SolutionLocator.Resolve(solutionPath)
                ?? throw new McpException($"No .sln or .slnx file found at or above '{Path.GetFullPath(solutionPath)}'.");
        }

        await _gate.WaitAsync(ct);
        try
        {
            return await LoadAsync(target ?? _solutionPath ?? throw NoSolution(), ct);
        }
        finally
        {
            _gate.Release();
        }
    }

    private static McpException NoSolution() => new(
        $"No solution is loaded: dnp-roslyn started in '{Directory.GetCurrentDirectory()}', which has no .sln or .slnx " +
        "in it or above it. Call reload_solution with solutionPath set to the solution file or its directory.");

    public void Dispose()
    {
        _workspace?.Dispose();
        _gate.Dispose();
    }

    private async Task<Solution> RefreshAsync(string solutionPath, Solution solution, DiskSnapshot snapshot, CancellationToken ct)
    {
        var started = Stopwatch.GetTimestamp();
        var changes = snapshot.Detect(ct);

        if (changes.ReloadTrigger is { } trigger)
        {
            _logger.LogInformation("Build input changed ({Path}); reloading solution", trigger);
            await WaitForQuietAsync(trigger, ct);
            return await LoadAsync(solutionPath, ct);
        }

        var unreadable = new HashSet<string>(DiskSnapshot.PathComparer);
        var updated = solution;

        foreach (var (path, _) in changes.Edited)
        {
            if (TryReadText(path) is not { } text)
            {
                unreadable.Add(path);
                continue;
            }
            foreach (var id in updated.GetDocumentIdsWithFilePath(path))
            {
                if (updated.ContainsDocument(id))
                    updated = updated.WithDocumentText(id, text, PreservationMode.PreserveIdentity);
            }
        }

        foreach (var path in changes.Deleted)
        {
            var ids = updated.GetDocumentIdsWithFilePath(path).Where(updated.ContainsDocument).ToList();
            if (ids.Count > 0)
                updated = updated.RemoveDocuments([.. ids]);
        }

        foreach (var added in changes.Added)
        {
            if (TryReadText(added.Path) is not { } text)
            {
                unreadable.Add(added.Path);
                continue;
            }
            var name = Path.GetFileName(added.Path);
            foreach (var root in added.Owners)
            {
                var relativeDir = Path.GetDirectoryName(Path.GetRelativePath(root.Directory, added.Path)) ?? "";
                var folders = relativeDir.Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar], StringSplitOptions.RemoveEmptyEntries);
                foreach (var projectId in root.ProjectIds)
                {
                    if (updated.ContainsProject(projectId))
                        updated = updated.AddDocument(DocumentId.CreateNewId(projectId, name), name, text, folders, added.Path);
                }
            }
        }

        snapshot.Commit(changes, unreadable);
        _solution = updated;

        if (changes.HasDocumentChanges)
        {
            _logger.LogDebug(
                "Applied disk changes in {ElapsedMs:F1} ms: {Edited} edited, {Added} added, {Deleted} deleted, {Unreadable} deferred",
                Stopwatch.GetElapsedTime(started).TotalMilliseconds,
                changes.Edited.Count, changes.Added.Count, changes.Deleted.Count, unreadable.Count);
        }

        return updated;
    }

    private async Task<Solution> LoadAsync(string solutionPath, CancellationToken ct)
    {
        _logger.LogInformation("Loading solution: {Path}", solutionPath);

        var loadStarted = _time.GetUtcNow();
        var workspace = MSBuildWorkspace.Create();
        workspace.RegisterWorkspaceFailedHandler(e =>
        {
            if (e.Diagnostic.Kind == WorkspaceDiagnosticKind.Failure)
                _logger.LogWarning("Workspace failure: {Message}", e.Diagnostic.Message);
            else
                _logger.LogDebug("Workspace diagnostic: {Message}", e.Diagnostic.Message);
        });

        Solution solution;
        DiskSnapshot snapshot;
        try
        {
            solution = await workspace.OpenSolutionAsync(solutionPath, cancellationToken: ct);
            snapshot = DiskSnapshot.Capture(solution, loadStarted);
        }
        catch
        {
            workspace.Dispose();
            throw;
        }

        _workspace?.Dispose();
        _workspace = workspace;
        _solutionPath = solutionPath;
        _solution = solution;
        _snapshot = snapshot;

        _logger.LogInformation("Solution loaded: {Count} projects", solution.ProjectIds.Count);
        return solution;
    }

    private async Task WaitForQuietAsync(string path, CancellationToken ct)
    {
        var deadline = _time.GetUtcNow() + BuildInputMaxWait;
        while (true)
        {
            var info = new FileInfo(path);
            var lastWrite = info.Exists ? new DateTimeOffset(info.LastWriteTimeUtc) : DateTimeOffset.MinValue;
            var now = _time.GetUtcNow();
            var quietFor = now - lastWrite;
            if (quietFor >= BuildInputQuietPeriod || now >= deadline)
                return;

            var wait = BuildInputQuietPeriod - quietFor;
            if (now + wait > deadline)
                wait = deadline - now;
            await Task.Delay(wait, _time, ct);
        }
    }

    private static SourceText? TryReadText(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            return SourceText.From(stream, encoding: null, checksumAlgorithm: SourceHashAlgorithm.Sha256);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
