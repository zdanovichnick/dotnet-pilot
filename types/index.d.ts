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

declare module 'claude-code' {
  interface PluginState {
    'dotnet-pilot': { buildStreak: BuildStreak; pressure: Pressure }
  }
}
