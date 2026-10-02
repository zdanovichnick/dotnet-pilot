import type { Register } from 'claude-code'

import { registerBuildStatus } from './build-status'
import { registerRouting } from './routing'

export const register: Register = (on, options) => {
  if (options.build_status !== false) registerBuildStatus(on)
  if (options.routing !== false) registerRouting(on)
}
