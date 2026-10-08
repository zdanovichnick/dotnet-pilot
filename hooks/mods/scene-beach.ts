import { celestial, hash, mix, sprite } from './pixel-canvas'
import type { Canvas, Light } from './pixel-canvas'

const PALM = ['..ff.ff..', '.f.fff.f.', 'f..cTc..f', '....T....']
const UMBRELLA = ['rwrwr', '.rwr.', '..p..', '..p..']
const BOAT = ['.s', 'ss', 'hhh']

export const beach = (c: Canvas, l: Light) => {
  const { W, H } = c
  const { frame, daylight, isStorm } = l
  const horizon = Math.floor(H * 0.5)
  const shore = H - 2

  let deep = mix(mix(0x081634, 0x1d64ad, daylight), l.bottom, 0.2)
  let shallow = mix(mix(0x0e3350, 0x35b3c4, daylight), l.bottom, 0.15)
  if (isStorm) {
    deep = mix(deep, 0x1e2733, 0.6)
    shallow = mix(shallow, 0x34404c, 0.6)
  }

  const surf = 0.03 + l.energy * 0.08 + (isStorm ? 0.2 : 0)
  for (let y = horizon; y < shore; y++) {
    const depth = (y - horizon) / Math.max(1, shore - horizon - 1)
    const water = mix(deep, shallow, depth)
    const drift = Math.floor(frame * (0.25 + depth * 0.5))
    for (let x = 0; x < W; x++) {
      c.set(x, y, water)
      if (hash(x + drift, y, 42) < surf) c.blend(x, y, 0xf2fbff, 0.3 + depth * 0.3)
    }
  }

  if (!isStorm) {
    const body = celestial(l.hour, W, H)
    if (body.y < horizon + 1) {
      for (let y = horizon; y < shore; y++) {
        for (let dx = -1; dx <= 2; dx++) {
          if (hash(body.x + dx, y, Math.floor(frame / 2)) < 0.55) c.blend(body.x + dx, y, body.color, body.isSun ? 0.55 : 0.4)
        }
      }
    }
    const boat = Math.floor(((hash(3, 44) * (W + 8) + frame * 0.04) % (W + 8)) - 4)
    sprite(c, BOAT, boat, horizon - 2, { s: mix(0x9aa3b5, 0xffffff, daylight), h: mix(0x2a1d14, 0x7a4a2a, daylight) })
  }

  // The swash runs up and back over the wet sand on a slow sine; storms push it further.
  const swash = (Math.sin(frame * 0.07) + 1) / 2
  const sand = mix(0x3d3226, 0xeed6a0, daylight)
  const wet = mix(sand, 0x6b5a40, 0.45)
  for (let x = 0; x < W; x++) {
    for (let y = shore; y < H; y++) c.set(x, y, hash(x, y, 44) < 0.12 ? mix(sand, 0x000000, 0.18) : sand)
    c.set(x, shore, wet)
    if (hash(x, Math.floor(frame / 4), 43) < swash * 0.75 + (isStorm ? 0.2 : 0)) c.blend(x, shore, 0xf4fbff, 0.75)
    if (hash(x, Math.floor(frame / 3), 45) < 0.12) c.blend(x, shore - 1, 0xf4fbff, 0.45)
  }

  if (W >= 28) {
    const sway = frame % 24 < 12 || isStorm ? 0 : 1
    const trunk = mix(0x3b2a1a, 0x8a5a32, daylight)
    const px = W - 10
    const top = 3
    for (let y = shore; y >= top; y--) c.set(px + Math.floor((shore - y) / 3), y, trunk)
    // The crown's 'T' column sits on the trunk's last pixel.
    const crown = px + Math.floor((shore - top) / 3) - 4
    sprite(c, PALM, crown + (isStorm ? frame % 2 : 0), top - 3 + sway, {
      f: mix(0x0d2a17, 0x2f9a45, daylight),
      c: mix(0x2a1d10, 0x6b4423, daylight),
      T: trunk,
    })
  }

  if (W >= 20 && !isStorm) {
    sprite(c, UMBRELLA, Math.floor(W * 0.18), shore - 3, {
      r: mix(0x5a1a1e, 0xe63946, daylight),
      w: mix(0x5a5a62, 0xf5f5f5, daylight),
      p: mix(0x3a3a3a, 0xd0d0d0, daylight),
    })
  }

  const crab = Math.floor(W * 0.42 + Math.sin(frame * 0.04) * W * 0.12)
  const claws = frame % 8 < 4
  const red = mix(0x7a1f16, 0xe8442e, daylight)
  c.set(crab, H - 1, red)
  c.set(crab + 1, H - 1, red)
  c.set(claws ? crab - 1 : crab + 2, H - 2, red)
}
