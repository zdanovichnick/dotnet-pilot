import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { LIT, luminance, paint, pixels } from './city-scene'
import type { SceneInput } from './city-scene'

const BASE: SceneInput = {
  columns: 60,
  rows: 5,
  hour: 12,
  frame: 0,
  weather: 'clear',
  energy: 0,
  isWorking: false,
  cometAge: -1,
  flash: false,
}

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const skyLuminance = (input: SceneInput) => {
  const px = pixels(input)
  let sum = 0
  for (let x = 0; x < input.columns; x++) sum += luminance(px[x] ?? 0)
  return sum / input.columns
}

const ON = { options: { pixel_city: true } } as const

const COMMAND = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
const city = async ($: Engine, args: string) => (await $.command.run({ command: 'city', args, ...COMMAND })).text

const litWindows = (input: SceneInput) => pixels(input).filter(c => LIT.includes(c)).length

describe('scene', () => {
  test('paint_AnyScene_EncodesOneHalfBlockTripletPerCell', () => {
    const cells = paint(BASE)
    const bytes = BASE.columns * BASE.rows * 12
    expect(cells.length).toBe(Math.ceil(bytes / 3) * 4)
    const head = atob(cells.slice(0, 8))
    expect([head.charCodeAt(0), head.charCodeAt(1), head.charCodeAt(2), head.charCodeAt(3)]).toEqual([0x80, 0x25, 0, 0])
  })

  test('pixels_NightHour_SkyDarkerThanNoon', () => {
    expect(skyLuminance({ ...BASE, hour: 0.5 })).toBeLessThan(skyLuminance(BASE) / 3)
  })

  test('pixels_Storm_SkyDarkerThanClear', () => {
    expect(skyLuminance({ ...BASE, weather: 'storm', frame: 1 })).toBeLessThan(skyLuminance(BASE))
  })

  test('pixels_ToolEnergyAtNight_LightsMoreWindows', () => {
    const night = { ...BASE, hour: 0.5 }
    expect(litWindows({ ...night, energy: 1 })).toBeGreaterThan(litWindows({ ...night, energy: 0 }))
  })

  test('pixels_LaterFrame_AnimatesTheScene', () => {
    expect(paint({ ...BASE, frame: 40 })).not.toBe(paint(BASE))
  })
})

describe('band', () => {
  test('render_Terminal_DrawsRasterSizedToBody', ON, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 8, 12) })
    const ui = await $.ui.mount({ plugin: 'dotnet-pilot', surface: 'terminal', ...BAND })
    const raster = await ui.find({ type: 'Raster', key: 'city' })
    expect(raster?.props).toMatchObject({ columns: 80, rows: 5 })
  })

  test('render_SurveyShowing_YieldsTheBand', ON, async ($, on) => {
    mock.clock(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })
    const ui = await $.ui.mount({ plugin: 'dotnet-pilot', surface: 'terminal', ...BAND, props: { ...BAND.props, hasSurvey: true } })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ key: 'engine' })).toBeDefined()
  })
})

describe('option', () => {
  test('render_PixelCityOff_DrawsNothing', async ($, on) => {
    mock.clock(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })
    const ui = await $.ui.mount({ plugin: 'dotnet-pilot', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })
})

describe('weather', () => {
  const run = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })

  test('toolCall_FailedDotnetBuild_BringsStorm_ThenGreenBuildBringsRainbow', ON, async ($, on) => {
    mock.clock(on)
    let isFailing = true
    on('tool.call', () =>
      isFailing
        ? { result: { stdout: 'Build FAILED.', stderr: '', interrupted: false }, text: 'Build FAILED.', isError: true }
        : { result: { stdout: 'Build succeeded.', stderr: '', interrupted: false }, text: 'Build succeeded.' },
    )
    await run($, 'dotnet build App.slnx')
    expect(await city($, 'status')).toContain('weather: storm')

    isFailing = false
    await run($, 'dotnet build App.slnx')
    expect(await city($, 'status')).toContain('weather: rainbow')
  })

  test('toolCall_FailedNonDotnetCommand_LeavesWeatherClear', ON, async ($, on) => {
    mock.clock(on)
    on('tool.call', () => ({ result: { stdout: '', stderr: 'no match', interrupted: false }, isError: true }))
    await run($, 'npm test')
    expect(await city($, 'status')).toContain('weather: clear')
  })
})

describe('command', () => {
  test('city_Night_PinsTheSky', ON, async ($, on) => {
    mock.clock(on)
    expect(await city($, 'night')).toBe('Sky pinned to night.')
    expect(await city($, 'status')).toContain('sky: night')
  })

  test('city_NoArgs_TogglesHidden', ON, async ($, on) => {
    mock.clock(on)
    expect(await city($, '')).toBe('Pixel city hidden.')
    expect(await city($, '')).toBe('Pixel city shown.')
  })
})
