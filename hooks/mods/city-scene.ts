import { canvas, celestial, daylightAt, hash, mix } from './pixel-canvas'
import type { Canvas, Light, Rgb, SceneInput } from './pixel-canvas'
import { beach } from './scene-beach'
import { dino } from './scene-dino'
import { sunset } from './scene-sunset'

export { daylightAt, luminance, mix } from './pixel-canvas'
export type { SceneInput } from './pixel-canvas'

// Each terminal cell is an upper half block: foreground paints the top pixel,
// background the bottom one, so a band of `rows` cells is `rows * 2` pixels tall.
const HALF_BLOCK = 0x2580

export const LIT: readonly Rgb[] = [0xffcf6b, 0x5ef2ff, 0xff5ec8]

const SKY: readonly (readonly [number, Rgb, Rgb])[] = [
  [0, 0x070b1f, 0x141a46],
  [5, 0x0e1236, 0x2a2a66],
  [6.5, 0x4b3f8f, 0xff9466],
  [8, 0x3a86ff, 0x9fd4ff],
  [16.5, 0x3577d4, 0xaedcff],
  [18.5, 0x5b3591, 0xff7a59],
  [20, 0x1d1b52, 0x6b3466],
  [21.5, 0x070b1f, 0x141a46],
  [24, 0x070b1f, 0x141a46],
]

const RAINBOW: readonly Rgb[] = [0x9a4dff, 0x4db8ff, 0x4dff7a, 0xfff04d, 0xffa64d, 0xff4d4d]
const NEAR_NIGHT: readonly Rgb[] = [0x141726, 0x1a1d30, 0x1d1a2e, 0x15202a]
const NEAR_DAY: readonly Rgb[] = [0x4a5468, 0x565f78, 0x5d566e, 0x4b5f6b]
const CAR_BODIES: readonly Rgb[] = [0xe63946, 0xf1c40f, 0x2ecc71, 0xecf0f1]

const skyAt = (hour: number): readonly [Rgb, Rgb] => {
  const h = ((hour % 24) + 24) % 24
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, top0, bottom0] = SKY[i]!
    const [h1, top1, bottom1] = SKY[i + 1]!
    if (h >= h0 && h < h1) {
      const t = (h - h0) / (h1 - h0)
      return [mix(top0, top1, t), mix(bottom0, bottom1, t)]
    }
  }
  return [SKY[0]![1], SKY[0]![2]]
}

type Building = { x: number; w: number; h: number; tone: number; seed: number; hasAntenna: boolean }

const skylines = new Map<string, Building[]>()

const skyline = (columns: number, height: number, layer: number): Building[] => {
  const id = `${columns}:${height}:${layer}`
  const known = skylines.get(id)
  if (known !== undefined) return known

  const out: Building[] = []
  let x = -1 - Math.floor(hash(layer, 99) * 3)
  for (let i = 0; x < columns; i++) {
    const w = 3 + Math.floor(hash(layer, i, 1) * (layer === 0 ? 5 : 4))
    const span = layer === 0 ? height - 4 : height - 3
    const h = (layer === 0 ? 3 : 4) + Math.floor(hash(layer, i, 2) * span)
    out.push({ x, w, h, tone: Math.floor(hash(layer, i, 3) * 4), seed: i, hasAntenna: layer === 0 && h > height * 0.6 && hash(i, 4) > 0.45 })
    x += w + (layer === 0 && hash(layer, i, 5) > 0.7 ? 1 : 0)
  }
  skylines.set(id, out)
  return out
}

