import test from "node:test"
import assert from "node:assert/strict"
import {
  RULES, STAMINA, SUPER_SHOT_COST, MATCH,
  createWorld, kick, setInput, stepWorld, trySub, FIXED_DT,
} from "../../lib/engine"
import type { World } from "../../lib/engine"
import { GOALS, makeWorld, parkOthers, place, run } from "./helpers"

// ---------- energía ----------

test("patinar a velocidad constante no cansa; acelerar desde parado sí", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 10, 10)
  setInput(w, "L1", 1, 0)
  run(w, 0.15)
  const afterBurst = s.stamina
  assert.ok(afterBurst < STAMINA.max, `debería haber gastado algo acelerando (${afterBurst})`)

  // ya casi a su velocidad máxima: sostener el mismo input no debería seguir bajando la energía.
  run(w, 0.6)
  const atCruise = s.stamina
  run(w, 1.0)
  const afterCruise = s.stamina
  assert.ok(afterCruise >= atCruise - 0.5, `a velocidad de crucero no debería seguir cansando (${atCruise} -> ${afterCruise})`)
})

test("super tiro: cuesta la mitad del tanque", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 10, 10)
  w.puck.carrierId = "L1"
  assert.equal(s.stamina, STAMINA.max)
  assert.ok(kick(w, "L1", 0, STAMINA.superShotMinSpeed + 4))
  assert.ok(Math.abs(s.stamina - (STAMINA.max - SUPER_SHOT_COST)) < 0.01, `stamina tras el super tiro: ${s.stamina}`)
  assert.ok(Math.hypot(w.puck.vx, w.puck.vy) >= STAMINA.superShotMinSpeed, "el tiro debe salir con toda la potencia pedida")
})

test("sin energía no hay super: se limita la potencia y no se cobra de nuevo", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 10, 10)
  w.puck.carrierId = "L1"
  s.stamina = SUPER_SHOT_COST - 1 // justo no le alcanza
  assert.ok(kick(w, "L1", 0, STAMINA.superShotMinSpeed + 6))
  assert.equal(s.stamina, SUPER_SHOT_COST - 1, "no se le cobra si no pudo pagarlo")
  const sp = Math.hypot(w.puck.vx, w.puck.vy)
  assert.ok(sp <= STAMINA.superShotCappedSpeed + 0.01, `sin energía el tiro debe quedar limitado (${sp})`)
})

test("un pase suave normal no cuenta como super tiro ni cobra energía", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 10, 10)
  w.puck.carrierId = "L1"
  assert.ok(kick(w, "L1", 0, 12))
  assert.equal(s.stamina, STAMINA.max)
})

// ---------- cambio por cansancio (banca de suplentes, no la tarjeta azul) ----------

test("plantilla: MATCH.rosterSize - teamSize suplentes por lado esperan en restBench", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  assert.equal(w.skaters.filter((s) => s.side === 0).length, 4)
  assert.equal(w.restBench.filter((b) => b.side === 0).length, MATCH.rosterSize - 4)
  assert.equal(w.restBench.filter((b) => b.side === 1).length, MATCH.rosterSize - 4)
})

test("cambio por cansancio: entra un suplente fresco, el cansado va a restBench con energía llena", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const tired = w.skaters.find((s) => s.side === 0)!
  tired.stamina = STAMINA.subThresholdPct - 1
  const ok = trySub(w, 0)
  assert.equal(ok, true)
  assert.equal(w.subsUsed[0], 1)
  assert.equal(w.skaters.some((s) => s.id === tired.id), false, "el cansado ya no está en pista")
  const rested = w.restBench.find((b) => b.skater.id === tired.id)
  assert.ok(rested, "el cansado pasó a restBench")
  const fresh = w.skaters.find((s) => s.side === 0 && s.stamina === STAMINA.max)
  assert.ok(fresh, "entró un suplente con el tanque lleno")
})

test("cambio por cansancio: nunca saca al que lleva el puck", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const carrier = w.skaters.find((s) => s.side === 0)!
  carrier.stamina = 1
  w.puck.carrierId = carrier.id
  assert.equal(trySub(w, 0), false)
})

test("cambio por cansancio: tope de 3 por equipo por partido", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  w.subsUsed[0] = RULES.maxFatigueSubs
  const tired = w.skaters.find((s) => s.side === 0)!
  tired.stamina = 0
  assert.equal(trySub(w, 0), false)
})

// ---------- combo de ataque: 3 toques + el 4º le gana al arquero ----------

