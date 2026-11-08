using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;

namespace DotnetPilot.Mcp.Roslyn.Workspace;

/// <summary>
/// The on-disk state a loaded <see cref="Solution"/> was built from: build inputs whose change forces a full
/// reload, the stamp of every source document, and the directories SDK-style projects glob <c>*.cs</c> from.
/// Not thread-safe; <see cref="WorkspaceCache"/> only touches it under its gate.
/// </summary>
internal sealed partial class DiskSnapshot
{
    private static readonly string[] BuildInputNames =
        ["Directory.Build.props", "Directory.Build.targets", "Directory.Packages.props", "global.json"];

    private static readonly EnumerationOptions ListOptions = new()
    {
        RecurseSubdirectories = false,
        IgnoreInaccessible = true,
        AttributesToSkip = 0,
        MatchCasing = MatchCasing.CaseInsensitive,
    };

    public static readonly StringComparer PathComparer =
        OperatingSystem.IsWindows() || OperatingSystem.IsMacOS() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

    private readonly Dictionary<string, FileStamp> _buildInputs;
    private readonly Dictionary<string, TrackedDocument> _documents;
    private readonly IReadOnlyList<GlobRoot> _globRoots;
    private HashSet<string> _globbedFiles;

    private DiskSnapshot(
        Dictionary<string, FileStamp> buildInputs,
        Dictionary<string, TrackedDocument> documents,
        IReadOnlyList<GlobRoot> globRoots,
        HashSet<string> globbedFiles)
    {
        _buildInputs = buildInputs;
        _documents = documents;
        _globRoots = globRoots;
        _globbedFiles = globbedFiles;
    }

    /// <param name="loadStartedUtc">
    /// When the load began. A file written after that may or may not be reflected in <paramref name="solution"/>,
    /// so it is recorded as <see cref="FileStamp.Unsettled"/> (or left out of the glob baseline) and re-examined.
    /// </param>
    public static DiskSnapshot Capture(Solution solution, DateTimeOffset loadStartedUtc)
    {
        var cutoff = loadStartedUtc.UtcTicks;
        FileStamp Settled(FileStamp stamp) => stamp.LastWriteUtcTicks >= cutoff ? FileStamp.Unsettled : stamp;

        var buildInputs = new Dictionary<string, FileStamp>(PathComparer);
        void AddInput(string path) => buildInputs.TryAdd(Path.GetFullPath(path), default);

        if (solution.FilePath is { } solutionPath)
        {
            AddInput(solutionPath);
            AddAncestorInputs(Path.GetDirectoryName(solutionPath), AddInput);
        }

        var documents = new Dictionary<string, TrackedDocument>(PathComparer);
        var roots = new Dictionary<string, (bool Incremental, List<ProjectId> Ids)>(PathComparer);

        foreach (var project in solution.Projects)
        {
            if (project.FilePath is not { } projectPath)
                continue;

            var projectDir = Path.GetDirectoryName(Path.GetFullPath(projectPath))!;
            AddInput(projectPath);
            AddInput(Path.Combine(projectDir, "obj", "project.assets.json"));
            AddAncestorInputs(projectDir, AddInput);

            foreach (var document in project.Documents)
            {
                if (document.FilePath is not { } docPath)
                    continue;
                docPath = Path.GetFullPath(docPath);
                documents.TryAdd(docPath, new TrackedDocument(default, !IsUnderBuildOutput(projectDir, docPath)));
            }

            if (project.Language != LanguageNames.CSharp || !TryClassifyGlobbing(projectPath, projectDir, out var incremental))
                continue;

            if (!roots.TryGetValue(projectDir, out var root))
                roots[projectDir] = root = (incremental, []);
            root.Ids.Add(project.Id);
            if (!incremental && root.Incremental)
                roots[projectDir] = root with { Incremental = false };
        }

        foreach (var path in buildInputs.Keys.ToList())
            buildInputs[path] = Settled(FileStamp.Read(path));
        foreach (var (path, doc) in documents.ToList())
            documents[path] = doc with { Stamp = Settled(FileStamp.Read(path)) };

        var globRoots = roots.Select(r => new GlobRoot(r.Key, r.Value.Incremental, r.Value.Ids)).ToList();
        var globbed = new HashSet<string>(PathComparer);
        foreach (var root in globRoots)
        {
            foreach (var file in EnumerateGlobbedSources(root.Directory))
            {
                if (file.LastWriteTimeUtc.Ticks < cutoff)
                    globbed.Add(file.FullName);
            }
        }

        return new DiskSnapshot(buildInputs, documents, globRoots, globbed);
    }

    /// <summary>Compares the snapshot with disk. Reads no file content; only stats and directory listings.</summary>
    public DiskChanges Detect(CancellationToken ct)
    {
        foreach (var (path, stamp) in _buildInputs)
        {
            if (FileStamp.Read(path) != stamp)
                return DiskChanges.Reload(path);
        }

        // One listing per glob root yields stamps for most documents without a per-file stat.
        var listed = new Dictionary<string, FileStamp>(PathComparer);
        var added = new Dictionary<string, AddedDocument>(PathComparer);
        foreach (var root in _globRoots)
        {
            ct.ThrowIfCancellationRequested();
            foreach (var file in EnumerateGlobbedSources(root.Directory))
            {
                var path = file.FullName;
                listed.TryAdd(path, FileStamp.Of(file));
                if (_globbedFiles.Contains(path) || _documents.ContainsKey(path))
                    continue;

                // Compile items are customised in this project's MSBuild files; only an evaluation knows the answer.
                if (!root.Incremental)
                    return DiskChanges.Reload(path);

                if (!added.TryGetValue(path, out var entry))
                    added[path] = entry = new AddedDocument(path, listed[path], []);
                entry.Owners.Add(root);
            }
        }

        var edited = new List<(string Path, FileStamp Stamp)>();
        var deleted = new List<string>();
        foreach (var (path, doc) in _documents)
        {
            ct.ThrowIfCancellationRequested();
            var now = listed.TryGetValue(path, out var stamp) ? stamp : FileStamp.Read(path);
            if (now == doc.Stamp)
                continue;
            if (now == FileStamp.Absent)
            {
                // Generated files under obj/ vanish on `dotnet clean`; dropping them would break the compilation.
                if (doc.RemoveWhenMissing)
                    deleted.Add(path);
                continue;
            }
            edited.Add((path, now));
        }

        return new DiskChanges(null, edited, deleted, added.Values.ToList(), listed.Keys.ToHashSet(PathComparer));
    }

