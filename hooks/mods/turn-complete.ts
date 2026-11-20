import type { On } from 'claude-code'

import { agentsTurnComplete } from './agents'
import { pixelCityTurnComplete } from './pixel-city'

// The engine allows one unmatched turn.complete hook per module, so every mod's turn-end work runs from this one.
export const registerTurnComplete = (on: On, enabled: { agents: boolean; pixelCity: boolean }) => {
  if (!enabled.agents && !enabled.pixelCity) return
  on('turn.complete', async ($, e, next) => {
    if (enabled.pixelCity) pixelCityTurnComplete()
    if (enabled.agents) await agentsTurnComplete($, e)
    return next(e)
  })
}
