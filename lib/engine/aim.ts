import { GOAL, SKATER } from "./constants"
import { GOALS } from "./geometry"
import type { World } from "./types"

/** Cono (rad) alrededor de un compañero dentro del cual un deslizamiento se convierte en pase a él. */
export const PASS_CONE = 0.28
/** Cono (rad) alrededor de la boca de la portería para que un tiro "casi" se encuadre. */
export const GOAL_CONE = 0.2

export type AimTarget = "teammate" | "goal" | "free"
export interface AimResult {
  angle: number
  speed: number
  target: AimTarget
  targetId?: string
}

function angleDiff(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** Velocidad mínima para que un pase llegue a `dist` metros (con la fricción del puck). */
export function passSpeedFor(dist: number): number {
  return Math.min(22, Math.max(8, 7 + 0.55 * dist))
}

/**
 * Convierte la velocidad de un deslizamiento del dedo en velocidad de patada.
 * `vhPerSec` = velocidad del dedo en alturas-de-pantalla por segundo (independiente de la resolución).
 * ~1.2 = roce suave (pase corto), ~6+ = latigazo (tiro potente).
 */
export function powerFromFlick(vhPerSec: number): number {
  const t = Math.min(1, Math.max(0, (vhPerSec - 1.2) / (6 - 1.2)))
  return 9 + (SKATER.kickMaxSpeed - 2 - 9) * t
}

/**
 * Ayuda de puntería: pega el pase al compañero apuntado (con adelanto a donde va) y
 * encuadra en la portería los tiros que van "casi" a la boca. Respeta la esquina elegida.
 */
export function assistAim(w: World, shooterId: string, rawAngle: number, rawSpeed: number): AimResult {
  const s = w.skaters.find((k) => k.id === shooterId)
  if (!s) return { angle: rawAngle, speed: rawSpeed, target: "free" }

  // 1) compañero
  let bestId: string | undefined
  let bestDiff = PASS_CONE
  let bestAngle = rawAngle
  let bestDist = 0
  for (const t of w.skaters) {
    if (t.side !== s.side || t.id === s.id) continue
    const dist0 = Math.hypot(t.x - s.x, t.y - s.y)
    const flight = Math.min(0.8, dist0 / Math.max(rawSpeed, 6))
    const tx = t.x + t.vx * flight
    const ty = t.y + t.vy * flight
    const a = Math.atan2(ty - s.y, tx - s.x)
    // el dedo puede apuntar a donde el compañero ESTÁ o a donde VA: vale cualquiera de los dos
    const aNow = Math.atan2(t.y - s.y, t.x - s.x)
    const diff = Math.min(Math.abs(angleDiff(rawAngle, a)), Math.abs(angleDiff(rawAngle, aNow)))
    if (diff < bestDiff) { bestDiff = diff; bestId = t.id; bestAngle = a; bestDist = Math.hypot(tx - s.x, ty - s.y) }
  }

  // 2) portería rival
  const g = GOALS[s.side === 0 ? 1 : 0]
  const toGoal = Math.atan2(g.cy - s.y, g.lineX - s.x)
  const goalDiff = Math.abs(angleDiff(rawAngle, toGoal))
  const facingGoal = (g.lineX - s.x) * g.dir > 0

  if (bestId && !(facingGoal && goalDiff < bestDiff * 0.5)) {
    return { angle: bestAngle, speed: Math.max(rawSpeed, passSpeedFor(bestDist)), target: "teammate", targetId: bestId }
  }
  if (facingGoal && goalDiff < GOAL_CONE + 0.25) {
    // dónde cruza la línea de gol el tiro que dibujó el dedo
    const dx = g.lineX - s.x
    const yAtLine = s.y + Math.tan(rawAngle) * dx
    const half = GOAL.mouth / 2 + 0.6
    if (Math.abs(yAtLine - g.cy) <= half) {
      const aimY = Math.min(g.cy + GOAL.mouth / 2 - 0.3, Math.max(g.cy - GOAL.mouth / 2 + 0.3, yAtLine))
      return { angle: Math.atan2(aimY - s.y, dx), speed: rawSpeed, target: "goal" }
    }
  }
  return { angle: rawAngle, speed: rawSpeed, target: "free" }
}

/**
 * Para el "toque" sin deslizar: el mejor compañero para un pase automático.
 * Prefiere el que está adelante y libre de rivales en la línea de pase.
 */
export function bestPassTarget(w: World, shooterId: string): string | null {
  const s = w.skaters.find((k) => k.id === shooterId)
  if (!s) return null
  const fwd = Math.hypot(s.vx, s.vy) > 1 ? Math.atan2(s.vy, s.vx) : s.heading
  let best: string | null = null
  let bestScore = -Infinity
  for (const t of w.skaters) {
    if (t.side !== s.side || t.id === s.id) continue
    const dx = t.x - s.x
    const dy = t.y - s.y
    const dist = Math.hypot(dx, dy)
    if (dist < 1.5) continue
    const align = Math.cos(angleDiff(fwd, Math.atan2(dy, dx)))
    let open = 1
    for (const o of w.skaters) {
      if (o.side === s.side) continue
      // distancia del rival al segmento del pase
      const t2 = Math.max(0, Math.min(1, ((o.x - s.x) * dx + (o.y - s.y) * dy) / (dist * dist)))
      const d = Math.hypot(o.x - (s.x + dx * t2), o.y - (s.y + dy * t2))
      if (d < 1.4) { open = 0; break }
    }
    const score = align * 6 + open * 8 - Math.abs(dist - 12) * 0.25
    if (score > bestScore) { bestScore = score; best = t.id }
  }
  return best
}
