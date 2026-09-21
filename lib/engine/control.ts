import type { Side, World } from "./types"

/**
 * Decide qué patinador maneja el humano de `side`.
 * - Si su equipo lleva el puck: el portador.
 * - Si no: el más cercano al punto donde estará el puck (así, cuando un pase llega,
 *   el control salta al receptor sin soltar el dedo). Con histéresis para no parpadear.
 */
export function selectControlled(w: World, side: Side, current: string | null): string | null {
  const p = w.puck
  if (p.carrierId) {
    const c = w.skaters.find((s) => s.id === p.carrierId)
    if (c && c.side === side) return c.id
  }
  const px = p.x + p.vx * 0.4
  const py = p.y + p.vy * 0.4
  let best: string | null = null
  let bestD = Infinity
  let curD = Infinity
  for (const s of w.skaters) {
    if (s.side !== side) continue
    const d = Math.hypot(s.x - px, s.y - py)
    if (d < bestD) { bestD = d; best = s.id }
    if (s.id === current) curD = d
  }
  if (current && curD <= bestD + 1.0) return current
  return best
}
