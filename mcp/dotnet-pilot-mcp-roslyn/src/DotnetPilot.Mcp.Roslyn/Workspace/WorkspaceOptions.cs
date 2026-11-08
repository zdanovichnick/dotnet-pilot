namespace DotnetPilot.Mcp.Roslyn.Workspace;

/// <param name="SolutionPath">Null when the server started outside any solution; <c>reload_solution</c> binds one later.</param>
public sealed record WorkspaceOptions(string? SolutionPath);
