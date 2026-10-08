import { hash, mix, noise, sprite } from './pixel-canvas'
import type { Canvas, Light } from './pixel-canvas'

const DINO_BODY = ['....###', '....#o##', '#..###..', '.#####..']
const LEGS_RUN = ['.#..#...', '..##....'] as const
const LEGS_AIR = '.##.##..'
const CACTUS = ['.#.', '###', '.#.']
const PTERO = [['#...#', '.###.'], ['.....', '#####']] as const
const VOLCANO = ['...rr...', '..####..', '.######.', '########']

const SLOT = 18
const DINO_X = 5
// The jump starts this many pixels before a cactus and lands this many after it.
const TAKEOFF = 9
const LANDING = 3
const LIFT = 3

export const dinoLift = (travel: number) => {
  const reach = travel + DINO_X
  const first = Math.floor((reach - LANDING) / SLOT) - 1
  for (let i = first; i <= first + 2; i++) {
    if (hash(i, 54) >= 0.55) continue
    const d = i * SLOT + Math.floor(hash(i, 53) * 8) - reach
    if (d <= TAKEOFF && d >= -LANDING) return Math.round(Math.sin(Math.PI * ((TAKEOFF - d) / (TAKEOFF + LANDING))) * LIFT)
  }
  return 0
}

export const dino = (c: Canvas, l: Light) => {
  const { W, H } = c
  const { frame, daylight, night, travel } = l
  const ground = H - 2

  const mesa = mix(l.bottom, 0x1a0f08, 0.35 + night * 0.3)
  for (let x = 0; x < W; x++) {
    const height = 1 + Math.floor(noise((x + travel * 0.15) / 7, 61) * 3)
    for (let y = ground - height; y < ground; y++) c.set(x, y, mesa)
  }

  if (W >= 30) {
    const vx = Math.floor(W * 0.72)
    const vy = ground - VOLCANO.length
    const lava = night > 0.5 || l.isWorking ? 0xff5a1f : 0xc0391b
    sprite(c, VOLCANO, vx, vy, { '#': mix(mesa, 0x000000, 0.2), r: lava })
    for (let k = 0; k < 3; k++) {
      const rise = (frame * 0.08 + k * 1.7) % 5
      c.blend(vx + 3 + Math.round(Math.sin(frame * 0.05 + k) + rise * 0.4), vy - 1 - Math.floor(rise), 0x9a9aa0, 0.55 - rise * 0.1)
    }
  }

  const dirt = mix(0x3b2a1e, 0xd9a066, daylight)
  for (let x = 0; x < W; x++) {
    c.set(x, ground, mix(dirt, 0xffffff, 0.08))
    c.set(x, H - 1, hash(Math.floor(x + travel), 51) < 0.12 ? mix(dirt, 0x000000, 0.3) : dirt)
  }

  const cactus = mix(0x163d22, 0x3fa34d, daylight)
  const firstSlot = Math.floor(travel / SLOT) - 1
  for (let i = firstSlot; i <= firstSlot + Math.ceil(W / SLOT) + 1; i++) {
    if (hash(i, 54) >= 0.55) continue
    const sx = Math.floor(i * SLOT + hash(i, 53) * 8 - travel)
    sprite(c, CACTUS, sx - 1, ground - CACTUS.length, { '#': cactus })
  }

  if (W >= 40 && daylight > 0.2) {
    const span = W + 40
    const x = Math.floor(W - ((frame * 0.35) % span) + 10)
    const y = 1 + Math.round(Math.sin(frame * 0.1))
    sprite(c, PTERO[frame % 6 < 3 ? 0 : 1], x, y, { '#': mix(0x2a1a3a, 0x6b4a7a, daylight) })
  }

  const lift = dinoLift(travel)
  const skin = mix(0x5f8f5f, 0x4caf50, daylight)
  const top = ground - DINO_BODY.length - 1 - lift
  sprite(c, DINO_BODY, DINO_X, top, { '#': skin, o: 0xffffff })
  const legs = lift > 0 ? LEGS_AIR : LEGS_RUN[Math.floor(travel / 2) % 2]!
  sprite(c, [legs], DINO_X, top + DINO_BODY.length, { '#': skin })
}
