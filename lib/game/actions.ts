/**
 * Qué hace cada botón del rombo — lógica PURA sobre el mundo (sin DOM ni cámara), para que la use
 * igual el jugador local (`match.ts`) y el invitado remoto de una sala 2P (el host la aplica por él).
 *
 *  CON la pelota (ataque):  PASE · PASE FUERTE · TIRO · TIRO FUERTE (súper tiro con estrella).
 *  SIN la pelota (defensa): QUITAR · QUITAR FUERTE (barrida) · jugador a la izquierda · a la derecha.
 * El pad (`pad`, ángulo en el mundo, o null si está suelto) es la dirección del tiro y apunta el pase.
 */
import { assistAim, bestPassTarget, findSkater, kick, passSpeedFor, powerFromFlick, tackle } from "../engine"
import type { Side, World } from "../engine"

export type ButtonAction = "pase" | "pase-fuerte" | "tiro" | "tiro-fuerte"

export interface ButtonResult {
  /** El pase/tiro fue a un compañero: el control salta a él mientras la pelota vuela. */
  lockReceiverId?: string
  /** Botón de cambio de jugador: a quién pasa el control. */
  switchTo?: string
  /** El tiro salió como súper tiro (para el flash de neón del botón). */
  superShot?: boolean
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Potencia fija por botón (sin medidor: apretar = patear ya). */
export const BTN_POWER: Record<ButtonAction, number> = { "pase": 0.45, "pase-fuerte": 1, "tiro": 0.6, "tiro-fuerte": 1 }

/** Compañero más alineado con `angle` (cono de ±35°), o null. Prefiere el más cercano a igual ángulo. */
export function teammateInCone(w: World, shooterId: string, angle: number): string | null {
  const me = findSkater(w, shooterId)
  if (!me) return null
  const HALF = 0.61
  let best: string | null = null
  let bestScore = Infinity
  for (const t of w.skaters) {
    if (t.side !== me.side || t.id === me.id) continue
    let d = Math.atan2(t.y - me.y, t.x - me.x) - angle
    d = Math.atan2(Math.sin(d), Math.cos(d))
    if (Math.abs(d) > HALF) continue
    const score = Math.abs(d) + Math.hypot(t.x - me.x, t.y - me.y) * 0.02
    if (score < bestScore) { bestScore = score; best = t.id }
  }
  return best
}

/** Cambio de jugador hacia un costado (dir -1 = izquierda, +1 = derecha): el compañero más cercano que
 *  esté de ese lado; si no hay, da la vuelta al más lejano del otro. La orientación de la cancha es la
 *  misma para todos, así que "izquierda/derecha" de pantalla es el eje x del mundo. */
export function switchTarget(w: World, side: Side, currentId: string | null, dir: -1 | 1): string | null {
  const cur = currentId ? findSkater(w, currentId) : undefined
  if (!cur) return null
  let best: string | null = null
  let bestD = Infinity
  let wrap: string | null = null
  let wrapX = -dir * Infinity
  for (const t of w.skaters) {
    if (t.side !== side || t.id === cur.id) continue
    if ((t.x - cur.x) * dir > 0) {
      const d = Math.hypot(t.x - cur.x, t.y - cur.y)
      if (d < bestD) { bestD = d; best = t.id }
    }
    if ((t.x - wrapX) * -dir > 0 || wrap === null) { wrapX = t.x; wrap = t.id }
  }
  return best ?? wrap
}

export function performButton(w: World, side: Side, controlledId: string | null, action: ButtonAction, power: number, pad: number | null): ButtonResult {
  const cid = w.puck.carrierId
  const s = cid ? findSkater(w, cid) : undefined
  const out: ButtonResult = {}

  if (!s || s.side !== side) {
    // DEFENSA
    const me = controlledId ? findSkater(w, controlledId) : undefined
    if (action === "pase") { if (me) tackle(w, me.id, false) }
    else if (action === "pase-fuerte") { if (me) tackle(w, me.id, true) }
    else {
      const to = switchTarget(w, side, controlledId, action === "tiro" ? -1 : 1)
      if (to) out.switchTo = to
    }
    return out
  }

  // ATAQUE
  const p = clamp01(power)
  if (action === "tiro") {
    const r = assistAim(w, s.id, pad ?? s.heading, powerFromFlick(1.2 + p * 4.8))
    if (kick(w, s.id, r.angle, r.speed) && r.target === "teammate" && r.targetId) out.lockReceiverId = r.targetId
  } else if (action === "tiro-fuerte") {
    // SIEMPRE apunta a rango de súper tiro; si el jugador tiene con qué pagarlo sale encendido, si no
    // `kick()` lo limita solo. El flash se decide mirando `puck.superShot` DESPUÉS de patear.
    const r = assistAim(w, s.id, pad ?? s.heading, powerFromFlick(4.2 + p * 1.8))
    const kicked = kick(w, s.id, r.angle, r.speed)
    if (kicked && r.target === "teammate" && r.targetId) out.lockReceiverId = r.targetId
    if (kicked && w.puck.superShot) out.superShot = true
  } else {
    const strong = action === "pase-fuerte"
    const tid = pad !== null ? teammateInCone(w, s.id, pad) : bestPassTarget(w, s.id)
    const t = tid ? findSkater(w, tid) : undefined
    if (!t) {
      // Pad apretado y nadie en esa dirección: pase al espacio, hacia donde apunta el pad.
      if (pad !== null) kick(w, s.id, pad, strong ? 20 : 12)
      return out
    }
    const flight = Math.min(0.8, Math.hypot(t.x - s.x, t.y - s.y) / 10)
    const tx = t.x + t.vx * flight
    const ty = t.y + t.vy * flight
    const base = passSpeedFor(Math.hypot(tx - s.x, ty - s.y))
    // fuerte: 1.4x-1.7x (siempre más difícil de cortar); normal: 0.7x-1.3x
    const speed = strong ? base * (1.4 + p * 0.3) : base * (0.7 + p * 0.6)
    if (kick(w, s.id, Math.atan2(ty - s.y, tx - s.x), speed)) out.lockReceiverId = t.id
  }
  return out
}
