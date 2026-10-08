import type { PixelCityWeather } from '../../types'

export type SceneInput = {
  columns: number
  rows: number
  hour: number
  frame: number
  weather: PixelCityWeather
  energy: number
  isWorking: boolean
  cometAge: number
  flash: boolean
}

type Rgb = number

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

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = clamp01(t)
  const channel = (shift: number) => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * k) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

export const luminance = (c: Rgb) =>
  0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)

const hash = (...values: number[]) => {
  let h = 2166136261
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 16777619)
    h ^= h >>> 13
    h = Math.imul(h, 0x5bd1e995)
  }
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export const daylightAt = (hour: number) => smooth(5.5, 8, hour) * (1 - smooth(17, 20.5, hour))

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

export const pixels = (input: SceneInput): Uint32Array => {
  const { columns: W, rows, hour, frame, weather, energy, isWorking, cometAge } = input
  const H = rows * 2
  const px = new Uint32Array(W * H)
  const daylight = daylightAt(hour)
  const night = 1 - daylight
  const isStorm = weather === 'storm'
  const stormBeat = Math.floor(frame / 2)
  const flash = input.flash || (isStorm && hash(stormBeat, 77) < 0.03)

  const set = (x: number, y: number, c: Rgb) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c
  }
  const get = (x: number, y: number) => px[y * W + x] ?? 0
  const blend = (x: number, y: number, c: Rgb, t: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) set(x, y, mix(get(x, y), c, t))
  }

  let [top, bottom] = skyAt(hour)
  if (isStorm) {
    top = mix(top, 0x1f232d, 0.7)
    bottom = mix(bottom, 0x3a3f4b, 0.7)
  }
  if (flash) {
    top = mix(top, 0xe8ecff, 0.65)
    bottom = mix(bottom, 0xe8ecff, 0.45)
  }
  for (let y = 0; y < H; y++) {
    const c = mix(top, bottom, y / (H - 1))
    for (let x = 0; x < W; x++) px[y * W + x] = c
  }

  if (weather === 'rainbow') {
    const cx = W * 0.62
    const cy = H + 6
    const r0 = H + 1
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const band = Math.floor(Math.hypot(x - cx, (y - cy) * 1.1) - r0)
        const color = RAINBOW[band]
        if (color !== undefined) blend(x, y, color, 0.6)
      }
    }
  }

  if (night > 0.2 && !isStorm) {
    for (let y = 0; y < H - 3; y++) {
      for (let x = 0; x < W; x++) {
        if (hash(x, y, 7) >= 0.035) continue
        const twinkle = hash(x, y, Math.floor(frame / 3)) < 0.18 ? 0.45 : 1
        blend(x, y, 0xffffff, (night - 0.2) * 1.25 * twinkle)
      }
    }
  }

  if (!isStorm) {
    if (hour >= 6 && hour < 19.5) {
      const t = (hour - 6) / 13.5
      const arc = Math.sin(Math.PI * t)
      const sx = Math.round(t * (W - 2))
      const sy = Math.round(H - 3 - arc * (H - 4))
      const sun = mix(0xff8c42, 0xfff1a8, arc)
      for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2]] as const) blend(sx + dx, sy + dy, sun, 0.35)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) set(sx + dx, sy + dy, sun)
    } else {
      const t = (((hour - 19.5) % 24) + 24) % 24 / 10.5
      const arc = Math.sin(Math.PI * clamp01(t))
      const mx = Math.round(clamp01(t) * (W - 2))
      const my = Math.round(H - 3 - arc * (H - 4))
      for (const [dx, dy] of [[0, 0], [0, 1], [1, 1]] as const) set(mx + dx, my + dy, 0xf2efd8)
      blend(mx + 1, my, 0xf2efd8, 0.25)
    }
  }

  if (cometAge >= 0) {
    const hx = Math.floor(W * 0.12 + cometAge * 1.6)
    const hy = 1 + Math.floor(cometAge * 0.1)
    const head = daylight > 0.5 ? 0xfff6d5 : 0xffffff
    set(hx, hy, head)
    for (let i = 1; i <= 6; i++) blend(hx - i, hy - Math.floor(i / 5), head, 0.75 - i * 0.11)
  }

  const cloudCount = Math.max(2, Math.floor(W / 24)) * (isStorm ? 2 : 1)
  const cloudColor = isStorm ? 0x4a4f5e : mix(mix(0x3a3f5c, 0xf5f7ff, daylight), bottom, 0.25)
  const lane = W + 10
  for (let i = 0; i < cloudCount; i++) {
    const speed = 0.04 + hash(i, 8) * 0.07
    const cx = Math.floor(((hash(i, 9) * lane + frame * speed) % lane) - 5)
    const cy = Math.floor(hash(i, 10) * (isStorm ? 2 : 3))
    const alpha = isStorm ? 0.9 : 0.35 + daylight * 0.5
    for (let dx = 1; dx <= 3; dx++) blend(cx + dx, cy, cloudColor, alpha)
    for (let dx = 0; dx <= 4; dx++) blend(cx + dx, cy + 1, cloudColor, alpha)
  }

  const haze = mix(bottom, 0x000000, 0.35 + night * 0.25)
  for (const b of skyline(W, H, 1)) {
    for (let x = b.x; x < b.x + b.w; x++) {
      for (let y = H - 1 - b.h; y < H - 1; y++) set(x, y, haze)
    }
  }

  const litChance = 0.04 + night * 0.36 + energy * 0.5 + (isStorm ? 0.08 : 0)
  const glass = mix(0x262b45, 0x8fa3c4, daylight)
  for (const b of skyline(W, H, 0)) {
    const roof = H - 1 - b.h
    let wall = mix(NEAR_NIGHT[b.tone]!, NEAR_DAY[b.tone]!, daylight)
    if (isStorm) wall = mix(wall, 0x1b1e26, 0.4)
    for (let x = b.x; x < b.x + b.w; x++) {
      for (let y = roof; y < H - 1; y++) {
        const isWindow = b.w > 3 && x > b.x && x < b.x + b.w - 1 && (x - b.x) % 2 === 1 && y > roof && (y - roof) % 2 === 1
        if (!isWindow) {
          set(x, y, wall)
          continue
        }
        const flicker = hash(x, y, Math.floor(frame / 45 + hash(x, y, 3) * 9)) < 0.04
        const isLit = (hash(x, y, b.seed) < litChance) !== flicker
        const hue = hash(x, y, 11)
        const lit = hue < 0.15 ? LIT[1]! : hue < 0.22 ? LIT[2]! : LIT[0]!
        set(x, y, isLit ? mix(lit, glass, daylight * 0.6) : glass)
      }
    }
    if (b.hasAntenna) {
      const ax = b.x + Math.floor(b.w / 2)
      set(ax, roof - 1, 0x8a8fa3)
      const isOn = isWorking ? frame % 4 < 2 : frame % 20 < 2
      set(ax, roof - 2, isOn ? 0xff3b3b : 0x5a1a1a)
    }
  }

  const street = mix(0x101118, 0x2b2d36, daylight)
  for (let x = 0; x < W; x++) set(x, H - 1, street)
  const cars = Math.max(2, Math.floor(W / 28))
  for (let i = 0; i < cars; i++) {
    const dir = i % 2 === 0 ? 1 : -1
    const speed = 0.5 + hash(i, 21) * 0.7
    const pos = (hash(i, 22) * lane + frame * speed) % lane
    const x = Math.floor(dir === 1 ? pos - 5 : W + 5 - pos)
    if (night > 0.5) {
      set(x, H - 1, 0xfff3b0)
      set(x - dir, H - 1, 0xff4040)
    } else {
      const body = CAR_BODIES[i % CAR_BODIES.length]!
      set(x, H - 1, body)
      set(x - dir, H - 1, body)
    }
  }

  if (isStorm) {
    for (let x = 0; x < W; x++) {
      if (hash(x, 12) >= 0.3) continue
      const y = Math.floor(frame * 1.5 + hash(x, 13) * H * 3) % (H + 3)
      blend(x, y, 0x9db8ff, 0.7)
      blend(x, y - 1, 0x9db8ff, 0.35)
    }
    if (flash) {
      let bx = Math.floor(hash(stormBeat, 78) * W)
      for (let y = 0; y < H - 3; y++) {
        set(bx, y, 0xffffff)
        bx += hash(stormBeat, y, 79) < 0.5 ? -1 : 1
      }
    }
  }

  return px
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
