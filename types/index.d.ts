export type BuildStreak = { count: number; lastFailMs: number }

declare module 'claude-code' {
  interface PluginState {
    'dotnet-pilot': { buildStreak: BuildStreak }
  }
}
