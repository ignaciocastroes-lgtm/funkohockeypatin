import test from "node:test"
import assert from "node:assert/strict"
import { createWorld, kick } from "../../lib/engine"
import { GOALS, place, run } from "./helpers"

test("arquero por lado: [true,false] pone solo al local, [false,true] solo al visita", () => {
  const wLocal = createWorld({ teamSize: 1, goalies: [true, false] })
  assert.equal(wLocal.goalies.length, 1)
  assert.equal(wLocal.goalies[0].side, 0)

  const wVisit = createWorld({ teamSize: 1, goalies: [false, true] })
  assert.equal(wVisit.goalies.length, 1)
  assert.equal(wVisit.goalies[0].side, 1)
})

test("arquero por lado: [false,false] es lo mismo que 'sin arquero', [true,true] los dos de siempre", () => {
  const wNone = createWorld({ teamSize: 1, goalies: [false, false] })
  assert.equal(wNone.goalies.length, 0)
  assert.equal(wNone.hasGoalies, false)

  const wBoth = createWorld({ teamSize: 1, goalies: [true, true] })
  assert.equal(wBoth.goalies.length, 2)
})

test("arquero por lado: no rompe compatibilidad — boolean sigue siendo ambos o ninguno", () => {
  assert.equal(createWorld({ teamSize: 1, goalies: true }).goalies.length, 2)
  assert.equal(createWorld({ teamSize: 1, goalies: false }).goalies.length, 0)
  assert.equal(createWorld({ teamSize: 1 }).goalies.length, 2, "sin especificar, sigue siendo ambos por defecto")
})

test("arquero por lado: con solo el arquero visita, un tiro al arco local entra siempre (no hay quien lo pare)", () => {
  const g = GOALS[0]
  const w = createWorld({ teamSize: 1, goalies: [false, true] })
  place(w, "L1", 14, g.cy)
  w.puck.carrierId = "L1"
  w.puck.x = 14; w.puck.y = g.cy
  assert.ok(kick(w, "L1", Math.atan2(g.cy - w.puck.y, g.lineX - w.puck.x), 14))
  run(w, 2)
  assert.equal(w.phase, "goal", "sin arquero local, hasta un tiro flojo al medio tiene que entrar")
})
