import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { PixelCityScene, PixelCitySky } from '../../types'
import { classify, commandKind } from './build-classify'
import { paint } from './city-scene'

const KEY = 'city'
const TICK_MS = 200
const BAND_ROWS = 5
const RAINBOW_MS = 30_000

const SKIES: Record<PixelCitySky, number | undefined> = {
  auto: undefined,
  dawn: 6.6,
  day: 12.5,
  dusk: 18.7,
  night: 0.5,
}

const INITIAL: PixelCityScene = { weather: 'clear', sky: 'auto', isHidden: false, rainbowUntil: 0 }
const scene = atom({ plugin: 'dotnet-pilot', key: 'cityScene' } as const, INITIAL)

const isSky = (value: string): value is PixelCitySky => Object.hasOwn(SKIES, value)

const hourOf = (sky: PixelCitySky, now: number) => {
  const fixed = SKIES[sky]
  if (fixed !== undefined) return fixed
  const at = new Date(now)
  return at.getHours() + at.getMinutes() / 60
}

// Animation lives in module variables: they reset on a hot reload, which only
// restarts the clouds and cars. What a person chose lives in `scene`.
let frame = 0
let energy = 0
let cometAt = -1
let flashAt = -1
let isWorking = false
let band: { requestId: string; columns: number; rows: number } | undefined

const draw = (s: PixelCityScene, now: number, columns: number, rows: number) => {
  const cometAge = cometAt < 0 ? -1 : frame - cometAt
  if (cometAge > columns) cometAt = -1
  return paint({
    columns,
    rows,
    hour: hourOf(s.sky, now),
    frame,
    weather: s.weather,
    energy,
    isWorking,
    cometAge: cometAt < 0 ? -1 : cometAge,
    flash: flashAt >= 0 && frame - flashAt < 2,
  })
}

export const registerPixelCity = (on: On) => {
  on('tool.call', async ($, e, next) => {
    energy = Math.min(1, energy + 0.12)
    const ran = await next(e)
    if (ran.isError === true) flashAt = frame
    return ran
  }).catch(($, e, next) => next(e))

  for (const tool of ['Bash', 'PowerShell'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const ran = await next(e)
      if (ran.deny !== undefined || commandKind(e.command) === null) return ran
      const outcome = classify(ran.text ?? '', e.command, ran.isError === true)
      if (outcome === 'unknown') return ran

      const now = await $.clock.now()
      await update($, scene, (s): PixelCityScene => {
        if (outcome === 'fail') return { ...s, weather: 'storm' }
        if (s.weather === 'storm') return { ...s, weather: 'rainbow', rainbowUntil: now + RAINBOW_MS }
        return s
      })
      return ran
    }).catch(($, e, next) => next(e))
  }

  on('turn.complete', ($, e, next) => {
    cometAt = frame
    return next(e)
  })

  on('command.run', { command: 'city' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const now = await $.clock.now()

    if (arg === '' || arg === 'show' || arg === 'hide') {
      const s = await update($, scene, v => ({ ...v, isHidden: arg === '' ? !v.isHidden : arg === 'hide' }))
      return { text: s.isHidden ? 'Pixel city hidden.' : 'Pixel city shown.' }
    }
    if (isSky(arg)) {
      await update($, scene, v => ({ ...v, sky: arg, isHidden: false }))
      return { text: arg === 'auto' ? 'Sky follows the local clock.' : `Sky pinned to ${arg}.` }
    }
    if (arg === 'storm' || arg === 'clear') {
      await update($, scene, (v): PixelCityScene => ({ ...v, weather: arg, isHidden: false }))
      if (arg === 'storm') flashAt = frame
      return { text: arg === 'storm' ? 'A storm rolls in.' : 'Skies clear.' }
    }
    if (arg === 'rainbow') {
      await update($, scene, (v): PixelCityScene => ({ ...v, weather: 'rainbow', rainbowUntil: now + RAINBOW_MS, isHidden: false }))
      return { text: 'Rainbow for 30 seconds.' }
    }
    if (arg === 'status') {
      const s = await read($, scene)
      return { text: `sky: ${s.sky}, weather: ${s.weather}, ${s.isHidden ? 'hidden' : 'shown'}` }
    }
    if (arg === 'comet') {
      cometAt = frame
      return { text: 'Make a wish.' }
    }
    return { text: 'Usage: /city [show|hide|status|dawn|day|dusk|night|auto|storm|rainbow|clear|comet]' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, scene)
    if (e.surface !== 'terminal' || e.props.hasSurvey || s.isHidden || e.props.maxRows < BAND_ROWS) {
      band = undefined
      return next(e)
    }

    const { Raster } = $.ui.resolve(e)
    const columns = Math.min(512, Math.max(1, e.props.bodyColumns))
    const rows = BAND_ROWS
    isWorking = e.props.isWorking
    band = { requestId: e.requestId, columns, rows }

    return <Raster key={KEY} columns={columns} rows={rows} cells={draw(s, await $.clock.now(), columns, rows)} />
  })

  // Matched on surface: pressure owns the module's one unmatched session.start, and only the terminal draws the band.
  on('session.start', { surface: 'terminal' }, async ($, e, next) => {
    await $.command.register({
      name: 'city',
      description: 'Pixel city above the prompt: show/hide, sky (dawn|day|dusk|night|auto), weather (storm|rainbow|clear), comet',
      argumentHint: '[show|hide|status|dawn|day|dusk|night|auto|storm|rainbow|clear|comet]',
    })

    $.clock.every(TICK_MS, async () => {
      frame += 1
      energy *= 0.985
      if (band === undefined) return

      const s = await read($, scene)
      if (s.isHidden) return
      const now = await $.clock.now()
      if (s.weather === 'rainbow' && now > s.rainbowUntil) {
        await update($, scene, (v): PixelCityScene => (v.weather === 'rainbow' ? { ...v, weather: 'clear' } : v))
        return
      }

      const { requestId, columns, rows } = band
      const blitted = await $.ui.blit({ requestId, key: KEY, columns, rows, cells: draw(s, now, columns, rows) })
      // Not mounted or resized: the next render re-seats the band.
      if (blitted.deny !== undefined) band = undefined
    })

    return next(e)
  })
}
