namespace DotnetPilot.Mcp.Roslyn.Workspace;

/// <summary>Last-write time and length of a file, used to detect on-disk changes without reading content.</summary>
internal readonly record struct FileStamp(long LastWriteUtcTicks, long Length)
{
    public static readonly FileStamp Absent = new(0, -1);

    /// <summary>Never equal to a real stat, so the next comparison always reports a change.</summary>
    public static readonly FileStamp Unsettled = new(-1, -1);

    public static FileStamp Of(FileInfo info) =>
        info.Exists ? new FileStamp(info.LastWriteTimeUtc.Ticks, info.Length) : Absent;

    public static FileStamp Read(string path) => Of(new FileInfo(path));
}
