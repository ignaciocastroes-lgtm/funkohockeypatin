import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, GOAL, GOALS, createWorld, drainEvents, setInput, stepWorld } from "../../lib/engine"
import type { World } from "../../lib/engine"

/** Bug reportado (Ronda 61): un jugador que viene con la bocha POR DETRÁS del arco y empuja contra la
 *  red de atrás metía gol — el palo "atravesaba" la red y la bocha quedaba adentro del arco. */
function behindGoalRun(side: 0 | 1, yStart: number, angle: number, seconds = 2.5): { goals: number; insideCage: boolean } {
  const w: World = createWorld({ teamSize: 1, goalies: false })
  const g = GOALS[side]
  const s = w.skaters.find((k) => k.side === (side === 1 ? 0 : 1))!
  for (const k of w.skaters) if (k !== s) { k.x = k.px = 20; k.y = k.py = 1 }
  // detrás de la red, pegado: entre la red y la valla del fondo
  const bx = g.backX + g.dir * (s.radius + 0.25)
  s.x = s.px = bx; s.y = s.py = yStart; s.vx = s.vy = 0
  s.heading = angle; s.stickAngle = angle
  w.phase = "play"
  w.puck.carrierId = s.id
  s.controlGrace = 0
  let goals = 0
  let insideCage = false
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    setInput(w, s.id, Math.cos(angle), Math.sin(angle))
    stepWorld(w, FIXED_DT)
    if (drainEvents(w).some((e) => e.type === "goal")) goals++
    const p = w.puck
    if ((p.x - g.lineX) * g.dir > 0 && (p.x - g.lineX) * g.dir < GOAL.depth && p.y > g.yMin && p.y < g.yMax) insideCage = true
    if (w.phase !== "play") break
  }
  return { goals, insideCage }
}

test("detrás del arco: empujar la bocha contra la red de atrás NO es gol (los dos arcos, varios ángulos)", () => {
  for (const side of [0, 1] as const) {
    const g = GOALS[side]
    const intoNet = g.dir === 1 ? Math.PI : 0 // desde atrás, hacia la cancha
    for (const y of [g.cy - 0.8, g.cy, g.cy + 0.8]) {
      for (const da of [0, 0.4, -0.4]) {
        const r = behindGoalRun(side, y, intoNet + da)
        assert.equal(r.goals, 0, `arco ${side}, y=${y.toFixed(1)}, ángulo ${da}: gol por detrás`)
        assert.equal(r.insideCage, false, `arco ${side}, y=${y.toFixed(1)}, ángulo ${da}: la bocha quedó adentro del arco`)
      }
    }
  }
})

test("detrás del arco: rodear la red llevando la bocha tampoco la mete por el costado", () => {
  for (const side of [0, 1] as const) {
    const g = GOALS[side]
    const intoNet = g.dir === 1 ? Math.PI : 0
    for (const y of [g.yMin - 0.4, g.yMax + 0.4]) {
      const toward = y < g.cy ? Math.PI / 2 : -Math.PI / 2 // cruzando hacia el costado de la red
      const r = behindGoalRun(side, y, (intoNet + toward) / 2 + (side === 1 ? 0 : 0))
      assert.equal(r.goals, 0, `arco ${side}, por el costado y=${y.toFixed(1)}`)
    }
  }
})

test("detrás del arco: un tiro suelto desde atrás contra la red tampoco es gol (a cualquier velocidad)", () => {
  for (const side of [0, 1] as const) {
    const g = GOALS[side]
    for (const sp of [8, 18, 30]) for (const y of [g.cy - 0.9, g.cy, g.cy + 0.9]) {
      const w = createWorld({ teamSize: 1, goalies: false })
      for (const k of w.skaters) { k.x = k.px = 20; k.y = k.py = 1 }
      w.phase = "play"
      const p = w.puck
      p.carrierId = null
      p.x = p.px = g.backX + g.dir * 0.6; p.y = p.py = y
      p.vx = -g.dir * sp; p.vy = 0
      let goal = false
      for (let i = 0; i < 90 && w.phase === "play"; i++) { stepWorld(w, FIXED_DT); if (drainEvents(w).some((e) => e.type === "goal")) goal = true }
      assert.equal(goal, false, `arco ${side}, ${sp} m/s, y=${y.toFixed(1)}`)
    }
  }
})
