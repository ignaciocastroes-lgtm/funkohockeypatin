import test from "node:test"
import assert from "node:assert/strict"
import { GOALIE, SKATER, TACKLE, tackle, createWorld } from "../../lib/engine"
import { GOALS, makeWorld, place, run, shootPuck } from "./helpers"

/** V1 (rival) lleva la pelota; L1 es el defensor humano a `gap` metros (borde a borde). */
function scene(gap: number) {
  const w = makeWorld({ teamSize: 1 })
  const carrier = place(w, "V1", 20, 10)
  const me = place(w, "L1", 20 - (carrier.radius + 0.5 + gap), 10)
  shootPuck(w, 20.8, 10, 0, 0)
  w.puck.carrierId = "V1"
  carrier.controlGrace = 0
  carrier.heading = 0 // mira hacia +x: L1 le queda por detrás (el robo automático NO alcanza)
  me.pickupCooldown = 0
  return { w, me, carrier }
}

test("quitar: a corta distancia le saca la pelota al rival aunque esté de espaldas", () => {
  const { w, me } = scene(0.3)
  assert.ok(tackle(w, "L1", false))
  assert.equal(w.puck.carrierId, "L1")
  assert.equal(me.side, 0)
})

test("quitar: lejos no llega, falla y queda trabado un rato (no se puede spamear)", () => {
  const { w, me } = scene(1.4)
  assert.equal(tackle(w, "L1", false), false)
  assert.equal(w.puck.carrierId, "V1")
  assert.ok(me.pickupCooldown >= TACKLE.missLock - 1e-9)
  assert.equal(tackle(w, "L1", false), false, "trabado: no puede volver a intentar de inmediato")
})

test("quitar fuerte: llega más lejos que el normal y deja la pelota suelta hacia el defensor", () => {
  const near = scene(1.4)
  assert.equal(tackle(near.w, "L1", false), false)
  const { w } = scene(1.4)
  assert.ok(tackle(w, "L1", true))
  assert.equal(w.puck.carrierId, null, "barrida: la pelota queda suelta, no pegada al palo")
  assert.ok(w.puck.vx < 0, "sale hacia el lado del defensor")
})

test("quitar fuerte que falla (muy lejos) deja trabado más tiempo que el normal", () => {
  const { w, me } = scene(3.5)
  assert.equal(tackle(w, "L1", true), false)
  assert.ok(me.pickupCooldown >= TACKLE.strongMissLock - 1e-9)
  assert.ok(TACKLE.strongMissLock > TACKLE.missLock)
})

test("quitar: el que acaba de recibir la pelota está protegido, salvo de la barrida", () => {
  const a = scene(0.3)
  a.carrier.controlGrace = 0.3
  assert.equal(tackle(a.w, "L1", false), false)
  const b = scene(0.3)
  b.carrier.controlGrace = 0.3
  assert.ok(tackle(b.w, "L1", true))
})

test("quitar: no hace nada si el propio jugador lleva la pelota o si no es su turno de juego", () => {
  const { w } = scene(0.3)
  w.puck.carrierId = "L1"
  assert.equal(tackle(w, "L1", false), false)
  const q = scene(0.3)
  q.w.phase = "goal"
  assert.equal(tackle(q.w, "L1", false), false)
})

test("arquero: si la bocha queda quieta pegada a él, despeja solo hacia el arco rival", () => {
  const w = createWorld({ goalies: true, teamSize: 1 })
  const g = w.goalies.find((k) => k.side === 0)!
  place(w, "L1", 30, 3); place(w, "V1", 30, 17)
  w.phase = "play"
  const opp = GOALS[1]
  shootPuck(w, g.x + g.radius + w.puck.radius + 0.2, g.y, 0, 0)
  const ev = run(w, GOALIE.holdDelay + 0.6)
  assert.ok(ev.some((e) => e.type === "goalieClear" && e.side === 0), "hubo despeje")
  assert.ok(Math.hypot(w.puck.vx, w.puck.vy) > 2 || w.puck.x > g.x + 2, "la bocha salió")
  assert.ok((opp.lineX - g.x) * w.puck.vx >= 0 || w.puck.x > g.x, "va hacia el arco rival, no hacia el propio")
})

test("arquero: no despeja en un penal ni con la bocha en movimiento", () => {
  const w = createWorld({ goalies: true, teamSize: 1 })
  const g = w.goalies.find((k) => k.side === 0)!
  place(w, "L1", 30, 3); place(w, "V1", 30, 17)
  w.phase = "play"
  w.penaltyActive = true
  shootPuck(w, g.x + g.radius + w.puck.radius + 0.2, g.y, 0, 0)
  const ev = run(w, 1.2)
  assert.ok(!ev.some((e) => e.type === "goalieClear"))
})

void SKATER
