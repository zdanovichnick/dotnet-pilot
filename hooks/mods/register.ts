import type { Register } from 'claude-code'
import { registerAgents } from './agents'
import { registerBuildStatus } from './build-status'
import { registerDashboard } from './dashboard'
import { registerMcpHealth } from './mcp-health'
import { registerPixelCity, viewOf } from './pixel-city'
import { registerPressure } from './pressure'
import { registerCompose } from './routing'
import { registerSessionStart } from './session-start'
import { registerTurnComplete } from './turn-complete'

export const register: Register = (on, options) => {
  const pressure = options.pressure !== false
  const mcpHealth = options.mcp_health !== false
  const agents = options.agents !== false
  if (options.build_status !== false) registerBuildStatus(on)
  if (pressure) registerPressure(on, options.pressure_test_guard_block === true)
  if (mcpHealth) registerMcpHealth(on, { pressure })
  if (agents) registerAgents(on)
  registerSessionStart(on, { pressure, mcpHealth, agents })
  registerDashboard(on)
  const pixelCity = options.pixel_city === true
  registerPixelCity(on, { enabled: pixelCity, view: viewOf(options.pixel_city_scene) ?? 'city' })
  registerTurnComplete(on, { agents, pixelCity })
  registerCompose(on, { routing: options.routing !== false, pressure, mcpHealth })
}
