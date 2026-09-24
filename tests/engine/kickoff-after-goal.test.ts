import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, MATCH, TeamAI, drainEvents, findSkater, kick, stepWorld, passSpeedFor, teammateAtPoint } from "../../lib/engine"
import type { World } from "../../lib/engine"
import { makeWorld, run, shootPuck } from "./helpers"

/** Mete un gol en la portería del lado `defending` y deja correr hasta que se reanuda el juego. */
function concede(w: World, defending: 0 | 1) {
  const x = defending === 0 ? 4 : 36
  shootPuck(w, x, 10, defending === 0 ? -26 : 26, 0)
  run(w, 3, (q) => q.phase === "goal")
  assert.equal(w.phase, "goal", "el gol se marcó")
  run(w, MATCH.goalPause + 0.4)
  assert.equal(w.phase, "play", "el juego se reanudó")
}

test("saque inicial del partido: la pelota es de nadie (neutral), no de un equipo", () => {
  const w = makeWorld()
  assert.equal(w.puck.carrierId, null)
})

test("si TE hacen el gol (equipo humano, lado 0), sacás vos con la pelota en el centro", () => {
  const w = makeWorld()
  concede(w, 0)
  assert.equal(w.score[1], 1)
  const carrier = findSkater(w, w.puck.carrierId)
  assert.ok(carrier, "alguien lleva la pelota")
  assert.equal(carrier!.side, 0, "la lleva el equipo que recibió el gol")
  assert.ok(Math.abs(w.puck.x - 20) < 2.5 && Math.abs(w.puck.y - 10) < 2.5, "sale desde el centro de la pista")
})

test("si le hacen el gol al rival (lado 1), saca el rival — y solo esa vez", () => {
  const w = makeWorld()
  concede(w, 1)
  assert.equal(findSkater(w, w.puck.carrierId)!.side, 1)
  assert.equal(w.nextKickoffSide, null, "el derecho de saque se consume: no se repite")
})

test("en el primer instante del saque el humano YA puede pasar, y el compañero la recibe", () => {
  const w = makeWorld()
  concede(w, 0)
  const from = findSkater(w, w.puck.carrierId)!
  const to = w.skaters.find((s) => s.side === 0 && s.id !== from.id)!
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  assert.ok(kick(w, from.id, Math.atan2(to.y - from.y, to.x - from.x), passSpeedFor(d)), "el pase sale sin esperar")
  run(w, 2.5, (q) => q.puck.carrierId !== null)
  assert.notEqual(w.puck.carrierId, null)
})

test("en el saque, tocar a un compañero lo elige como receptor (pase de un dedo)", () => {
  const w = makeWorld()
  concede(w, 0)
  const from = findSkater(w, w.puck.carrierId)!
  const to = w.skaters.find((s) => s.side === 0 && s.id !== from.id)!
  assert.equal(teammateAtPoint(w, from.id, to.x + 0.3, to.y - 0.2, 1.5), to.id)
})

test("el rival (IA) saca de verdad cuando le toca: pasa o tira en pocos segundos, no se queda parado", () => {
  for (const seed of [1, 2, 3, 4]) {
    const w = makeWorld()
    const ai = new TeamAI({ seed })
    concede(w, 1)
    assert.equal(findSkater(w, w.puck.carrierId)!.side, 1)
    let kicked = false
    for (let i = 0; i < Math.round(4 / FIXED_DT) && !kicked; i++) {
      ai.update(w, "L1", FIXED_DT)
      stepWorld(w, FIXED_DT)
      for (const ev of drainEvents(w)) if (ev.type === "kick" && ev.id.startsWith("V")) kicked = true
    }
    assert.ok(kicked, `seed ${seed}: la IA no sacó en 4 s`)
  }
})
