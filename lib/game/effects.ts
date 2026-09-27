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

// ---------- estela de súper tiro ----------
export interface TrailPoint { x: number; y: number; bornAt: number }

/** Cuánta distancia (m) tiene que volar la pelota entre una marca y la siguiente: por distancia, no
 *  por cuadro, para no amontonar puntos si viene casi frenada. */
const TRAIL_SPACING = 0.3
const TRAIL_LIFE_MS = 600

/**
 * Estela de un súper tiro: las marcas que va dejando la pelota "encendida" en el piso mientras
 * vuela. Puramente cosmético — no vive en el motor (el súper tiro en sí es un booleano en `Puck`,
 * ver `world.ts`); esta clase solo recuerda por dónde pasó, para pintarlo, y se olvida sola.
 */
export class SuperTrail {
  private pts: TrailPoint[] = []
  private lastX: number | null = null
  private lastY: number | null = null

  /** Llamar en cada paso fijo mientras `puck.superShot && !puck.carrierId`. */
  mark(x: number, y: number, nowMs: number) {
    if (this.lastX !== null && this.lastY !== null && Math.hypot(x - this.lastX, y - this.lastY) < TRAIL_SPACING) return
    this.lastX = x
    this.lastY = y
    this.pts.push({ x, y, bornAt: nowMs })
    if (this.pts.length > 40) this.pts.shift()
  }

  /** Marcas vivas en este instante (ya filtra las vencidas). Para dibujar. */
  live(nowMs: number): TrailPoint[] {
    this.pts = this.pts.filter((p) => nowMs - p.bornAt < TRAIL_LIFE_MS)
    return this.pts
  }
}

/** Dibuja la estela: manchas achatadas que se apagan solas, más chicas cuanto más viejas. Se llama
 *  DENTRO del espacio de mundo (después de la cancha, antes de la pelota) para que quede pintada
 *  en el piso, no flotando sobre los patinadores. */
export function drawSuperTrail(ctx: CanvasRenderingContext2D, pts: TrailPoint[], nowMs: number) {
  if (pts.length === 0) return
  ctx.save()
  for (const p of pts) {
    const t = Math.min(1, (nowMs - p.bornAt) / TRAIL_LIFE_MS)
    const shrink = 1 - t * 0.5
    ctx.globalAlpha = (1 - t) * 0.5
    ctx.fillStyle = t < 0.4 ? "#fde68a" : "#f97316"
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.2 * shrink, 0.13 * shrink, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
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
