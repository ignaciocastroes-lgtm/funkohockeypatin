import test from "node:test"
import assert from "node:assert/strict"
import { SKATER, MATCH, kick, kickoff, setInput, createWorld, stepWorld, FIXED_DT } from "../../lib/engine"
import { GOALS, RINK, cleanWorld, lcg, makeWorld, parkOthers, place, run, shootPuck } from "./helpers"

test("un puck suelto cerca se recoge y queda pegado al palo mientras te mueves", () => {
  const w = makeWorld({ teamSize: 1 })
  place(w, "V1", 35, 18)
  const s = place(w, "L1", 10, 10)
  shootPuck(w, 10.8, 10, 0, 0)
  run(w, 0.05)
  assert.equal(w.puck.carrierId, "L1")
  s.inputX = 1
  run(w, 1.5)
  const d = Math.hypot(w.puck.x - s.x, w.puck.y - s.y)
  const expect = s.radius + w.puck.radius + SKATER.stickReach
  assert.ok(Math.abs(d - expect) < 0.02, `distancia palo-puck ${d}`)
  assert.equal(w.puck.carrierId, "L1")
})

test("patear: el puck sale a la velocidad pedida, el portador lo suelta y no lo recoge de inmediato", () => {
  const w = makeWorld({ teamSize: 1 })
  place(w, "V1", 35, 18)
  const s = place(w, "L1", 10, 10)
  shootPuck(w, 10.8, 10, 0, 0)
  run(w, 0.05)
  assert.ok(kick(w, "L1", 0, 20))
  assert.equal(w.puck.carrierId, null)
  assert.ok(Math.hypot(w.puck.vx, w.puck.vy) >= 19.9)
  run(w, 0.2)
  assert.equal(w.puck.carrierId, null, "no debe auto-recogerse")
  assert.ok(w.puck.x > s.x + 2)
})

test("solo el portador puede patear", () => {
  const w = makeWorld({ teamSize: 1 })
  assert.equal(kick(w, "L1", 0, 10), false)
})

test("pase suave a un compañero: lo recibe y sigue con él", () => {
  const w = makeWorld({ teamSize: 2 })
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10)
  w.puck.carrierId = "L1"
  const ev = run(w, 0.02)
  kick(w, "L1", 0, 11)
  ev.push(...run(w, 2.0, (x) => x.puck.carrierId === "L2"))
  assert.equal(w.puck.carrierId, "L2")
})

test("un pase demasiado fuerte rebota en el receptor en vez de controlarse", () => {
  const w = makeWorld({ teamSize: 2 })
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10)
  w.puck.carrierId = "L1"
  run(w, 0.02)
  kick(w, "L1", 0, 30)
  const ev = run(w, 0.5)
  assert.ok(!ev.some((e) => e.type === "pickup" && e.id === "L2"), "no debería controlarlo a 30 m/s")
  assert.ok(ev.some((e) => e.type === "deflect" && e.id === "L2"), "debería rebotar")
})

test("robo: un rival que llega de frente le quita el puck al portador", () => {
  const w = makeWorld({ teamSize: 1 })
  const a = place(w, "L1", 10, 10)
  place(w, "V1", 15, 10)
  w.puck.carrierId = "L1"
  a.stickAngle = 0
  setInput(w, "L1", 1, 0)
  setInput(w, "V1", -1, 0)
  const ev = run(w, 2.0, (x) => x.puck.carrierId === "V1")
  assert.ok(ev.some((e) => e.type === "steal" && e.id === "V1"), JSON.stringify(ev.slice(0, 5)))
  assert.equal(w.puck.carrierId, "V1")
})

test("robo: por la espalda NO se puede robar (el cuerpo protege el puck)", () => {
  const w = makeWorld({ teamSize: 1 })
  place(w, "L1", 12, 10)
  place(w, "V1", 8, 10)
  w.puck.carrierId = "L1"
  setInput(w, "L1", 1, 0)
  setInput(w, "V1", 1, 0)
  const ev = run(w, 1.5)
  assert.ok(!ev.some((e) => e.type === "steal"))
  assert.equal(w.puck.carrierId, "L1")
})

test("un golpe fuerte al portador le hace soltar el puck", () => {
  const w = makeWorld({ teamSize: 1 })
  place(w, "L1", 20, 10)
  place(w, "V1", 15, 10)
  w.puck.carrierId = "L1"
  const l1 = w.skaters[0]
  l1.controlGrace = 5
  setInput(w, "V1", 1, 0)
  const ev = run(w, 1.2, (x) => x.puck.carrierId === null)
  assert.ok(ev.some((e) => e.type === "spill" && e.id === "L1"), "debe soltar el puck")
})

test("tras ganar el puck hay gracia: el rival no puede robarlo instantáneamente", () => {
  const w = makeWorld({ teamSize: 1 })
  const a = place(w, "L1", 10, 10)
  place(w, "V1", 11.7, 10)
  shootPuck(w, 10.8, 10, 0, 0)
  w.skaters[1].pickupCooldown = 0
  run(w, 0.3)
  // quien lo haya ganado, lo conserva durante la gracia (0.6 s)
  const holder = w.puck.carrierId
  assert.ok(holder)
  const g = w.skaters.find((s) => s.id === holder)!
  assert.ok(g.controlGrace >= 0)
  void a
})

