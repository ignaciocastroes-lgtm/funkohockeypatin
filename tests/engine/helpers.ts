import { FIXED_DT, createWorld, stepWorld, GOALS, RINK } from "../../lib/engine"
import type { World, WorldConfig, GameEvent } from "../../lib/engine"

export function makeWorld(cfg: WorldConfig = {}): World {
  return createWorld({ goalies: false, ...cfg })
}

/** Avanza `seconds` de simulación (pasos fijos). Devuelve todos los eventos ocurridos. */
export function run(w: World, seconds: number, each?: (w: World) => void | boolean): GameEvent[] {
  const out: GameEvent[] = []
  const n = Math.round(seconds / FIXED_DT)
  for (let i = 0; i < n; i++) {
    stepWorld(w, FIXED_DT)
    if (w.events.length) { out.push(...w.events); w.events.length = 0 }
    if (each && each(w) === true) break
  }
  return out
}

/** Mueve a todos los patinadores lejos (esquinas) salvo los indicados, para aislar un escenario. */
export function parkOthers(w: World, keep: string[]) {
  let k = 0
  for (const s of w.skaters) {
    if (keep.includes(s.id)) continue
    s.x = 5 + (k % 4) * 9
    s.y = k % 2 === 0 ? 1.5 : RINK.width - 1.5
    s.px = s.x; s.py = s.y
    s.vx = 0; s.vy = 0
    k++
  }
}

export function place(w: World, id: string, x: number, y: number, vx = 0, vy = 0) {
  const s = w.skaters.find((q) => q.id === id)!
  s.x = x; s.y = y; s.px = x; s.py = y; s.vx = vx; s.vy = vy
  return s
}

export function shootPuck(w: World, x: number, y: number, vx: number, vy: number) {
  const p = w.puck
  p.x = x; p.y = y; p.px = x; p.py = y; p.vx = vx; p.vy = vy
  p.carrierId = null
}

/** Generador pseudoaleatorio determinista. */
export function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export { GOALS, RINK }

/**
 * Mundo 1v1 sin porteros con los dos patinadores estacionados fuera del camino y sin poder
 * recoger el puck: sirve para probar solo la física del puck (goles, vallas, fricción).
 */
export function cleanWorld(cfg: WorldConfig = {}): World {
  const w = makeWorld({ teamSize: 1, ...cfg })
  place(w, "L1", 18, 19.2)
  place(w, "V1", 22, 19.2)
  for (const s of w.skaters) s.pickupCooldown = 1e9
  return w
}
