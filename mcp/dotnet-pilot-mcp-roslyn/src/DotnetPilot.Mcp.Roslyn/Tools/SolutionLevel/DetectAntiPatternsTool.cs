using System.ComponentModel;
using System.Text.Json;
using DotnetPilot.Mcp.Roslyn.Workspace;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ModelContextProtocol.Server;

namespace DotnetPilot.Mcp.Roslyn.Tools.SolutionLevel;

[McpServerToolType]
public sealed class DetectAntiPatternsTool
{
    [McpServerTool(Name = "detect_antipatterns"), Description("Scans source for common .NET anti-patterns: async void, broad catch(Exception), DateTime.Now, new HttpClient(), sync-over-async (.Result/.Wait()), missing CancellationToken on async methods, string interpolation in ILogger calls, and Thread.Sleep. Syntax-based — fast across whole solution. Skips test files and generated code.")]
    public static async Task<string> Execute(
        WorkspaceCache workspace,
        [Description("Optional relative file path to scope the scan. Pass empty string to scan the whole solution.")] string filePath,
        CancellationToken ct)
    {
        var solution = await workspace.GetSolutionAsync(ct);
        var solutionDir = Path.GetDirectoryName(solution.FilePath) ?? "";

        var documents = string.IsNullOrWhiteSpace(filePath)
            ? solution.Projects.SelectMany(p => p.Documents)
            : EnumerateMatching(solution, filePath);

        var issues = new List<object>();
        var scannedFiles = 0;

        foreach (var document in documents)
        {
            ct.ThrowIfCancellationRequested();
            if (document.FilePath is null) continue;
            if (ShouldSkipFile(document.FilePath)) continue;

            var root = await document.GetSyntaxRootAsync(ct);
            if (root is null) continue;

            scannedFiles++;
            var isTestFile = document.FilePath.Contains("Test", StringComparison.OrdinalIgnoreCase);
            var relPath = Path.GetRelativePath(solutionDir, document.FilePath).Replace('\\', '/');

            ScanFile(root, relPath, isTestFile, issues);
        }

        return JsonSerializer.Serialize(new
        {
            scannedFiles,
            issueCount = issues.Count,
            issues
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    private static IEnumerable<Document> EnumerateMatching(Solution solution, string filePath)
    {
        var normalized = filePath.Replace('\\', '/');
        foreach (var project in solution.Projects)
        foreach (var document in project.Documents)
        {
            if (document.FilePath is null) continue;
            var docNorm = document.FilePath.Replace('\\', '/');
            if (docNorm.EndsWith(normalized, StringComparison.OrdinalIgnoreCase))
                yield return document;
        }
    }

    private static bool ShouldSkipFile(string filePath)
    {
        var normalized = filePath.Replace('\\', '/');
        if (normalized.Contains("/obj/", StringComparison.OrdinalIgnoreCase)) return true;
        if (normalized.Contains("/bin/", StringComparison.OrdinalIgnoreCase)) return true;
        if (normalized.Contains("/Migrations/", StringComparison.OrdinalIgnoreCase)) return true;
        if (normalized.EndsWith(".g.cs", StringComparison.OrdinalIgnoreCase)) return true;
        if (normalized.EndsWith(".designer.cs", StringComparison.OrdinalIgnoreCase)) return true;
        if (normalized.EndsWith(".g.i.cs", StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    private static void ScanFile(SyntaxNode root, string relPath, bool isTestFile, List<object> issues)
    {
        foreach (var node in root.DescendantNodes())
        {
            switch (node)
            {
                case MethodDeclarationSyntax method:
                    CheckAsyncVoid(method, relPath, issues);
                    if (!isTestFile) CheckMissingCancellationToken(method, relPath, issues);
                    break;
                case CatchClauseSyntax catchClause:
                    CheckBroadCatch(catchClause, relPath, issues);
                    break;
                case MemberAccessExpressionSyntax memberAccess:
                    CheckDateTimeNow(memberAccess, relPath, issues);
                    if (!isTestFile) CheckSyncOverAsync(memberAccess, relPath, issues);
                    break;
                case ObjectCreationExpressionSyntax objectCreation:
                    CheckNewHttpClient(objectCreation, relPath, issues);
                    break;
                case InvocationExpressionSyntax invocation:
                    CheckLogInterpolation(invocation, relPath, issues);
                    CheckThreadSleep(invocation, relPath, issues);
                    break;
            }
        }
    }

    private static void CheckAsyncVoid(MethodDeclarationSyntax method, string relPath, List<object> issues)
    {
        var isAsync = method.Modifiers.Any(m => m.IsKind(SyntaxKind.AsyncKeyword));
        if (!isAsync) return;
        if (method.ReturnType is not PredefinedTypeSyntax predefined) return;
        if (!predefined.Keyword.IsKind(SyntaxKind.VoidKeyword)) return;

        // Allow event handlers (e.g. button_Click(object sender, EventArgs e))
        if (LooksLikeEventHandler(method)) return;

        Add(issues, "async_void", "high", relPath, method.Identifier.GetLocation(),
            $"async {method.Identifier.Text}(...) returns void");
    }

    private static bool LooksLikeEventHandler(MethodDeclarationSyntax method)
    {
        if (method.ParameterList.Parameters.Count != 2) return false;
        var second = method.ParameterList.Parameters[1];
        return second.Type?.ToString().Contains("EventArgs", StringComparison.Ordinal) == true;
    }

    private static void CheckMissingCancellationToken(MethodDeclarationSyntax method, string relPath, List<object> issues)
    {
        var isAsync = method.Modifiers.Any(m => m.IsKind(SyntaxKind.AsyncKeyword));
        if (!isAsync) return;
        if (method.Identifier.Text == "Main") return;
        if (method.Modifiers.Any(m => m.IsKind(SyntaxKind.OverrideKeyword))) return;

        var hasCt = method.ParameterList.Parameters.Any(p =>
            p.Type?.ToString().EndsWith("CancellationToken", StringComparison.Ordinal) == true);
        if (hasCt) return;

        Add(issues, "missing_cancellation_token", "medium", relPath, method.Identifier.GetLocation(),
            $"async {method.Identifier.Text}(...) — no CancellationToken parameter");
    }

    private static void CheckBroadCatch(CatchClauseSyntax catchClause, string relPath, List<object> issues)
    {
        if (catchClause.Declaration is null)
        {
            Add(issues, "broad_catch", "medium", relPath, catchClause.CatchKeyword.GetLocation(),
                "catch { } — bare catch block");
            return;
        }

        var typeText = catchClause.Declaration.Type.ToString();
        if (typeText == "Exception" || typeText == "System.Exception")
        {
            if (catchClause.Filter is not null) return;
            Add(issues, "broad_catch", "medium", relPath, catchClause.Declaration.Type.GetLocation(),
                "catch (Exception) without filter");
        }
    }

    private static void CheckDateTimeNow(MemberAccessExpressionSyntax memberAccess, string relPath, List<object> issues)
    {
        if (memberAccess.Expression is not IdentifierNameSyntax id) return;
        if (id.Identifier.Text != "DateTime" && id.Identifier.Text != "DateTimeOffset") return;
        var memberName = memberAccess.Name.Identifier.Text;
        if (memberName != "Now" && memberName != "UtcNow" && memberName != "Today") return;

        Add(issues, "datetime_now", "low", relPath, memberAccess.GetLocation(),
            $"{id.Identifier.Text}.{memberName} — prefer TimeProvider for testability");
    }

    private static void CheckNewHttpClient(ObjectCreationExpressionSyntax objectCreation, string relPath, List<object> issues)
    {
        var typeName = objectCreation.Type switch
        {
            IdentifierNameSyntax id => id.Identifier.Text,
            QualifiedNameSyntax q => q.Right.Identifier.Text,
            _ => null
        };
        if (typeName != "HttpClient") return;

        Add(issues, "new_httpclient", "high", relPath, objectCreation.GetLocation(),
            "new HttpClient() — use IHttpClientFactory");
    }

    private static void CheckSyncOverAsync(MemberAccessExpressionSyntax memberAccess, string relPath, List<object> issues)
    {
        var name = memberAccess.Name.Identifier.Text;
        if (name != "Result" && name != "Wait") return;

        // Heuristic: parent is an InvocationExpression for .Wait(), or we're reading .Result
        if (name == "Wait")
        {
            if (memberAccess.Parent is not InvocationExpressionSyntax) return;
        }

        Add(issues, "sync_over_async", "high", relPath, memberAccess.GetLocation(),
            $".{name} — sync-over-async (use await)");
    }

    private static void CheckLogInterpolation(InvocationExpressionSyntax invocation, string relPath, List<object> issues)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) return;
        var methodName = memberAccess.Name.Identifier.Text;
        if (!IsLoggerMethod(methodName)) return;

        // Look at first argument — if interpolated string, flag it
        var firstArg = invocation.ArgumentList.Arguments.FirstOrDefault();
        if (firstArg?.Expression is InterpolatedStringExpressionSyntax)
        {
            Add(issues, "log_interpolation", "medium", relPath, invocation.GetLocation(),
                $"{methodName}($\"...\") — use message templates: {methodName}(\"{{Value}}\", value)");
        }
    }

    private static bool IsLoggerMethod(string name) =>
        name is "Log" or "LogTrace" or "LogDebug" or "LogInformation" or "LogWarning"
              or "LogError" or "LogCritical";

    private static void CheckThreadSleep(InvocationExpressionSyntax invocation, string relPath, List<object> issues)
    {
        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) return;
        if (memberAccess.Name.Identifier.Text != "Sleep") return;
        if (memberAccess.Expression is not IdentifierNameSyntax id) return;
        if (id.Identifier.Text != "Thread") return;

        Add(issues, "thread_sleep", "medium", relPath, invocation.GetLocation(),
            "Thread.Sleep — use await Task.Delay(...) in async code");
    }

    private static void Add(List<object> issues, string pattern, string severity, string file, Location location, string code)
    {
        var lineSpan = location.GetLineSpan();
        issues.Add(new Dictionary<string, object?>
        {
            ["pattern"] = pattern,
            ["severity"] = severity,
            ["file"] = file,
            ["line"] = lineSpan.StartLinePosition.Line + 1,
            ["code"] = code
        });
    }
}
