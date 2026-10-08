import type { Register } from 'claude-code'

import { registerBuildStatus } from './build-status'
import { registerPixelCity } from './pixel-city'
import { registerPressure } from './pressure'
import { registerCompose } from './routing'

export const register: Register = (on, options) => {
  const pressure = options.pressure !== false
  if (options.build_status !== false) registerBuildStatus(on)
  if (pressure) registerPressure(on, options.pressure_test_guard_block === true)
  if (options.pixel_city === true) registerPixelCity(on)
  registerCompose(on, { routing: options.routing !== false, pressure })
}