    public void Commit(DiskChanges changes, IReadOnlySet<string> unreadable)
    {
        foreach (var (path, stamp) in changes.Edited)
        {
            if (!unreadable.Contains(path))
                _documents[path] = _documents[path] with { Stamp = stamp };
        }

        foreach (var path in changes.Deleted)
            _documents.Remove(path);

        foreach (var added in changes.Added)
        {
            if (!unreadable.Contains(added.Path))
                _documents[added.Path] = new TrackedDocument(added.Stamp, RemoveWhenMissing: true);
        }

        var globbed = new HashSet<string>(changes.GlobbedFiles!, PathComparer);
        globbed.ExceptWith(unreadable);
        _globbedFiles = globbed;
    }

    private static void AddAncestorInputs(string? directory, Action<string> add)
    {
        for (var dir = directory; dir is not null; dir = Path.GetDirectoryName(dir))
        {
            foreach (var name in BuildInputNames)
                add(Path.Combine(dir, name));
        }
    }

    private static bool IsUnderBuildOutput(string projectDir, string path)
    {
        var relative = Path.GetRelativePath(projectDir, path);
        var first = relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)[0];
        return first.Equals("obj", StringComparison.OrdinalIgnoreCase) || first.Equals("bin", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// SDK-style projects compile every <c>**/*.cs</c> under their directory except <c>bin/</c>, <c>obj/</c> and
    /// dot-folders. A new file can be added without an MSBuild evaluation only when neither the project nor a
    /// <c>Directory.Build.*</c> above it changes that default.
    /// </summary>
    private static bool TryClassifyGlobbing(string projectPath, string projectDir, out bool incremental)
    {
        incremental = false;
        string projectXml;
        try
        {
            projectXml = File.ReadAllText(projectPath);
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }

        if (!SdkStyleProject().IsMatch(projectXml))
            return false;

        incremental = !CustomisesCompileItems().IsMatch(projectXml);
        for (var dir = projectDir; incremental && dir is not null; dir = Path.GetDirectoryName(dir))
        {
            foreach (var name in (ReadOnlySpan<string>)["Directory.Build.props", "Directory.Build.targets"])
            {
                var path = Path.Combine(dir, name);
                try
                {
                    if (File.Exists(path) && CustomisesCompileItems().IsMatch(File.ReadAllText(path)))
                        incremental = false;
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException)
                {
                    incremental = false;
                }
            }
        }

        return true;
    }

    private static IEnumerable<FileInfo> EnumerateGlobbedSources(string projectDir)
    {
        var pending = new Stack<(DirectoryInfo Dir, bool IsProjectRoot)>();
        pending.Push((new DirectoryInfo(projectDir), true));

        while (pending.Count > 0)
        {
            var (dir, isRoot) = pending.Pop();
            if (!dir.Exists)
                continue;

            foreach (var file in dir.EnumerateFiles("*.cs", ListOptions))
            {
                if (file.Extension.Equals(".cs", StringComparison.OrdinalIgnoreCase))
                    yield return file;
            }

            foreach (var sub in dir.EnumerateDirectories("*", ListOptions))
            {
                if (sub.Name.StartsWith('.') || sub.Attributes.HasFlag(FileAttributes.ReparsePoint))
                    continue;
                if (isRoot && (sub.Name.Equals("bin", StringComparison.OrdinalIgnoreCase)
                               || sub.Name.Equals("obj", StringComparison.OrdinalIgnoreCase)))
                    continue;
                pending.Push((sub, false));
            }
        }
    }

    [GeneratedRegex(@"<Project\b[^>]*\bSdk\s*=|<Sdk\s|<Import\b[^>]*\bSdk\s*=", RegexOptions.IgnoreCase)]
    private static partial Regex SdkStyleProject();

    [GeneratedRegex(@"<Compile\b|EnableDefault(Compile)?Items|DefaultItemExcludes|BaseOutputPath|BaseIntermediateOutputPath", RegexOptions.IgnoreCase)]
    private static partial Regex CustomisesCompileItems();

    private readonly record struct TrackedDocument(FileStamp Stamp, bool RemoveWhenMissing);
}

internal sealed record GlobRoot(string Directory, bool Incremental, IReadOnlyList<ProjectId> ProjectIds);

internal sealed record AddedDocument(string Path, FileStamp Stamp, List<GlobRoot> Owners);

internal sealed record DiskChanges(
    string? ReloadTrigger,
    IReadOnlyList<(string Path, FileStamp Stamp)> Edited,
    IReadOnlyList<string> Deleted,
    IReadOnlyList<AddedDocument> Added,
    IReadOnlySet<string>? GlobbedFiles)
{
    public static DiskChanges Reload(string trigger) => new(trigger, [], [], [], null);

    public bool HasDocumentChanges => Edited.Count > 0 || Deleted.Count > 0 || Added.Count > 0;
}
