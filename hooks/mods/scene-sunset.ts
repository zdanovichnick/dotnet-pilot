import { celestial, hash, mix, noise, smooth } from './pixel-canvas'
import type { Canvas, Light } from './pixel-canvas'

// A whole day passes in about 200 seconds of 200 ms frames, starting just before dawn.
const HOURS_PER_FRAME = 0.024
const START_HOUR = 5

export const timelapseHour = (frame: number) => (START_HOUR + frame * HOURS_PER_FRAME) % 24

export const sunset = (c: Canvas, l: Light) => {
  const { W, H } = c
  const { frame, daylight, night } = l
  const shore = H - 3

  const far = mix(l.bottom, 0x1a1030, 0.45 + night * 0.2)
  const near = mix(far, 0x05040a, 0.55)
  for (let x = 0; x < W; x++) {
    // Ridges fall away toward the middle, where the sun rises and sets.
    const valley = 0.25 + 0.75 * smooth(W * 0.04, W * 0.3, Math.abs(x - W / 2))
    const high = 1 + Math.floor(noise(x / 9, 62) * 4 * valley)
    for (let y = shore - high; y < shore; y++) c.set(x, y, far)
    const low = Math.floor(noise(x / 5, 63) * 2.5 * valley)
    for (let y = shore - low; y < shore; y++) c.set(x, y, near)
  }

  if (daylight > 0.25 && !l.isStorm) {
    for (let k = 0; k < 2; k++) {
      const bx = Math.floor(((hash(k, 64) * (W + 10) + frame * (0.3 + k * 0.1)) % (W + 10)) - 5)
      const by = 1 + k + Math.round(Math.sin(frame * 0.12 + k))
      const up = (frame + k * 3) % 6 < 3
      const ink = mix(0x2a2030, 0x1a1a1a, daylight)
      c.set(bx, by + (up ? 0 : 1), ink)
      c.set(bx + 1, by + (up ? 1 : 0), ink)
      c.set(bx + 2, by + (up ? 0 : 1), ink)
    }
  }

  // The lake mirrors the rows above the shore, darkened, with a ripple that shifts alternate rows.
  for (let y = shore; y < H; y++) {
    const mirror = 2 * shore - 1 - y
    const ripple = hash(y, Math.floor(frame / 3), 65) < 0.5 ? 1 : 0
    for (let x = 0; x < W; x++) c.set(x, y, mix(c.get(Math.min(W - 1, x + ripple), mirror), 0x061224, 0.35))
  }

  if (!l.isStorm) {
    const body = celestial(l.hour, W, H, true)
    for (let y = shore; y < H; y++) {
      for (let dx = -2; dx <= 3; dx++) {
        if (hash(body.x + dx, y, Math.floor(frame / 2)) < 0.5 - Math.abs(dx - 0.5) * 0.12) c.blend(body.x + dx, y, body.color, body.isSun ? 0.6 : 0.4)
      }
    }
  }
}
