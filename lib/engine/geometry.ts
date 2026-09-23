import { GOAL, RINK } from "./constants"
import type { Side } from "./types"

export interface Contact {
  /** Normal unitaria apuntando HACIA el objeto que choca (fuera de la pared). */
  nx: number
  ny: number
  /** Penetración (m). */
  pen: number
  kind: "board" | "post" | "net"
}

export interface GoalGeom {
  /** Quién defiende esta portería. */
  side: Side
  lineX: number
  cy: number
  /** Dirección hacia afuera de la pista (hacia la red): -1 izquierda, +1 derecha. */
  dir: 1 | -1
  yMin: number
  yMax: number
  backX: number
}

function makeGoal(side: Side): GoalGeom {
  const cy = RINK.width / 2
  const lineX = side === 0 ? GOAL.lineInset : RINK.length - GOAL.lineInset
  const dir: 1 | -1 = side === 0 ? -1 : 1
  return {
    side,
    lineX,
    cy,
    dir,
    yMin: cy - GOAL.mouth / 2,
    yMax: cy + GOAL.mouth / 2,
    backX: lineX + dir * GOAL.depth,
  }
}

export const GOALS: [GoalGeom, GoalGeom] = [makeGoal(0), makeGoal(1)]

/** Contacto círculo (x,y,r) contra las vallas con esquinas redondeadas. */
export function boardContact(x: number, y: number, r: number): Contact | null {
  const L = RINK.length
  const W = RINK.width
  const R = RINK.cornerRadius
  let cx = -1
  let cy = -1
  let corner = false
  if (x < R && y < R) { cx = R; cy = R; corner = true }
  else if (x > L - R && y < R) { cx = L - R; cy = R; corner = true }
  else if (x < R && y > W - R) { cx = R; cy = W - R; corner = true }
  else if (x > L - R && y > W - R) { cx = L - R; cy = W - R; corner = true }

  if (corner) {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy)
    const lim = R - r
    if (d > lim && d > 1e-9) return { nx: -dx / d, ny: -dy / d, pen: d - lim, kind: "board" }
    return null
  }
  if (x - r < 0) return { nx: 1, ny: 0, pen: r - x, kind: "board" }
  if (x + r > L) return { nx: -1, ny: 0, pen: x + r - L, kind: "board" }
  if (y - r < 0) return { nx: 0, ny: 1, pen: r - y, kind: "board" }
  if (y + r > W) return { nx: 0, ny: -1, pen: y + r - W, kind: "board" }
  return null
}

export function circleContact(
  x: number, y: number, r: number,
  cx: number, cy: number, cr: number,
  kind: Contact["kind"],
): Contact | null {
  const dx = x - cx
  const dy = y - cy
  const d = Math.hypot(dx, dy)
  const R = r + cr
  if (d >= R) return null
  if (d < 1e-9) return { nx: 1, ny: 0, pen: R, kind }
  return { nx: dx / d, ny: dy / d, pen: R - d, kind }
}

export function segmentContact(
  x: number, y: number, r: number,
  ax: number, ay: number, bx: number, by: number,
  thickness: number,
  kind: Contact["kind"],
): Contact | null {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + abx * t
  const qy = ay + aby * t
  const dx = x - qx
  const dy = y - qy
  const d = Math.hypot(dx, dy)
  const R = r + thickness
  if (d >= R) return null
  if (d < 1e-9) {
    const len = Math.sqrt(len2) || 1
    return { nx: -aby / len, ny: abx / len, pen: R, kind }
  }
  return { nx: dx / d, ny: dy / d, pen: R - d, kind }
}

/** Radio (m) de la "zona de crease" frente a cada portería en la que ningún patinador puede pararse:
 *  obliga a tirar desde fuera, no a quemarropa parado en la boca del arco. El portero NO se ve
 *  afectado (vive dentro de esa zona a propósito). */
export const CREASE_RADIUS = 1.75

/**
 * Reúne los contactos estáticos (vallas, postes, red) de un círculo.
 * `solidMouth`: true para patinadores/porteros (no pueden entrar a la red); false para el puck.
 * `creaseBlock`: true SOLO para patinadores (no porteros): además, no pueden pararse dentro
 * del semicírculo de la portería (evita el tiro a quemarropa parado en la boca del arco).
 */
export function collectContacts(x: number, y: number, r: number, solidMouth: boolean, out: Contact[], creaseBlock = false): Contact[] {
  out.length = 0
  const b = boardContact(x, y, r)
  if (b) out.push(b)
  for (const g of GOALS) {
    if (Math.abs(x - g.lineX) > GOAL.depth + r + 1) continue
    let c = circleContact(x, y, r, g.lineX, g.yMin, GOAL.postRadius, "post")
    if (c) out.push(c)
    c = circleContact(x, y, r, g.lineX, g.yMax, GOAL.postRadius, "post")
    if (c) out.push(c)
    const th = GOAL.wallThickness
    c = segmentContact(x, y, r, g.backX, g.yMin, g.backX, g.yMax, th, "net")
    if (c) out.push(c)
    c = segmentContact(x, y, r, g.lineX, g.yMin, g.backX, g.yMin, th, "net")
    if (c) out.push(c)
    c = segmentContact(x, y, r, g.lineX, g.yMax, g.backX, g.yMax, th, "net")
    if (c) out.push(c)
    if (solidMouth) {
      c = segmentContact(x, y, r, g.lineX, g.yMin, g.lineX, g.yMax, th, "net")
      if (c) out.push(c)
    }
    if (creaseBlock) {
      c = circleContact(x, y, r, g.lineX, g.cy, CREASE_RADIUS, "net")
      if (c) out.push(c)
    }
  }
  return out
}
