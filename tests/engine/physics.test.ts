import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, FixedStepper, GOAL, PUCK, createWorld, stepWorld } from "../../lib/engine"
import { GOALS, RINK, cleanWorld, lcg, makeWorld, parkOthers, place, run, shootPuck } from "./helpers"

// ---------- R1: tiempo fijo ----------
test("misma física a 30, 60, 75, 144 y 240 Hz (paso fijo)", () => {
  const results: { steps: number; px: number; py: number; sx: number; sy: number }[] = []
  for (const hz of [30, 60, 75, 144, 240]) {
    const w = makeWorld({ teamSize: 2 })
    parkOthers(w, ["L1"])
    place(w, "L1", 8, 10)
    w.skaters[0].inputX = 1
    w.skaters[0].inputY = 0.3
    shootPuck(w, 12, 6, 14, 3)
    const stepper = new FixedStepper()
    const T = 4.0035 // no cae justo en un borde de paso: 480 pasos para cualquier frecuencia
    const frames = Math.round(T * hz)
    for (let i = 0; i < frames; i++) stepper.advance(T / frames, (dt) => stepWorld(w, dt))
    const l1 = w.skaters[0]
    results.push({ steps: w.steps, px: w.puck.x, py: w.puck.y, sx: l1.x, sy: l1.y })
  }
  for (const r of results) {
    assert.equal(r.steps, results[0].steps, "mismo número de pasos")
    assert.ok(Math.abs(r.px - results[0].px) < 1e-9 && Math.abs(r.py - results[0].py) < 1e-9, "mismo puck")
    assert.ok(Math.abs(r.sx - results[0].sx) < 1e-9 && Math.abs(r.sy - results[0].sy) < 1e-9, "mismo patinador")
  }
})

test("frames irregulares (jitter) dan el mismo resultado", () => {
  const ref = makeWorld({ teamSize: 1 })
  const jit = makeWorld({ teamSize: 1 })
  for (const w of [ref, jit]) { shootPuck(w, 10, 8, 18, 2.5); w.skaters[0].inputX = 1 }
  const a = new FixedStepper(); const b = new FixedStepper()
  const T = 3.0035
  a.advance(T, (dt) => stepWorld(ref, dt)) // un solo frame gigante (se recorta a maxFrame)
  const r = lcg(7)
  let acc = 0
  while (acc < T - 1e-9) { const f = Math.min(T - acc, 0.004 + r() * 0.03); b.advance(f, (dt) => stepWorld(jit, dt)); acc += f }
  // el frame gigante se recorta a 0.25 s, así que comparo contra pasos fijos equivalentes
  const w2 = makeWorld({ teamSize: 1 }); shootPuck(w2, 10, 8, 18, 2.5); w2.skaters[0].inputX = 1
  const n = jit.steps
  for (let i = 0; i < n; i++) stepWorld(w2, FIXED_DT)
  assert.ok(Math.abs(w2.puck.x - jit.puck.x) < 1e-9 && Math.abs(w2.puck.y - jit.puck.y) < 1e-9)
})

test("determinista: dos corridas idénticas producen el mismo estado", () => {
  const mk = () => { const w = createWorld({ teamSize: 3 }); shootPuck(w, 20, 10, 22, 4); w.skaters[1].inputX = 1; return w }
  const a = mk(); const b = mk()
  run(a, 12); run(b, 12)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
})

// ---------- R1: goles ----------
test("100% de goles a cualquier velocidad (sin túnel), ambas porterías", () => {
  let n = 0
  for (const goal of GOALS) {
    for (const speed of [4, 8, 12, 16, 20, 25, 30, 35, 38]) {
      for (const off of [-0.9, -0.45, 0, 0.45, 0.9]) {
        const w = cleanWorld()
        const dir = goal.dir // hacia la red (afuera de la pista)
        // distancia de salida acorde a la velocidad: un tiro lento desde muy lejos se frena solo por fricción
        const startDist = Math.min(17, Math.max(2.5, speed * 0.6))
        shootPuck(w, goal.lineX - dir * startDist, goal.cy + off, dir * speed, 0)
        const ev = run(w, 5, (x) => x.phase === "goal")
        n++
        assert.equal(w.phase, "goal", `sin gol: portería ${goal.side}, v=${speed}, off=${off}`)
        assert.ok(ev.some((e) => e.type === "goal" && e.side === (goal.side === 0 ? 1 : 0)))
      }
    }
  }
  assert.equal(n, 2 * 9 * 5)
})