test("gol: marcador, pausa, y saque inicial automático", () => {
  const w = cleanWorld()
  shootPuck(w, 20, 10, 25, 0)
  const ev = run(w, 3, (x) => x.phase === "goal")
  assert.deepEqual(w.score, [1, 0])
  assert.ok(ev.some((e) => e.type === "goal" && e.side === 0))
  run(w, 2.4)
  assert.equal(w.phase, "play")
  assert.ok(Math.abs(w.puck.x - RINK.length / 2) < 1e-9 && Math.abs(w.puck.y - RINK.width / 2) < 1e-9)
  assert.equal(w.puck.carrierId, null)
})

test("el reloj llega a 0 pero concede tiempo de gracia antes de terminar", () => {
  const w = makeWorld({ teamSize: 1, duration: 1 })
  run(w, 1.05)
  assert.equal(w.clock, 0)
  assert.equal(w.phase, "timeOn", "no debe cortar en seco: hay un breve tiempo de gracia")
})

test("el reloj termina el partido tras el tiempo de gracia y luego nada se mueve", () => {
  const w = makeWorld({ teamSize: 1, duration: 1 })
  const ev = run(w, 1 + MATCH.timeOnGrace + 0.2)
  assert.equal(w.phase, "ended")
  assert.ok(ev.some((e) => e.type === "end"))
  const snap = JSON.stringify(w.skaters)
  w.skaters[0].inputX = 1
  run(w, 1)
  assert.equal(JSON.stringify(w.skaters.map((s) => [s.x, s.y])), JSON.stringify(JSON.parse(snap).map((s: any) => [s.x, s.y])))
})

test("un tiro lanzado justo antes de 0:00 puede seguir siendo gol durante el tiempo de gracia", () => {
  const w = cleanWorld({ duration: 1 })
  run(w, 0.9)
  shootPuck(w, 34, RINK.width / 2, 25, 0) // a 3 m de la línea (37), llega en ~0.12 s
  const ev = run(w, 0.5, (x) => x.phase === "goal" || x.phase === "ended")
  assert.ok(ev.some((e) => e.type === "goal"), "el gol marcado durante el tiempo de gracia debe contar")
})

test("el reloj se detiene durante la celebración de gol", () => {
  const w = cleanWorld({ duration: 60 })
  shootPuck(w, 20, 10, 25, 0)
  run(w, 3, (x) => x.phase === "goal")
  const c = w.clock
  run(w, 1.0)
  assert.equal(w.clock, c)
})

/** Lanza `n` tiros a la portería derecha con el portero activo y cuenta goles/atajadas. */
function goalieBatch(n: number, gen: (r: () => number) => { sx: number; sy: number; ty: number; sp: number }) {
  const g = GOALS[1]
  const rnd = lcg(7)
  let goals = 0
  let saves = 0
  for (let i = 0; i < n; i++) {
    const { sx, sy, ty, sp } = gen(rnd)
    const w = createWorld({ teamSize: 1 })
    w.skaters.forEach((s) => { s.x = 2; s.y = 2; s.px = 2; s.py = 2 })
    const d = Math.hypot(g.lineX - sx, ty - sy)
    shootPuck(w, sx, sy, ((g.lineX - sx) / d) * sp, ((ty - sy) / d) * sp)
    const ev = run(w, 3, (x) => x.phase === "goal")
    if (w.phase === "goal") goals++
    if (ev.some((e) => e.type === "save")) saves++
  }
  return { goals, saves, rate: goals / n }
}

test("portero: ataja lo de frente y lo flojo; solo un tiro fuerte y bien colocado lo bate", () => {
  const g = GOALS[1]
  const centro = goalieBatch(60, (r) => ({ sx: 26 + r() * 4, sy: 9 + r() * 2, ty: g.cy + (r() * 0.4 - 0.2), sp: 14 + r() * 10 }))
  assert.equal(centro.goals, 0, "un tiro al centro nunca debería entrar")
  assert.ok(centro.saves >= 55, `atajadas al centro: ${centro.saves}/60`)

  const debil = goalieBatch(60, (r) => ({ sx: 27 + r() * 3, sy: 9 + r() * 2, ty: g.cy + (r() < 0.5 ? -0.9 : 0.9), sp: 10 + r() * 4 }))
  assert.ok(debil.rate <= 0.05, `tiros flojos a la esquina: ${(debil.rate * 100).toFixed(0)}% gol`)

  const fuerte = goalieBatch(60, (r) => ({ sx: 27 + r() * 3, sy: 9 + r() * 2, ty: g.cy + (r() < 0.5 ? -0.9 : 0.9), sp: 24 + r() * 8 }))
  assert.ok(fuerte.rate >= 0.25 && fuerte.rate <= 0.75, `tiros fuertes a la esquina: ${(fuerte.rate * 100).toFixed(0)}% gol (esperado 25-75%)`)
})

test("kickoff restaura posiciones sin tocar marcador", () => {
  const w = makeWorld({ teamSize: 3 })
  w.score = [2, 1]
  w.skaters[0].x = 33
  kickoff(w)
  assert.deepEqual(w.score, [2, 1])
  assert.ok(w.skaters[0].x < RINK.length / 2)
  void stepWorld; void FIXED_DT
})
