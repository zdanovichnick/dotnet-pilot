namespace DotnetPilot.Mcp.Roslyn.Workspace;

public static class SolutionLocator
{
    /// <summary>The nearest <c>.slnx</c> (preferred) or <c>.sln</c> in <paramref name="startDir"/> or a parent.</summary>
    public static string? FindUpward(string startDir)
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

    /// <summary>
    /// A solution file's full path, or the nearest solution at or above a directory; null when neither exists.
    /// </summary>
    public static string? Resolve(string path)
    {
        var full = Path.GetFullPath(path);
        if (Directory.Exists(full))
            return FindUpward(full);

        var extension = Path.GetExtension(full);
        var isSolution = extension.Equals(".slnx", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".sln", StringComparison.OrdinalIgnoreCase);
        return isSolution && File.Exists(full) ? full : null;
    }
}