test("tiros en diagonal a la boca también son gol a cualquier velocidad", () => {
  for (const goal of GOALS) {
    for (const speed of [10, 20, 30, 38]) {
      for (const off of [-0.8, 0, 0.8]) {
        const w = cleanWorld()
        const sx = goal.side === 0 ? 14 : RINK.length - 14
        const sy = 4
        const tx = goal.lineX
        const ty = goal.cy + off
        const d = Math.hypot(tx - sx, ty - sy)
        shootPuck(w, sx, sy, ((tx - sx) / d) * speed, ((ty - sy) / d) * speed)
        run(w, 5, (x) => x.phase === "goal")
        assert.equal(w.phase, "goal", `diagonal sin gol v=${speed} off=${off}`)
      }
    }
  }
})

test("un tiro afuera de los postes NO es gol", () => {
  for (const goal of GOALS) {
    for (const speed of [8, 20, 35]) {
      for (const off of [GOAL.mouth / 2 + 0.05, GOAL.mouth / 2 + 0.6, -(GOAL.mouth / 2 + 0.05), -(GOAL.mouth / 2 + 0.6)]) {
        const w = cleanWorld()
        shootPuck(w, RINK.length / 2, goal.cy + off, goal.dir * speed, 0)
        run(w, 4)
        assert.notEqual(w.phase, "goal", `gol indebido v=${speed} off=${off}`)
      }
    }
  }
})

test("el poste desvía el puck (no es gol y suena 'post')", () => {
  const goal = GOALS[1]
  const w = cleanWorld()
  shootPuck(w, 25, goal.yMax + 0.02, 15, 0)
  const ev = run(w, 3)
  assert.notEqual(w.phase, "goal")
  assert.ok(ev.some((e) => e.type === "post"))
})

test("el gol solo cuenta al cruzar de frente, no desde atrás de la red", () => {
  const goal = GOALS[1] // derecha
  const w = cleanWorld()
  // puck detrás de la red, moviéndose hacia la línea de gol por atrás
  shootPuck(w, goal.backX + 0.6, goal.cy, -12, 0)
  run(w, 3)
  assert.equal(w.score[0] + w.score[1], 0)
})

// ---------- R1: vallas ----------
test("el puck jamás sale de la pista (esquinas incluidas), a cualquier velocidad", () => {
  const rnd = lcg(1234)
  const eps = 1e-6
  for (let i = 0; i < 60; i++) {
    const w = cleanWorld()
    const ang = rnd() * Math.PI * 2
    const speed = 5 + rnd() * (PUCK.maxSpeed - 5)
    shootPuck(w, 8 + rnd() * 24, 4 + rnd() * 12, Math.cos(ang) * speed, Math.sin(ang) * speed)
    run(w, 12, (x) => {
      const p = x.puck
      assert.ok(p.x > -eps && p.x < RINK.length + eps && p.y > -eps && p.y < RINK.width + eps, `fuera de pista (${p.x.toFixed(2)},${p.y.toFixed(2)})`)
      return x.phase === "goal"
    })
  }
})

