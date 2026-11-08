import type { McpHealth, McpServerHealth } from '../../types'

const serverSegment = (s: McpServerHealth) => {
  if (s.state === 'down') return `${s.server} ✗ ${s.reason ?? 'down'}`
  if (s.reason === undefined) return `${s.server} ✓`
  return s.reason === 'unprobed' ? `${s.server} ✓ unprobed` : `${s.server} ⚠ ${s.reason}`
}

// The engine keeps one status line per plugin, so pressure.ts and mcp-health.ts each rebuild the
// whole line from both values rather than replacing each other's.
export const statusLine = (pressure: string | undefined, health: McpHealth | undefined): string | undefined => {
  const parts = [pressure, ...(health?.servers ?? []).map(serverSegment)].filter((p): p is string => p !== undefined)
  return parts.length === 0 ? undefined : parts.join(' · ')
}
