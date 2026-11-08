import type { Register } from 'claude-code'
import { registerBuildStatus } from './build-status'
import { registerMcpHealth } from './mcp-health'
import { registerPixelCity, viewOf } from './pixel-city'
import { registerPressure } from './pressure'
import { registerCompose } from './routing'
import { registerSessionStart } from './session-start'

export const register: Register = (on, options) => {
  const pressure = options.pressure !== false
  const mcpHealth = options.mcp_health !== false
  if (options.build_status !== false) registerBuildStatus(on)
  if (pressure) registerPressure(on, options.pressure_test_guard_block === true)
  if (mcpHealth) registerMcpHealth(on, { pressure })
  registerSessionStart(on, { pressure, mcpHealth })
  registerPixelCity(on, { enabled: options.pixel_city === true, view: viewOf(options.pixel_city_scene) ?? 'city' })
  registerCompose(on, { routing: options.routing !== false, pressure, mcpHealth })
}