test("esquinas redondeadas: tiro directo a la esquina rebota y no atraviesa", () => {
  for (const [cx, cy] of [[0, 0], [RINK.length, 0], [0, RINK.width], [RINK.length, RINK.width]]) {
    for (const speed of [10, 25, 38]) {
      const w = cleanWorld()
      const sx = RINK.length / 2
      const sy = RINK.width / 2
      const d = Math.hypot(cx - sx, cy - sy)
      shootPuck(w, sx, sy, ((cx - sx) / d) * speed, ((cy - sy) / d) * speed)
      run(w, 6, (x) => {
        assert.ok(x.puck.x >= -1e-6 && x.puck.x <= RINK.length + 1e-6 && x.puck.y >= -1e-6 && x.puck.y <= RINK.width + 1e-6)
        return x.phase === "goal"
      })
    }
  }
})

test("los patinadores tampoco salen de la pista ni entran a la red", () => {
  const w = makeWorld({ teamSize: 2 })
  parkOthers(w, ["L1"])
  const s = place(w, "L1", 20, 10)
  const rnd = lcg(99)
  for (let t = 0; t < 40; t++) {
    s.inputX = rnd() * 2 - 1
    s.inputY = rnd() * 2 - 1
    run(w, 0.5, (x) => {
      assert.ok(s.x - s.radius > -1e-3 && s.x + s.radius < RINK.length + 1e-3 && s.y - s.radius > -1e-3 && s.y + s.radius < RINK.width + 1e-3)
      return false
    })
  }
  // correr directo hacia la boca de la portería izquierda: no puede pasar la línea de gol
  s.x = 10; s.y = GOALS[0].cy; s.vx = 0; s.vy = 0
  s.inputX = -1; s.inputY = 0
  run(w, 4)
  assert.ok(s.x - s.radius >= GOALS[0].lineX - 1e-3, `el patinador entró a la red: x=${s.x}`)
})

// ---------- R1: superficies ----------
test("el puck rueda más lejos en sintético que en madera y más en madera que en cemento", () => {
  const dist: Record<string, number> = {}
  for (const surface of ["cemento", "madera", "sintetico"] as const) {
    const w = cleanWorld({ surface })
    shootPuck(w, 4, 2, 9, 0)
    run(w, 2.5)
    dist[surface] = w.puck.x - 4
  }
  assert.ok(dist.sintetico > dist.madera && dist.madera > dist.cemento, JSON.stringify(dist))
})

test("el patinador se desliza más en sintético que en cemento al soltar el dedo", () => {
  const slide: Record<string, number> = {}
  for (const surface of ["cemento", "sintetico"] as const) {
    const w = makeWorld({ surface, teamSize: 1 })
    const s = place(w, "L1", 5, 10)
    s.inputX = 1
    run(w, 1.5)
    const x0 = s.x
    s.inputX = 0
    run(w, 1.0)
    slide[surface] = s.x - x0
  }
  assert.ok(slide.sintetico > slide.cemento, JSON.stringify(slide))
})

test("el patinador acelera con inercia (no llega a velocidad máxima al instante)", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 5, 10)
  s.inputX = 1
  run(w, 0.1)
  const v1 = Math.hypot(s.vx, s.vy)
  assert.ok(v1 > 0.5 && v1 < s.maxSpeed * 0.5, `v(0.1s)=${v1}`)
  run(w, 1.0)
  assert.ok(Math.hypot(s.vx, s.vy) > s.maxSpeed * 0.97)
})

test("un puck a 38 m/s no atraviesa un poste, sin importar en qué fase del paso llegue", () => {
  const goal = GOALS[1]
  let hits = 0
  let total = 0
  for (const post of [goal.yMin, goal.yMax]) {
    for (let k = 0; k < 40; k++) {
      const w = cleanWorld()
      // el centro del puck apunta exactamente al centro del poste; se barre la fase de llegada
      shootPuck(w, goal.lineX - 8 - (k / 40) * 0.3, post, 38, 0)
      const ev = run(w, 0.6)
      total++
      if (ev.some((e) => e.type === "post")) hits++
      assert.notEqual(w.phase, "goal", "no debe colarse por el poste")
    }
  }
  assert.equal(hits, total, `${hits}/${total} choques con el poste detectados`)
})