const backdrop = (c: Canvas, input: SceneInput, l: Light) => {
  const { W, H } = c
  const { weather, frame, cometAge } = input

  for (let y = 0; y < H; y++) {
    const row = mix(l.top, l.bottom, y / (H - 1))
    for (let x = 0; x < W; x++) c.px[y * W + x] = row
  }

  if (weather === 'rainbow') {
    const cx = W * 0.62
    const cy = H + 6
    const r0 = H + 1
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const color = RAINBOW[Math.floor(Math.hypot(x - cx, (y - cy) * 1.1) - r0)]
        if (color !== undefined) c.blend(x, y, color, 0.6)
      }
    }
  }

  if (l.night > 0.2 && !l.isStorm) {
    for (let y = 0; y < H - 3; y++) {
      for (let x = 0; x < W; x++) {
        if (hash(x, y, 7) >= 0.035) continue
        const twinkle = hash(x, y, Math.floor(frame / 3)) < 0.18 ? 0.45 : 1
        c.blend(x, y, 0xffffff, (l.night - 0.2) * 1.25 * twinkle)
      }
    }
  }

  if (!l.isStorm) {
    const body = celestial(l.hour, W, H, input.view === 'sunset')
    if (body.isSun) {
      for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2]] as const) c.blend(body.x + dx, body.y + dy, body.color, 0.35)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) c.set(body.x + dx, body.y + dy, body.color)
    } else {
      for (const [dx, dy] of [[0, 0], [0, 1], [1, 1]] as const) c.set(body.x + dx, body.y + dy, body.color)
      c.blend(body.x + 1, body.y, body.color, 0.25)
    }
  }

  if (cometAge >= 0) {
    const hx = Math.floor(W * 0.12 + cometAge * 1.6)
    const hy = 1 + Math.floor(cometAge * 0.1)
    const head = l.daylight > 0.5 ? 0xfff6d5 : 0xffffff
    c.set(hx, hy, head)
    for (let i = 1; i <= 6; i++) c.blend(hx - i, hy - Math.floor(i / 5), head, 0.75 - i * 0.11)
  }

  const cloudCount = Math.max(2, Math.floor(W / 24)) * (l.isStorm ? 2 : 1)
  const cloudColor = l.isStorm ? 0x4a4f5e : mix(mix(0x3a3f5c, 0xf5f7ff, l.daylight), l.bottom, 0.25)
  const lane = W + 10
  for (let i = 0; i < cloudCount; i++) {
    const speed = 0.04 + hash(i, 8) * 0.07
    const cx = Math.floor(((hash(i, 9) * lane + frame * speed) % lane) - 5)
    const cy = Math.floor(hash(i, 10) * (l.isStorm ? 2 : 3))
    const alpha = l.isStorm ? 0.9 : 0.35 + l.daylight * 0.5
    for (let dx = 1; dx <= 3; dx++) c.blend(cx + dx, cy, cloudColor, alpha)
    for (let dx = 0; dx <= 4; dx++) c.blend(cx + dx, cy + 1, cloudColor, alpha)
  }
}

const city = (c: Canvas, l: Light) => {
  const { W, H } = c
  const { frame, daylight, night, isStorm } = l
  const lane = W + 10

  const haze = mix(l.bottom, 0x000000, 0.35 + night * 0.25)
  for (const b of skyline(W, H, 1)) {
    for (let x = b.x; x < b.x + b.w; x++) {
      for (let y = H - 1 - b.h; y < H - 1; y++) c.set(x, y, haze)
    }
  }

  const litChance = 0.04 + night * 0.36 + l.energy * 0.5 + (isStorm ? 0.08 : 0)
  const glass = mix(0x262b45, 0x8fa3c4, daylight)
  for (const b of skyline(W, H, 0)) {
    const roof = H - 1 - b.h
    let wall = mix(NEAR_NIGHT[b.tone]!, NEAR_DAY[b.tone]!, daylight)
    if (isStorm) wall = mix(wall, 0x1b1e26, 0.4)
    for (let x = b.x; x < b.x + b.w; x++) {
      for (let y = roof; y < H - 1; y++) {
        const isWindow = b.w > 3 && x > b.x && x < b.x + b.w - 1 && (x - b.x) % 2 === 1 && y > roof && (y - roof) % 2 === 1
        if (!isWindow) {
          c.set(x, y, wall)
          continue
        }
        const flicker = hash(x, y, Math.floor(frame / 45 + hash(x, y, 3) * 9)) < 0.04
        const isLit = (hash(x, y, b.seed) < litChance) !== flicker
        const hue = hash(x, y, 11)
        const lit = hue < 0.15 ? LIT[1]! : hue < 0.22 ? LIT[2]! : LIT[0]!
        c.set(x, y, isLit ? mix(lit, glass, daylight * 0.6) : glass)
      }
    }
    if (b.hasAntenna) {
      const ax = b.x + Math.floor(b.w / 2)
      c.set(ax, roof - 1, 0x8a8fa3)
      const isOn = l.isWorking ? frame % 4 < 2 : frame % 20 < 2
      c.set(ax, roof - 2, isOn ? 0xff3b3b : 0x5a1a1a)
    }
  }

  const street = mix(0x101118, 0x2b2d36, daylight)
  for (let x = 0; x < W; x++) c.set(x, H - 1, street)
  const cars = Math.max(2, Math.floor(W / 28))
  for (let i = 0; i < cars; i++) {
    const dir = i % 2 === 0 ? 1 : -1
    const speed = 0.5 + hash(i, 21) * 0.7
    const pos = (hash(i, 22) * lane + frame * speed) % lane
    const x = Math.floor(dir === 1 ? pos - 5 : W + 5 - pos)
    if (night > 0.5) {
      c.set(x, H - 1, 0xfff3b0)
      c.set(x - dir, H - 1, 0xff4040)
    } else {
      const body = CAR_BODIES[i % CAR_BODIES.length]!
      c.set(x, H - 1, body)
      c.set(x - dir, H - 1, body)
    }
  }
}

