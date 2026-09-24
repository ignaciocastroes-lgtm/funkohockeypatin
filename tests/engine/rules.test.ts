import test from "node:test"
import assert from "node:assert/strict"
import { RULES, setInput, stepWorld, FIXED_DT, drainEvents } from "../../lib/engine"
import { RINK, makeWorld, parkOthers, place, run, shootPuck } from "./helpers"

/** V2 parado en (12,10); L3 (veloz, 8.4 m/s) le llega corriendo desde la izquierda. */
function chargeScenario(chargerSpeed = 8.2, victimVx = 0, keepPushing = true) {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, ["L3", "V2"])
  shootPuck(w, 30, 3, 0, 0)
  place(w, "V2", 12, 10, victimVx, 0)
  const c = place(w, "L3", 8, 10, chargerSpeed, 0)
  c.pickupCooldown = 1e9
  setInput(w, "L3", keepPushing ? 1 : 0, 0)
  return w
}

test("un golpe fuerte contra un rival casi parado es falta: el agresor sale a la banca", () => {
  const w = chargeScenario()
  const ev = run(w, 1)
  const foul = ev.find((e) => e.type === "foul")
  assert.ok(foul && foul.type === "foul", "debía haber falta")
  if (foul && foul.type === "foul") {
    assert.equal(foul.id, "L3")
    assert.equal(foul.victim, "V2")
    assert.equal(foul.side, 0)
  }
  assert.equal(w.fouls[0], 1)
  assert.equal(w.skaters.some((s) => s.id === "L3"), false)
  assert.equal(w.bench.length, 1)
  assert.equal(w.bench[0].skater.id, "L3")
  assert.ok(Math.abs(w.bench[0].timer - RULES.penaltySeconds) < 1)
})

test("la regla es simétrica: si el agresor es el visitante, también sale", () => {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, ["V3", "L2"])
  shootPuck(w, 30, 3, 0, 0)
  place(w, "L2", 28, 10)
  const c = place(w, "V3", 32, 10, -8.2, 0)
  c.pickupCooldown = 1e9
  setInput(w, "V3", -1, 0)
  const ev = run(w, 1)
  const foul = ev.find((e) => e.type === "foul")
  assert.ok(foul && foul.type === "foul" && foul.id === "V3" && foul.side === 1)
  assert.equal(w.fouls[1], 1)
})

test("choque de frente entre dos que corren NO es falta (culpa compartida)", () => {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, ["L3", "V3"])
  shootPuck(w, 30, 3, 0, 0)
  const a = place(w, "L3", 8, 10, 8, 0)
  const b = place(w, "V3", 14, 10, -8, 0)
  a.pickupCooldown = b.pickupCooldown = 1e9
  setInput(w, "L3", 1, 0)
  setInput(w, "V3", -1, 0)
  const ev = run(w, 1)
  assert.ok(ev.some((e) => e.type === "hit"), "sí debe haber choque")
  assert.equal(ev.some((e) => e.type === "foul"), false)
  assert.equal(w.bench.length, 0)
})

test("un golpe fuerte a un compañero no es falta", () => {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, ["L3", "L2"])
  shootPuck(w, 30, 3, 0, 0)
  place(w, "L2", 12, 10)
  const c = place(w, "L3", 8, 10, 8.2, 0)
  c.pickupCooldown = 1e9
  setInput(w, "L3", 1, 0)
  const ev = run(w, 1)
  assert.equal(ev.some((e) => e.type === "foul"), false)
})

test("un roce suave no es falta", () => {
  const w = chargeScenario(3.0, 0, false)
  const ev = run(w, 1.5)
  assert.equal(ev.some((e) => e.type === "foul"), false)
})

test("el infractor vuelve a jugar tras la sanción, del lado de su portería", () => {
  const w = chargeScenario()
  run(w, 1)
  assert.equal(w.bench.length, 1)
  const n = w.skaters.length
  const ev = run(w, RULES.penaltySeconds + 0.5)
  assert.ok(ev.some((e) => e.type === "return" && e.id === "L3"))
  assert.equal(w.bench.length, 0)
  assert.equal(w.skaters.length, n + 1)
  const back = w.skaters.find((s) => s.id === "L3")!
  assert.ok(back.x < RINK.length / 2, "sale por su lado")
})

test("la sanción no corre durante la pausa de un gol", () => {
  const w = chargeScenario()
  run(w, 1)
  const t0 = w.bench[0].timer
  w.phase = "goal"
  w.phaseTimer = 1.0
  for (let i = 0; i < 60; i++) stepWorld(w, FIXED_DT)
  assert.equal(w.bench[0].timer, t0)
})

test("si el infractor llevaba el puck, lo suelta al salir", () => {
  const w = chargeScenario()
  const c = w.skaters.find((s) => s.id === "L3")!
  c.pickupCooldown = 0
  shootPuck(w, 8.7, 10, 8, 0)
  run(w, 0.02)
  assert.equal(w.puck.carrierId, "L3")
  drainEvents(w)
  run(w, 0.6)
  assert.equal(w.bench.length, 1)
  assert.notEqual(w.puck.carrierId, "L3") // ya no lo lleva el expulsado
})

test("máximo de expulsados por equipo: la tercera falta cuenta pero no saca a nadie", () => {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, [])
  shootPuck(w, 30, 3, 0, 0)
  const offenders = ["L2", "L3", "L4"]
  offenders.forEach((id, i) => {
    place(w, id, 8, 5 + i * 4, 8.2, 0)
    setInput(w, id, 1, 0)
    w.skaters.find((s) => s.id === id)!.pickupCooldown = 1e9
    place(w, `V${i + 1}`, 12, 5 + i * 4)  // víctimas quietas frente a cada uno
  })
  run(w, 1.2)
  assert.equal(w.bench.filter((b) => b.side === 0).length, RULES.maxBenched)
  assert.equal(w.fouls[0], 3)
  assert.equal(w.skaters.filter((s) => s.side === 0).length, 2)
})
