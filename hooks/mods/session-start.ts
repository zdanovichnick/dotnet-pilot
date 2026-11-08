import type { On } from 'claude-code'

import { mcpHealthSessionStart } from './mcp-health'
import { pressureSessionStart } from './pressure'

// The engine allows one unmatched session.start hook per module, so every mod's start work runs
// from this one, before the engine's own start.
export const registerSessionStart = (on: On, enabled: { pressure: boolean; mcpHealth: boolean }) => {
  if (!enabled.pressure && !enabled.mcpHealth) return
  on('session.start', async ($, e, next) => {
    if (enabled.pressure) await pressureSessionStart($)
    if (enabled.mcpHealth) await mcpHealthSessionStart($, e, { pressure: enabled.pressure })
    return next(e)
  })
}
