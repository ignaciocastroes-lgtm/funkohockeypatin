import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, TeamAI, createWorld, drainEvents, stepWorld } from "../../lib/engine"
import { DemoDirector } from "../../lib/game/demo-director"
import { DemoTutor } from "../../lib/game/demo-tutor"

/** Simula un attract mode guionado: IA vs IA + `DemoDirector` empujando, exactamente como lo arma
 *  `match.ts` (director antes de `stepWorld`, tutor mirando los eventos que salen de ese paso).
 *  Devuelve cuántos segundos de simulación hicieron falta hasta que `DemoTutor` narró las 4. */
function timeToTeachAll(seed: number, maxSeconds = 40): number | null {
  const w = createWorld({ teamSize: 4 })
  const ai = new TeamAI({ seed, skill: [0.75, 0.75] })
  const tutor = new DemoTutor()
  const director = new DemoDirector()
  const n = Math.round(maxSeconds / FIXED_DT)
  for (let i = 0; i < n; i++) {
    const nowMs = i * FIXED_DT * 1000
    ai.update(w, null, FIXED_DT)
    director.step(w, (stage) => tutor.has(stage), nowMs)
    stepWorld(w, FIXED_DT)
    if (w.events.length) for (const ev of drainEvents(w)) tutor.onEvent(ev, nowMs)
    tutor.tick(nowMs)
    if (tutor.done) return (i + 1) * FIXED_DT
  }
  return null
}

test("DemoDirector: enseña las 4 lecciones bastante más rápido que dejarlo librado al azar", () => {
  // 15 semillas, no 5: el respaldo de emergencia de cada lección (`forceGolazo`/`forceDefenseSave`)
  // solo se activa en algunas — este rango es el que de verdad ejercita esos casos, no solo el
  // camino feliz. 35s es generoso a propósito (el caso típico anda por los 11-14s): lo que este
  // test cuida es que SIEMPRE termine, con margen, no perseguir el mejor tiempo posible.
  for (let seed = 1; seed <= 15; seed++) {
    const t = timeToTeachAll(seed)
    assert.ok(t !== null && t < 35, `semilla ${seed}: no completó las 4 lecciones a tiempo (${t})`)
  }
})

test("DemoDirector: sin director, las mismas 4 lecciones NO están garantizadas en el mismo lapso", () => {
  // Mismo escenario pero sin `DemoDirector` (solo IA + detector): sirve para mostrar que el director
  // realmente hace una diferencia, no que las 4 lecciones salían solas igual de rápido.
  function withoutDirector(seed: number, maxSeconds = 30): boolean {
    const w = createWorld({ teamSize: 4 })
    const ai = new TeamAI({ seed, skill: [0.75, 0.75] })
    const tutor = new DemoTutor()
    const n = Math.round(maxSeconds / FIXED_DT)
    for (let i = 0; i < n; i++) {
      const nowMs = i * FIXED_DT * 1000
      ai.update(w, null, FIXED_DT)
      stepWorld(w, FIXED_DT)
      if (w.events.length) for (const ev of drainEvents(w)) tutor.onEvent(ev, nowMs)
      tutor.tick(nowMs)
      if (tutor.done) return true
    }
    return false
  }
  const seeds = [1, 2, 3, 4, 5]
  const withoutOk = seeds.filter((s) => withoutDirector(s)).length
  assert.ok(withoutOk < seeds.length, "si el azar también las completa siempre en 30s, el director no está aportando nada medible")
})