const meteors = (c: Canvas, frame: number) => {
  for (let k = 0; k < 3; k++) {
    const age = (frame + k * 11) % 24
    const x0 = Math.floor(hash(Math.floor((frame + k * 11) / 24), k, 55) * c.W)
    const hx = x0 + Math.floor(age * 1.4)
    const hy = Math.floor(age * 0.45)
    if (hy > c.H - 3) continue
    c.set(hx, hy, 0xfff1c1)
    for (let i = 1; i <= 4; i++) c.blend(hx - i, hy - Math.round(i * 0.35), i < 2 ? 0xffa23a : 0xd9481f, 0.8 - i * 0.16)
  }
}

const storm = (c: Canvas, l: Light, flash: boolean, beat: number, hasMeteors: boolean) => {
  const { W, H } = c
  if (hasMeteors) {
    meteors(c, l.frame)
  } else {
    for (let x = 0; x < W; x++) {
      if (hash(x, 12) >= 0.3) continue
      const y = Math.floor(l.frame * 1.5 + hash(x, 13) * H * 3) % (H + 3)
      c.blend(x, y, 0x9db8ff, 0.7)
      c.blend(x, y - 1, 0x9db8ff, 0.35)
    }
  }
  if (flash) {
    let bx = Math.floor(hash(beat, 78) * W)
    for (let y = 0; y < H - 3; y++) {
      c.set(bx, y, 0xffffff)
      bx += hash(beat, y, 79) < 0.5 ? -1 : 1
    }
  }
}

const FOREGROUND = { city, beach, dino, sunset } as const

export const pixels = (input: SceneInput): Uint32Array => {
  const c = canvas(input.columns, input.rows * 2)
  const view = input.view ?? 'city'
  const isStorm = input.weather === 'storm'
  const beat = Math.floor(input.frame / 2)
  const flash = input.flash || (isStorm && hash(beat, 77) < 0.03)
  const daylight = daylightAt(input.hour)

  let [top, bottom] = skyAt(input.hour)
  if (isStorm) {
    top = mix(top, 0x1f232d, 0.7)
    bottom = mix(bottom, 0x3a3f4b, 0.7)
  }
  if (flash) {
    top = mix(top, 0xe8ecff, 0.65)
    bottom = mix(bottom, 0xe8ecff, 0.45)
  }

  const light: Light = {
    hour: input.hour,
    daylight,
    night: 1 - daylight,
    top,
    bottom,
    isStorm,
    frame: input.frame,
    energy: input.energy,
    isWorking: input.isWorking,
    travel: input.travel ?? input.frame * 0.8,
  }

  backdrop(c, input, light)
  FOREGROUND[view](c, light)
  // The dinosaurs get meteors where the other scenes get rain.
  if (isStorm) storm(c, light, flash, beat, view === 'dino')
  return c.px
}

export const encodeCells = (px: Uint32Array, columns: number, rows: number): string => {
  const bytes = new Uint8Array(columns * rows * 12)
  let at = 0
  const put = (word: number) => {
    bytes[at++] = word & 0xff
    bytes[at++] = (word >>> 8) & 0xff
    bytes[at++] = (word >>> 16) & 0xff
    bytes[at++] = (word >>> 24) & 0xff
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      put(HALF_BLOCK)
      put(px[2 * r * columns + c] ?? 0)
      put(px[(2 * r + 1) * columns + c] ?? 0)
    }
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export const paint = (input: SceneInput) => encodeCells(pixels(input), input.columns, input.rows)
