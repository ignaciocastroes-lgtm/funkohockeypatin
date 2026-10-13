import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, GOALIE, GOALS, createWorld, drainEvents, stepWorld } from "../../lib/engine"
import { goalieDivePose, goalieHitbox } from "../../lib/game/draw"

/** ¿El punto (x,y) cae dentro de la elipse `hb`? Margen de 1 mm por redondeo. */
const inside = (x: number, y: number, hb: { cy: number; rx: number; ry: number }) =>
  (x * x) / (hb.rx * hb.rx) + ((y - hb.cy) * (y - hb.cy)) / (hb.ry * hb.ry) <= 1 + 1e-3

test("arquero: todo el dibujo (parado y en la volada) cabe en el hitbox de ese instante", () => {
  const R = GOALIE.radius
  for (let i = 0; i <= 20; i++) {
    const amt = i / 20
    for (const side of [1, -1] as const) for (const dirX of [1, -1]) {
      const p = goalieDivePose(R, amt, side, dirX)
      const hb = goalieHitbox(R, amt, side)
      const where = `(amt ${amt}, lado ${side}, dir ${dirX})`
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
        const ell = [p.torso, ...p.shoulders, ...p.skates]
        for (const e of ell) assert.ok(inside(e.x + c * e.rx, e.y + s * e.ry, hb), `elipse afuera ${where}`)
        const circ = [p.helmet, ...(p.glove ? [p.glove] : [])]
        for (const ci of circ) assert.ok(inside(ci.x + c * ci.r, ci.y + s * ci.r, hb), `casco/guante afuera ${where}`)
        for (const pd of p.pads) for (const [x, y] of [[pd.x0, pd.y0], [pd.x1, pd.y1]]) {
          assert.ok(inside(x + c * pd.w / 2, y + s * pd.w / 2, hb), `pad afuera ${where}`)
        }
      }
    }
  }
})

test("arquero: tendido, los pads van hacia el lado del tiro y el casco al otro (volada, no 'abrirse de piernas')", () => {
  const R = GOALIE.radius
  for (const side of [1, -1] as const) {
    const p = goalieDivePose(R, 1, side, 1)
    assert.ok(p.lying)
    for (const pd of p.pads) assert.ok((pd.y1 - pd.y0) * side > R * 0.6, "los pads se estiran hacia el lado del tiro")
    assert.ok((p.helmet.y - p.hb.cy) * side < -R * 0.2, "el casco queda del lado contrario")
    assert.ok(p.hb.cy * side > 0, "el cuerpo entero se corrió hacia el tiro")
  }
  const parado = goalieDivePose(R, 0, 1, 1)
  assert.equal(parado.lying, false)
  assert.deepEqual(goalieHitbox(R, 0, 1), { cy: 0, rx: R, ry: R })
})

test("motor: la volada corre el cuerpo hacia el lado del tiro y después queda un rato en el piso sin poder correrse", () => {
  const w = createWorld({ teamSize: 1 })
  w.skaters.forEach((s) => { s.x = s.px = 2; s.y = s.py = 2 })
  const g = w.goalies[1]
  const goal = GOALS[1]
  w.phase = "play"
  // tiro hacia el palo de arriba (+y)
  const sx = 30, sy = 10, ty = goal.cy + 0.9, sp = 20
  const d = Math.hypot(goal.lineX - sx, ty - sy)
  w.puck.carrierId = null; w.puck.x = w.puck.px = sx; w.puck.y = w.puck.py = sy
  w.puck.vx = ((goal.lineX - sx) / d) * sp; w.puck.vy = ((ty - sy) / d) * sp
  let sawDive = false, side: number | undefined
  for (let i = 0; i < 60 && !(sawDive && !g.shotDive); i++) {
    stepWorld(w, FIXED_DT); drainEvents(w)
    if (g.shotDive) { sawDive = true; side = g.diveSide }
  }
  assert.ok(sawDive, "se tiró")
  assert.equal(side, 1, "hacia el lado del tiro")
  if (w.phase === "play") {
    // terminó la volada: sigue tirado (`diving`) y no se mueve de lado mientras dura `getUpTime`
    assert.ok(g.diving && (g.downTimer ?? 0) > 0, "queda en el piso")
    const y0 = g.y
    w.puck.x = w.puck.px = 20; w.puck.y = w.puck.py = 2; w.puck.vx = w.puck.vy = 0 // bocha lejos, del otro lado
    for (let i = 0; i < Math.floor((GOALIE.getUpTime * 0.8) / FIXED_DT); i++) stepWorld(w, FIXED_DT)
    assert.ok(Math.abs(g.y - y0) < 1e-6, "tirado no se corre de lado")
    for (let i = 0; i < Math.ceil((GOALIE.getUpTime * 0.5) / FIXED_DT) + 2; i++) stepWorld(w, FIXED_DT)
    assert.ok(!g.diving, "se levanta")
  }
})

test("reglamento (Art. 15.1.k): el arquero no retiene la bocha — le pega con el palo enseguida y sale lejos", () => {
  const w = createWorld({ teamSize: 1 })
  w.skaters.forEach((s) => { s.x = s.px = 2; s.y = s.py = 2 })
  const g = w.goalies[1]
  w.phase = "play"
  w.puck.carrierId = null
  w.puck.x = w.puck.px = g.x - 0.75; w.puck.y = w.puck.py = g.y + 0.3; w.puck.vx = w.puck.vy = 0
  let clearedAt = -1
  for (let i = 0; i < 60 && clearedAt < 0; i++) {
    stepWorld(w, FIXED_DT)
    if (drainEvents(w).some((e) => e.type === "goalieClear")) clearedAt = (i + 1) * FIXED_DT
  }
  assert.ok(clearedAt > 0 && clearedAt <= GOALIE.holdDelay + 0.05, `despejó a los ${clearedAt.toFixed(2)} s`)
  assert.ok(Math.hypot(w.puck.vx, w.puck.vy) >= 12, "el despeje sale fuerte")
})
