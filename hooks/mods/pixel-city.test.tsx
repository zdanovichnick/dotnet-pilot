import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { LIT, luminance, paint, pixels } from './city-scene'
import type { SceneInput } from './city-scene'
import { dinoLift } from './scene-dino'
import { timelapseHour } from './scene-sunset'

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

  test('pixels_EachView_PaintsItsOwnForeground', () => {
    const bottoms = (['city', 'beach', 'dino', 'sunset'] as const).map(view => {
      const px = pixels({ ...BASE, view })
      return Array.from(px.subarray(px.length - BASE.columns * 3)).join(',')
    })
    expect(new Set(bottoms).size).toBe(4)
  })

  test('pixels_BeachAtNoon_SeaIsBlue', () => {
    const px = pixels({ ...BASE, view: 'beach' })
    const sea = px[6 * BASE.columns + 30] ?? 0
    expect(sea & 0xff).toBeGreaterThan((sea >> 16) & 0xff)
  })

  test('pixels_FrameAdvances_LaterFrameDiffers', () => {
    for (const view of ['beach', 'dino', 'sunset'] as const) {
      expect(paint({ ...BASE, view, frame: 40, travel: 32 })).not.toBe(paint({ ...BASE, view }))
    }
  })
})

describe('dino', () => {
  test('dinoLift_RunOfGround_JumpsSomewhereAndLandsSomewhere', () => {
    const lifts = Array.from({ length: 400 }, (_, i) => dinoLift(i * 0.5))
    expect(lifts.some(l => l > 0)).toBe(true)
    expect(lifts.some(l => l === 0)).toBe(true)
    expect(Math.max(...lifts)).toBeLessThanOrEqual(3)
  })
})

describe('sunset', () => {
  test('timelapseHour_FirstFrame_StartsBeforeDawn', () => {
    expect(timelapseHour(0)).toBe(5)
  })

  test('timelapseHour_ThousandFrames_WrapsOneDay', () => {
    expect(Math.abs(timelapseHour(1000) - 5)).toBeLessThan(1e-9)
    expect(Math.abs(timelapseHour(500) - 17)).toBeLessThan(1e-9)
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
  test('city_PixelCityOff_RepliesHowToEnable', async ($, on) => {
    mock.clock(on)
    expect(await city($, 'show')).toContain('/config')
  })

  test('city_SceneOptionDino_StartsInDino', { options: { pixel_city: true, pixel_city_scene: 'dino' } }, async ($, on) => {
    mock.clock(on)
    expect(await city($, 'status')).toContain('scene: dino')
  })

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

  for (const [arg, view] of [['beach', 'beach'], ['dino', 'dino'], ['dinosaur', 'dino'], ['sunset', 'sunset'], ['sunrise', 'sunset']] as const) {
    test(`city_${arg}_SwitchesScene`, ON, async ($, on) => {
      mock.clock(on)
      expect(await city($, arg)).toBe(`Scene: ${view}.`)
      expect(await city($, 'status')).toContain(`scene: ${view}`)
    })
  }

  test('city_Next_CyclesScenesInOrder', ON, async ($, on) => {
    mock.clock(on)
    expect(await city($, 'next')).toBe('Scene: beach.')
    expect(await city($, 'next')).toBe('Scene: dino.')
    expect(await city($, 'next')).toBe('Scene: sunset.')
    expect(await city($, 'next')).toBe('Scene: city.')
  })

  test('city_NoArgs_TogglesHidden', ON, async ($, on) => {
    mock.clock(on)
    expect(await city($, '')).toBe('Pixel city hidden.')
    expect(await city($, '')).toBe('Pixel city shown.')
  })
})
