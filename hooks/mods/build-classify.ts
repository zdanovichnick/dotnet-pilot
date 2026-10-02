// Mirrors the classification in hooks/dnp-build-verify.js. The marker arrays below must stay
// line-for-line identical to that file's; hooks/__tests__/check-consistency.js enforces it.

const DOTNET_CMD = /\bdotnet(?:\.exe)?\s+(build|test)\b/g

const FAIL_MARKERS = [
  /Build FAILED/,
  /\berror\s+[A-Z]{2,6}\d{3,5}\b/,
  /Failed!\s+-\s+Failed:\s+[1-9]/,
  /Test Run Failed\./,
  /Test summary:.*\bfailed:\s*[1-9]/i,
  /\b[1-9]\d*\s+Error\(s\)/,
]
const SUCCESS_MARKERS = [
  /Build succeeded/,
  /\b0 Error\(s\)/,
  /Passed!\s+-\s+Failed:\s+0\b/,
  /Test Run Successful\./,
  /Test summary:.*\bfailed:\s*0\b/i,
]

export type BuildKind = 'build' | 'test'
export type Outcome = 'fail' | 'success' | 'unknown'

// 'test' wins when a chained command runs both, since the test summary is the outcome that matters.
export const commandKind = (command: string): BuildKind | null => {
  let kind: BuildKind | null = null
  for (const m of command.matchAll(DOTNET_CMD)) {
    kind = m[1] === 'test' ? 'test' : (kind ?? 'build')
  }
  return kind
}

// Text markers outrank the exit status: a build piped through `| grep` exits with grep's status.
// The status alone counts as a failure only when the command is not piped.
export const classify = (text: string, command: string, isError: boolean): Outcome => {
  if (FAIL_MARKERS.some(re => re.test(text))) return 'fail'
  if (SUCCESS_MARKERS.some(re => re.test(text))) return 'success'
  return isError && !command.includes('|') ? 'fail' : 'unknown'
}
