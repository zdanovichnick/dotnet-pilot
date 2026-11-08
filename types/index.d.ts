export type BuildStreak = { count: number; lastFailMs: number }

export type PressureEvent = {
  kind: 'build-fail' | 'test-fail' | 'green' | 're-edit' | 'correction' | 'test-integrity'
  delta: number
  detail: string
  atMs: number
}

export type Pressure = {
  score: number
  updatedMs: number
  red: boolean
  events: PressureEvent[]
  editedAfterFail: string[]
}

export type PixelCityWeather = 'clear' | 'storm' | 'rainbow'

export type PixelCitySky = 'auto' | 'dawn' | 'day' | 'dusk' | 'night'

export type PixelCityView = 'city' | 'beach' | 'dino' | 'sunset'

export type PixelCityScene = {
  weather: PixelCityWeather
  sky: PixelCitySky
  isHidden: boolean
  rainbowUntil: number
  // Unset until /city picks a scene; the pixel_city_scene option applies until then.
  view?: PixelCityView
}

export type McpServerHealth = {
  server: string
  state: 'ok' | 'down'
  // An McpConnectRefusal, a probe verdict or a doctor classification; set on an 'ok' server only when it is outdated or its probe was refused ('unprobed').
  reason?: string
  // The connect refusal's own sentence, when there was one.
  message?: string
  // First lines of `dnp-roslyn version` / `doctor` output; never environment values.
  doctor?: string
  checkedMs: number
}

export type McpHealth = { servers: McpServerHealth[] }

declare module 'claude-code' {
  interface PluginState {
    'dotnet-pilot': { buildStreak: BuildStreak; pressure: Pressure; cityScene: PixelCityScene; mcpHealth: McpHealth }
  }
}
