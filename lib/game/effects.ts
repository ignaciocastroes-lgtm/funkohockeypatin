import { FIXED_DT } from "../engine"
import type { Goalie, Puck, Side, Skater, World } from "../engine"

// ---------- confeti ----------
interface ConfettiPiece {
  x: number; y: number
  vx: number; vy: number
  rot: number; vrot: number
  w: number; h: number
  color: string
  life: number
  maxLife: number
}

const GRAVITY = 520 // px/s^2, en espacio de pantalla (CSS px)

export class Confetti {
  private pieces: ConfettiPiece[] = []

  /** Lanza una tanda de confeti desde un punto de la pantalla (CSS px). */
  spawn(x: number, y: number, colors: string[], count = 90) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9
      const speed = 260 + Math.random() * 420
      const maxLife = 1.4 + Math.random() * 0.9
      this.pieces.push({
        x, y,
        vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.6),
        vy: Math.sin(a) * speed,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 12,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        life: 0,
        maxLife,
      })
    }
    if (this.pieces.length > 500) this.pieces.splice(0, this.pieces.length - 500)
  }

  get active(): boolean { return this.pieces.length > 0 }

  update(dt: number) {
    for (const p of this.pieces) {
      p.life += dt
      p.vy += GRAVITY * dt
      p.vx *= 1 - Math.min(1, dt * 0.6)
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
    }
    this.pieces = this.pieces.filter((p) => p.life < p.maxLife)
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (this.pieces.length === 0) return
    ctx.save()
    for (const p of this.pieces) {
      if (p.x < -20 || p.x > W + 20 || p.y > H + 20) continue
      const fadeIn = Math.min(1, p.life / 0.12)
      const fadeOut = Math.max(0, 1 - Math.max(0, p.life - p.maxLife * 0.7) / (p.maxLife * 0.3))
      ctx.globalAlpha = fadeIn * fadeOut
      ctx.fillStyle = p.color
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    ctx.restore()
  }

  clear() { this.pieces.length = 0 }
}

// ---------- pantallazo ----------
export interface Flash { color: string; startedAt: number; durationMs: number }

export function drawFlash(ctx: CanvasRenderingContext2D, flash: Flash, now: number, W: number, H: number) {
  const t = (now - flash.startedAt) / flash.durationMs
  if (t >= 1) return
  const alpha = 0.4 * (1 - t) ** 1.6
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = flash.color
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

// ---------- replay de gol (cámara lenta) ----------
export interface Snapshot {
  puck: Puck
  goalies: Goalie[]
  skaters: Skater[]
}

/** Copia superficial de lo que hace falta para redibujar la escena más tarde (posiciones/estado visual). */
export function captureSnapshot(w: World): Snapshot {
  return {
    puck: { ...w.puck },
    goalies: w.goalies.map((g) => ({ ...g })),
    skaters: w.skaters.map((s) => ({ ...s })),
  }
}

/** Buffer circular de las últimas `seconds` de snapshots, tomados a paso fijo de simulación. */
export class ReplayBuffer {
  private frames: Snapshot[] = []
  private readonly max: number
  constructor(seconds: number) { this.max = Math.max(1, Math.round(seconds / FIXED_DT)) }

  push(w: World) {
    this.frames.push(captureSnapshot(w))
    if (this.frames.length > this.max) this.frames.shift()
  }

  clear() { this.frames.length = 0 }

  /** Congela una copia del buffer actual para reproducirla (el buffer original sigue grabando). */
  freeze(): Snapshot[] { return this.frames.slice() }
}

export interface GoalReplay {
  frames: Snapshot[]
  scorerSide: Side
  startedAt: number
  /** <1 = cámara lenta. */
  speed: number
}

/** Punto de reproducción (interpolado) del replay en el instante `now`. `null` si ya terminó. */
export function replayFrameAt(r: GoalReplay, now: number): { prev: Snapshot; curr: Snapshot; alpha: number } | null {
  if (r.frames.length === 0) return null
  const recordedDuration = (r.frames.length - 1) * FIXED_DT
  const elapsed = Math.max(0, (now - r.startedAt) / 1000) * r.speed
  const t = Math.min(elapsed, recordedDuration)
  const posF = t / FIXED_DT
  const prevIdx = Math.min(r.frames.length - 1, Math.floor(posF))
  const currIdx = Math.min(r.frames.length - 1, prevIdx + 1)
  const alpha = posF - prevIdx
  return { prev: r.frames[prevIdx], curr: r.frames[currIdx], alpha }
}

/** Reconstruye un `World` "de mentira" con las posiciones grabadas, para reusar drawScene/drawHud tal cual.
 *  El llamador debe pasar el mismo `alpha` de `replayFrameAt` como `DrawOptions.alpha`: ahí es donde
 *  se interpola de verdad entre el frame `prev` y el `curr` (igual que hace drawScene en vivo). */
export function replayWorld(base: World, prev: Snapshot, curr: Snapshot): World {
  const byId = new Map(prev.skaters.map((s) => [s.id, s]))
  return {
    ...base,
    puck: { ...curr.puck, px: prev.puck.x, py: prev.puck.y },
    goalies: curr.goalies.map((g, i) => {
      const p = prev.goalies[i]
      return { ...g, px: p ? p.x : g.x, py: p ? p.y : g.y }
    }),
    skaters: curr.skaters.map((s) => {
      const p = byId.get(s.id)
      return { ...s, px: p ? p.x : s.x, py: p ? p.y : s.y }
    }),
  } as World
}
