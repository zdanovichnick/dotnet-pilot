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

declare module 'claude-code' {
  interface PluginState {
    'dotnet-pilot': { buildStreak: BuildStreak; pressure: Pressure; cityScene: PixelCityScene }
  }
}
