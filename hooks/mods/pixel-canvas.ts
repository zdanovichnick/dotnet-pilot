import type { PixelCityView, PixelCityWeather } from '../../types'

export type Rgb = number

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
  view?: PixelCityView
  // Ground scrolled so far, in pixels; scenes that run (dino) read it, the rest ignore it.
  travel?: number
}

export type Canvas = {
  W: number
  H: number
  px: Uint32Array
  set: (x: number, y: number, c: Rgb) => void
  get: (x: number, y: number) => Rgb
  blend: (x: number, y: number, c: Rgb, t: number) => void
}

export type Light = {
  hour: number
  daylight: number
  night: number
  top: Rgb
  bottom: Rgb
  isStorm: boolean
  frame: number
  energy: number
  isWorking: boolean
  travel: number
}

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

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

export const hash = (...values: number[]) => {
  let h = 2166136261
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 16777619)
    h ^= h >>> 13
    h = Math.imul(h, 0x5bd1e995)
  }
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

export const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// Smooth 1-D value noise in [0, 1): ridgelines for mountains and mesas.
export const noise = (x: number, seed: number) => {
  const i = Math.floor(x)
  const f = x - i
  const t = f * f * (3 - 2 * f)
  return hash(i, seed) * (1 - t) + hash(i + 1, seed) * t
}

export const daylightAt = (hour: number) => smooth(5.5, 8, hour) * (1 - smooth(17, 20.5, hour))

export const canvas = (W: number, H: number): Canvas => {
  const px = new Uint32Array(W * H)
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H
  const get = (x: number, y: number) => px[y * W + x] ?? 0
  return {
    W,
    H,
    px,
    get,
    set: (x, y, c) => {
      if (inside(x, y)) px[y * W + x] = c
    },
    blend: (x, y, c, t) => {
      if (inside(x, y)) px[y * W + x] = mix(get(x, y), c, t)
    },
  }
}

// Sprites are rows of characters: '.' is empty, any other character a key into `colors`.
export const sprite = (c: Canvas, rows: readonly string[], x: number, y: number, colors: Record<string, Rgb>) => {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const color = colors[row[dx]!]
      if (color !== undefined) c.set(x + dx, y + dy, color)
    }
  })
}

// Where the sun (06:00–19:30) or the moon stands in a W × H sky, for scenes that reflect it.
// `isCentered` keeps the path to the middle third, so it rises and sets in a valley.
export const celestial = (hour: number, W: number, H: number, isCentered = false) => {
  const isSun = hour >= 6 && hour < 19.5
  const t = isSun ? (hour - 6) / 13.5 : clamp01(((((hour - 19.5) % 24) + 24) % 24) / 10.5)
  const arc = Math.sin(Math.PI * t)
  const x = isCentered ? Math.round(W / 2 - 1 + (t - 0.5) * W * 0.35) : Math.round(t * (W - 2))
  return { x, y: Math.round(H - 3 - arc * (H - 4)), isSun, color: isSun ? mix(0xff8c42, 0xfff1a8, arc) : 0xf2efd8 }
}
