// Shared .NET-project detection for DotnetPilot hooks.
//
// A directory is a ".NET project" if it (or one of a few parent directories)
// contains a solution/project file (`.sln`/`.slnx`/`.csproj`). The parent
// walk-up means a CWD nested inside a subproject still resolves the solution.

const fs = require('fs');
const path = require('path');

const DOTNET_MARKERS = ['.sln', '.slnx', '.csproj'];

function dirHasDotNetMarker(dir) {
  try {
    const entries = fs.readdirSync(dir);
    return entries.some(e => DOTNET_MARKERS.some(ext => e.endsWith(ext)));
  } catch {
    return false;
  }
}

// Walks `dir` and up to `maxUp` ancestors looking for a .NET marker.
function isDotNetProject(dir, maxUp = 5) {
  if (!dir) return false;
  let current = dir;
  for (let i = 0; i <= maxUp; i++) {
    if (dirHasDotNetMarker(current)) return true;
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }
  return false;
}

module.exports = { isDotNetProject, dirHasDotNetMarker, DOTNET_MARKERS };
