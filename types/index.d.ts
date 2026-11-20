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

export type DashboardTab = 'telemetry' | 'review' | 'architecture'

export type AgentRunStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'aborted'

export type AgentRun = {
  id: string
  type: string
  description: string
  status: AgentRunStatus
  startMs: number
  endMs?: number
  // Summed over the agent's turns; a resumed agent adds to it.
  durationMs: number
  model?: string
  effort?: string
  parentId?: string
  // The first [HALT …], [PARTIAL …] or [ROUTING: …] marker of its last answer, at most 200 characters.
  verdict?: string
  tokens: number
  usd?: number
}

// isPageOpen turns on the writes of dnp-agents.html; before /dnp-agents runs, runs are tracked in state only.
export type AgentRuns = { runs: AgentRun[]; isPageOpen: boolean }

declare module 'claude-code' {
  interface PluginState {
    'dotnet-pilot': {
      buildStreak: BuildStreak
      pressure: Pressure
      cityScene: PixelCityScene
      mcpHealth: McpHealth
      dashboardTab: Shaped<DashboardTab>
      agentRuns: AgentRuns
    }
  }
}
