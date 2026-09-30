import test from "node:test"
import assert from "node:assert/strict"
import { createWorld, RINK } from "../../lib/engine"
import type { World } from "../../lib/engine"
import { MISSIONS, MissionTracker, missionsCompletedCount, nextMission } from "../../lib/game/missions"

const byId = (id: string) => MISSIONS.find((m) => m.id === id)!
const trackerFor = (id: string) => new MissionTracker(byId(id))

function place(w: World, id: string, x: number, y: number) {
  const s = w.skaters.find((q) => q.id === id)!
  s.x = x; s.y = y
  return s
}

test("missionsCompletedCount / nextMission: cuenta un prefijo válido, no ids sueltos", () => {
  assert.equal(missionsCompletedCount([]), 0)
  assert.equal(missionsCompletedCount(["recorrido"]), 1)
  assert.equal(missionsCompletedCount(["recorrido", "pase"]), 2)
  // un id fuera de orden (o corrupto) no cuenta como progreso real
  assert.equal(missionsCompletedCount(["pase"]), 0)
  assert.equal(missionsCompletedCount(["recorrido", "algo-que-no-existe", "pase"]), 2)
  assert.equal(nextMission([])?.id, "recorrido")
  assert.equal(nextMission(["recorrido"])?.id, "pase")
  assert.equal(nextMission(MISSIONS.map((m) => m.id)), null)
})

test("misión 1 (recorrido): cruzar la cancha con el mismo portador la completa", () => {
  const w = createWorld({ teamSize: 2, goalies: false })
  const t = trackerFor("recorrido")
  w.puck.carrierId = "L1"
  place(w, "L1", RINK.length * 0.1, 10)
  for (let x = RINK.length * 0.1; x <= RINK.length * 0.9 && !t.done; x += 0.5) {
    place(w, "L1", x, 10)
    t.tick(w, 1 / 60)
  }
  assert.ok(t.done, "debería completarse cruzando la cancha con el mismo portador")
})

test("misión 1 (recorrido): cambiar de portador a mitad de camino reinicia el progreso", () => {
  const w = createWorld({ teamSize: 2, goalies: false })
  const t = trackerFor("recorrido")
  w.puck.carrierId = "L1"
  // L1 recorre casi todo lo que hace falta (0.52 de la cancha), pero no llega a los 0.55 del umbral
  for (let x = RINK.length * 0.1; x <= RINK.length * 0.62; x += 0.5) {
    place(w, "L1", x, 10)
    t.tick(w, 1 / 60)
  }
  assert.ok(!t.done, "todavía no debería estar lograda (falta un poco)")
  // se la lleva OTRO compañero: si el tracker sumara el recorrido de los dos portadores, este
  // empujoncito de L2 alcanzaría el umbral (0.52 + 0.05 > 0.55) — no debería, porque es un
  // portador distinto y el recorrido tiene que ser continuo de UNO solo.
  w.puck.carrierId = "L2"
  place(w, "L2", RINK.length * 0.63, 10)
  t.tick(w, 1 / 60)
  place(w, "L2", RINK.length * 0.68, 10)
  t.tick(w, 1 / 60)
  assert.ok(!t.done, "el progreso de un portador no debe heredarlo otro")
})

test("misión 2 (pase que llega): un pase completado entre compañeros la logra", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("pase")
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, "L1")
  assert.ok(!t.done)
  t.onEvent({ type: "pickup", id: "L2" }, w, "L1")
  assert.ok(t.done)
})

test("misión 2 (pase que llega): si la recupera el rival no cuenta", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("pase")
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, "L1")
  t.onEvent({ type: "steal", id: "V1", from: "L1" }, w, "L1")
  t.onEvent({ type: "pickup", id: "V1" }, w, "L1")
  assert.ok(!t.done)
})

