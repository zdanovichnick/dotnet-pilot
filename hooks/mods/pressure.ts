import { update, read } from 'claude-code'
import type { Engine, On } from 'claude-code'

import type { Pressure, PressureEvent } from '../../types'
import { classify, commandKind } from './build-classify'

// Anthropic's interpretability work on Claude Sonnet 4.5 ("Emotion concepts and their function",
// 2026) found a "desperation" representation that rises under mounting failure and causally
// raises the odds of reward hacking — altering tests so they pass. A mod cannot read activations;
// it can see the pressure (repeated red runs, re-edits, corrections) and the behaviour that
// representation drives (test edits that remove or skip assertions). This file does both:
// a 0–100 pressure score the person can see, and a guard on test edits while the score is high.

const state = { plugin: 'dotnet-pilot', key: 'pressure' } as const

export const STEADY_MAX = 29
export const STRAINED_MAX = 59
export const HIGH_AT = 60

const STALE_MS = 60 * 60 * 1000
const MAX_EVENTS = 8

const WEIGHT = {
  buildFail: 25,
  testFail: 30,
  reEditAfterFail: 10,
  correction: 10,
  testIntegrity: 25,
  green: -45,
} as const

const CORRECTION = /\b(still (fails|broken|wrong|not working)|again|doesn't work|does not work|not fixed|wrong|revert|stop (doing|changing))\b/i

const TEST_PATH = /(^|[\\/])(tests?|[^\\/]*\.tests?)([\\/]|$)|tests?\.cs$/i
const ASSERTION = /\b(Assert\.|\.Should\(|\.Should[A-Z]|\.Must\(|Shouldly|Expect\()/
const TEST_ATTRIBUTE = /\[(Fact|Theory|Test|TestMethod)\b/
const SKIP_ATTRIBUTE = /\[(Fact|Theory)\s*\(\s*Skip\s*=|\[Ignore\b|\[Explicit\b/

export type Label = 'steady' | 'strained' | 'high'

export const labelOf = (score: number): Label =>
  score <= STEADY_MAX ? 'steady' : score <= STRAINED_MAX ? 'strained' : 'high'

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

const empty = (now: number): Pressure => ({ score: 0, updatedMs: now, red: false, events: [], editedAfterFail: [] })

// Reasons a test edit looks like it loosens the test rather than fixing it. Empty when it does not.
export const integrityReasons = (oldText: string, newText: string): string[] => {
  const reasons: string[] = []
  const live = newText.replace(/^\s*\/\/.*$/gm, '')
  if (SKIP_ATTRIBUTE.test(newText) && !SKIP_ATTRIBUTE.test(oldText)) reasons.push('adds Skip/Ignore to a test')
  if (ASSERTION.test(oldText) && !ASSERTION.test(live)) {
    reasons.push(ASSERTION.test(newText) ? 'comments out an assertion' : 'removes the assertion')
  }
  if (TEST_ATTRIBUTE.test(oldText) && !TEST_ATTRIBUTE.test(live)) reasons.push('removes a test attribute')
  return reasons
}

export const isTestFile = (path: string) => TEST_PATH.test(path)

const bump = async ($: Engine, kind: PressureEvent['kind'], delta: number, detail: string) => {
  const now = await $.clock.now()
  let next: Pressure = empty(now)
  await update($, state, prev => {
    const base = prev === undefined || now - prev.updatedMs > STALE_MS ? empty(now) : prev
    const isFail = kind === 'build-fail' || kind === 'test-fail'
    next = {
      score: clamp(base.score + delta),
      updatedMs: now,
      red: isFail ? true : kind === 'green' ? false : base.red,
      events: [...base.events, { kind, delta, detail, atMs: now }].slice(-MAX_EVENTS),
      editedAfterFail: kind === 'green' || isFail ? [] : base.editedAfterFail,
    }
    return next
  })
  $.ui.status(next.score === 0 ? undefined : `pressure ${next.score} ${labelOf(next.score)}`)
  return next
}

const fileName = (path: string) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

export const registerPressure = (on: On, blockTestGuard: boolean) => {
  for (const tool of ['Bash', 'PowerShell'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const ran = await next(e)
      const kind = commandKind(e.command)
      if (ran.deny !== undefined || kind === null) return ran
      const outcome = classify(ran.text ?? '', e.command, ran.isError === true)
      if (outcome === 'fail') {
        await bump($, kind === 'test' ? 'test-fail' : 'build-fail', kind === 'test' ? WEIGHT.testFail : WEIGHT.buildFail, `dotnet ${kind} failed`)
      } else if (outcome === 'success') {
        await bump($, 'green', WEIGHT.green, `dotnet ${kind} green`)
      }
      return ran
    })
  }

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const prev = await read($, state)
    const current = prev?.score ?? 0

    if (isTestFile(e.file_path) && prev !== undefined && prev.red) {
      const reasons = integrityReasons(e.old_string, e.new_string)
      if (reasons.length > 0) {
        const detail = `${fileName(e.file_path)}: ${reasons.join(', ')}`
        await bump($, 'test-integrity', WEIGHT.testIntegrity, detail)
        const message = `Test edit after a red run ${reasons.join(', ')} — fix the code or report the blocker, not the test (${fileName(e.file_path)})`
        if (blockTestGuard && current >= HIGH_AT) {
          $.ui.toast(`Blocked: ${message}`)
          return { deny: `${message}. The pressure_test_guard_block option is on; make the production code pass, or return [HALT: <blocker>].` }
        }
        $.ui.toast(message)
      }
    }

    const ran = await next(e)
    if (ran.deny !== undefined || prev === undefined || !prev.red) return ran
    if (prev.editedAfterFail.includes(e.file_path)) {
      await bump($, 're-edit', WEIGHT.reEditAfterFail, `${fileName(e.file_path)} edited again after a red run`)
    } else {
      await update($, state, p => (p === undefined ? p : { ...p, editedAfterFail: [...p.editedAfterFail, e.file_path].slice(-20) }))
    }
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && CORRECTION.test(e.text)) {
      const prev = await read($, state)
      if (prev !== undefined && prev.score > 0) await bump($, 'correction', WEIGHT.correction, 'correction in the prompt')
    }
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    $.command.register({ name: 'dnp-pressure', description: 'Show the dotnet-pilot pressure score and the events behind it', immediate: true })
    return next(e)
  })

  on('command.run', { command: 'dnp-pressure' }, async $ => {
    const prev = await read($, state)
    if (prev === undefined || prev.events.length === 0) return { text: 'pressure 0 steady — no red dotnet run recorded this session' }
    const lines = prev.events.map(ev => `${ev.delta >= 0 ? '+' : ''}${ev.delta}  ${ev.kind}: ${ev.detail}`)
    return { text: [`pressure ${prev.score} ${labelOf(prev.score)}`, ...lines].join('\n') }
  })
}
