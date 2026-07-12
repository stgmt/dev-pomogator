using System.Diagnostics;

static string QuoteForCmd(string value)
{
    if (value.Length == 0) return "\"\"";
    var needsQuotes = value.Any(char.IsWhiteSpace) || value.IndexOfAny(['"', '&', '(', ')', '^', '%', '!']) >= 0;
    var escaped = value.Replace("\"", "\\\"");
    return needsQuotes ? $"\"{escaped}\"" : escaped;
}

static string OwnDirectory()
{
    var processPath = Environment.ProcessPath;
    if (!string.IsNullOrWhiteSpace(processPath))
    {
        var dir = Path.GetDirectoryName(processPath);
        if (!string.IsNullOrWhiteSpace(dir)) return dir;
    }

    return AppContext.BaseDirectory;
}

static int Run(string fileName, string arguments)
{
    using var process = Process.Start(new ProcessStartInfo
    {
        FileName = fileName,
        Arguments = arguments,
        UseShellExecute = false,
        WorkingDirectory = Environment.CurrentDirectory,
    });
    if (process is null)
    {
        Console.Error.WriteLine($"claude.exe wrapper could not start {fileName}");
        return 1;
    }

    process.WaitForExit();
    return process.ExitCode;
}

var dir = OwnDirectory();
var cmdPath = Path.Combine(dir, "claude.cmd");
var realPath = Path.Combine(dir, "claude-real.exe");
var forwardedArgs = string.Join(" ", args.Select(QuoteForCmd));

if (File.Exists(cmdPath))
{
    return Run("cmd.exe", $"/d /c call {QuoteForCmd(cmdPath)} {forwardedArgs}");
}

if (File.Exists(realPath))
{
    return Run(realPath, forwardedArgs);
}

Console.Error.WriteLine($"claude.exe wrapper could not find {cmdPath} or {realPath}");
return 9009;
