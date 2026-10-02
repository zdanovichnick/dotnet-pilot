import { update } from 'claude-code'
import type { On } from 'claude-code'

import { classify, commandKind } from './build-classify'

const streak = { plugin: 'dotnet-pilot', key: 'buildStreak' } as const

const STALE_MS = 60 * 60 * 1000
export const WARN_AT = 3
export const ESCALATE_AT = 5

// The model already receives these through dnp-build-verify; the toast is the same signal for the person.
export const registerBuildStatus = (on: On) => {
  for (const tool of ['Bash', 'PowerShell'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const ran = await next(e)
      const kind = commandKind(e.command)
      if (ran.deny !== undefined || kind === null) return ran

      const outcome = classify(ran.text ?? '', e.command, ran.isError === true)
      if (outcome === 'unknown') return ran

      const now = await $.clock.now()
      let count = 0
      await update($, streak, prev => {
        const isFresh = prev !== undefined && prev.count > 0 && now - prev.lastFailMs < STALE_MS
        count = outcome === 'fail' ? (isFresh ? prev.count + 1 : 1) : 0
        return { count, lastFailMs: outcome === 'fail' ? now : (prev?.lastFailMs ?? 0) }
      })

      if (count === WARN_AT) {
        $.ui.toast(`${WARN_AT} consecutive dotnet ${kind} failures — diagnose the root cause before retrying`)
      } else if (count === ESCALATE_AT) {
        $.ui.toast(`${ESCALATE_AT} consecutive dotnet ${kind} failures — pause and review`)
      }
      return ran
    })
  }
}