function passAndWait(w: World, fromId: string, toId: string) {
  const from = w.skaters.find((s) => s.id === fromId)!
  const to = w.skaters.find((s) => s.id === toId)!
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  assert.ok(kick(w, fromId, Math.atan2(to.y - from.y, to.x - from.x), Math.min(20, 8 + d)))
  const ev = run(w, 2, (x: World) => x.puck.carrierId === toId)
  assert.equal(w.puck.carrierId, toId, "el pase debía completarse")
  return ev
}

test("combo de ataque: 3 pases seguidos arman el combo (y se corta si lo intercepta el rival)", () => {
  const w = createWorld({ teamSize: 2, goalies: false })
  parkOthers(w, ["L1", "L2", "V1"])
  place(w, "L1", 10, 10)
  place(w, "L2", 14, 10)
  place(w, "V1", 30, 18) // lejos: no interfiere
  w.puck.carrierId = "L1"
  w.puck.x = 10; w.puck.y = 10
  passAndWait(w, "L1", "L2")
  assert.equal(w.attackCombo?.touches, 1)
  passAndWait(w, "L2", "L1")
  assert.equal(w.attackCombo?.touches, 2)
  passAndWait(w, "L1", "L2")
  assert.equal(w.attackCombo?.side, 0)
  assert.equal(w.attackCombo?.touches, 3)

  // ahora lo corta una intercepción del rival
  place(w, "V1", w.puck.x + 3, w.puck.y)
  assert.ok(kick(w, "L2", 0, 10))
  run(w, 2, (x: World) => x.puck.carrierId === "V1")
  assert.equal(w.puck.carrierId, "V1")
  assert.equal(w.attackCombo, null, "la intercepción del rival corta el combo de ataque")
})

test("combo de ataque armado: el 4º toque (el tiro) le gana al arquero aunque esté bien parado", () => {
  const g = GOALS[1]
  const w = createWorld({ teamSize: 2, goalies: true })
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 20, g.cy)
  place(w, "L2", 26, g.cy)
  w.puck.carrierId = "L1"
  w.puck.x = 20; w.puck.y = g.cy
  // saque inicial ya deja al arquero centrado en g.cy (kickoff), no hace falta tocarlo.
  passAndWait(w, "L1", "L2")
  passAndWait(w, "L2", "L1")
  passAndWait(w, "L1", "L2")
  assert.equal(w.attackCombo?.touches, 3)

  // Mismo tiro "al medio" que en el resto del proyecto SIEMPRE se ataja sin combo (ver rules del portero).
  assert.ok(kick(w, "L2", Math.atan2(g.cy - w.puck.y, g.lineX - w.puck.x), 18))
  const ev = run(w, 2, (x: World) => x.phase === "goal" || x.events.some((e) => e.type === "save"))
  assert.equal(w.phase, "goal", "el golazo de combo debe entrar aunque vaya al cuerpo del arquero")
  assert.ok(ev.some((e) => e.type === "goal" && e.combo), "el evento de gol debe venir marcado como combo")
})

test("sin combo armado, ese mismo tiro al medio lo ataja el arquero (control)", () => {
  const g = GOALS[1]
  const w = createWorld({ teamSize: 1, goalies: true })
  place(w, "L1", 26, g.cy)
  w.puck.carrierId = "L1"
  w.puck.x = 26; w.puck.y = g.cy
  assert.equal(w.attackCombo, null)
  assert.ok(kick(w, "L1", Math.atan2(g.cy - w.puck.y, g.lineX - w.puck.x), 18))
  const ev = run(w, 2, (x: World) => x.phase === "goal" || x.events.some((e) => e.type === "save"))
  assert.equal(w.phase, "play", "sin combo, este tiro al cuerpo no debe entrar")
  assert.ok(ev.some((e) => e.type === "save"))
})

// ---------- combo de defensa: 3 intercepciones seguidas arman la atajada garantizada ----------

test("combo de defensa: se arma con intercepciones seguidas del mismo equipo", () => {
  const w = createWorld({ teamSize: 2, goalies: false })
  parkOthers(w, ["L1", "V1"])
  const l1 = place(w, "L1", 10, 10)
  place(w, "V1", 13, 10)
  w.puck.carrierId = "L1"
  w.puck.x = l1.x; w.puck.y = l1.y
  assert.ok(kick(w, "L1", 0, 10)) // directo hacia V1: no es un pase a un compañero, es un regalo
  run(w, 1, (x: World) => x.puck.carrierId === "V1")
  assert.equal(w.puck.carrierId, "V1", "V1 debía interceptarlo")
  assert.equal(w.defCombo?.side, 1)
  assert.equal(w.defCombo?.touches, 1)
})