test("misión 3 (pared): pase, lo recibe un compañero, te la devuelve y la recibís — se logra", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("pared")
  const ctl = "L1"
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, ctl)
  t.onEvent({ type: "pickup", id: "L2" }, w, ctl)
  assert.ok(!t.done, "todavía falta la devolución")
  t.onEvent({ type: "kick", id: "L2", speed: 10 }, w, ctl)
  t.onEvent({ type: "pickup", id: "L1" }, w, ctl)
  assert.ok(t.done)
})

test("misión 3 (pared): un robo en el medio corta la secuencia", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("pared")
  const ctl = "L1"
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, ctl)
  t.onEvent({ type: "pickup", id: "L2" }, w, ctl)
  t.onEvent({ type: "steal", id: "V1", from: "L2" }, w, ctl)
  t.onEvent({ type: "kick", id: "L2", speed: 10 }, w, ctl) // patada vieja, ya no debería contar
  t.onEvent({ type: "pickup", id: "L1" }, w, ctl)
  assert.ok(!t.done)
})

test("misión 3 (pared): se reinicia sola en cada saque (onKickoff)", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("pared")
  const ctl = "L1"
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, ctl)
  t.onEvent({ type: "pickup", id: "L2" }, w, ctl)
  t.onEvent({ type: "kickoff" }, w, ctl)
  t.onEvent({ type: "pickup", id: "L1" }, w, ctl) // la "devolución" de un intento que ya no existe
  assert.ok(!t.done)
})

test("misión 4 (ataque de 3 toques): solo un gol de combo la logra", () => {
  const w = createWorld({ teamSize: 1, goalies: false })
  const t1 = trackerFor("combo")
  t1.onEvent({ type: "goal", side: 0 }, w, null)
  assert.ok(!t1.done, "un gol sin combo no alcanza")
  const t2 = trackerFor("combo")
  t2.onEvent({ type: "goal", side: 0, combo: true }, w, null)
  assert.ok(t2.done)
  const t3 = trackerFor("combo")
  t3.onEvent({ type: "goal", side: 1, combo: true }, w, null) // gol del rival, no cuenta
  assert.ok(!t3.done)
})

test("misión 5 (definición): un gol con arquero en cancha la logra", () => {
  const withGoalie = createWorld({ teamSize: 1, goalies: [false, true] })
  const t1 = trackerFor("definicion")
  t1.onEvent({ type: "goal", side: 0 }, withGoalie, null)
  assert.ok(t1.done)

  const withoutGoalie = createWorld({ teamSize: 1, goalies: false })
  const t2 = trackerFor("definicion")
  t2.onEvent({ type: "goal", side: 0 }, withoutGoalie, null)
  assert.ok(!t2.done, "sin arquero en la cancha no es la misión de definición")
})

test("misión 6 (partido de verdad): pase completado con el rival encima se logra", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("presion")
  place(w, "L1", 20, 10)
  place(w, "V1", 21.5, 10) // a menos de 3.2 m: presión real
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, "L1")
  t.onEvent({ type: "pickup", id: "L2" }, w, "L1")
  assert.ok(t.done)
})

test("misión 6 (partido de verdad): sin presión real (rival lejos) no cuenta", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("presion")
  place(w, "L1", 20, 10)
  place(w, "V1", 35, 2) // lejos: no es una jugada bajo presión
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, "L1")
  t.onEvent({ type: "pickup", id: "L2" }, w, "L1")
  assert.ok(!t.done)
})

test("done queda en true para siempre (no hace falta 'apagar' la misión de nuevo)", () => {
  const w = createWorld({ teamSize: 4, goalies: false })
  const t = trackerFor("pase")
  t.onEvent({ type: "kick", id: "L1", speed: 10 }, w, "L1")
  t.onEvent({ type: "pickup", id: "L2" }, w, "L1")
  assert.ok(t.done)
  const before = t.done
  t.onEvent({ type: "steal", id: "V1", from: "L2" }, w, "L1")
  assert.equal(t.done, before)
})
