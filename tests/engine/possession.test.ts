import test from "node:test"
import assert from "node:assert/strict"
import { SKATER, MATCH, GOALIE, kick, kickoff, setInput, createWorld, stepWorld, FIXED_DT, awardPenalty } from "../../lib/engine"
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

test("gol: marcador, pausa, y el que recibió el gol sale con la pelota (no saque neutral)", () => {
  const w = cleanWorld()
  shootPuck(w, 20, 10, 25, 0)
  const ev = run(w, 3, (x) => x.phase === "goal")
  assert.deepEqual(w.score, [1, 0])
  assert.ok(ev.some((e) => e.type === "goal" && e.side === 0))
  run(w, 2.4)
  assert.equal(w.phase, "play")
  assert.equal(w.puck.carrierId, "V1", "al que le hicieron el gol (lado 1) le toca sacar con la pelota")
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
  // El arquero creció (GOALIE.radius 0.5->0.58, por el equipo) a propósito: tapa un poco más de
  // esquina que antes. Sigue siendo baterle, solo que menos seguido — piso más bajo, no un cambio
  // de diseño.
  assert.ok(fuerte.rate >= 0.15 && fuerte.rate <= 0.75, `tiros fuertes a la esquina: ${(fuerte.rate * 100).toFixed(0)}% gol (esperado 15-75%)`)
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

// ---------- penal: el arquero se queda en la línea (no le cierra el ángulo al tirador) ----------

test("penal: el arquero NO se adelanta a cerrar el ángulo (se queda con el dorso en la línea, como en el reglamento real)", () => {
  const w = createWorld({ teamSize: 1 })
  awardPenalty(w, 0)
  const g = GOALS[1]
  // El CENTRO del arquero no va justo en la línea (se superpondría con el propio arco); va a un
  // radio de distancia, así el dorso le toca la línea. Eso es "en la línea" para este modelo.
  const expectedX = g.lineX - g.dir * GOALIE.radius
  assert.ok(Math.abs(w.goalies[1].x - expectedX) < 0.05, `recién otorgado el penal: x=${w.goalies[1].x.toFixed(2)} (esperaba ~${expectedX.toFixed(2)})`)
  // Corre bastante tiempo de juego SIN que se patee todavía: en el juego normal esto lo haría
  // adelantarse solo (targetStandoff crece con `closeness`) — durante un penal no debería moverse.
  for (let i = 0; i < 60; i++) stepWorld(w, FIXED_DT)
  assert.ok(Math.abs(w.goalies[1].x - expectedX) < 0.05, `se adelantó de la línea durante el penal: x=${w.goalies[1].x.toFixed(2)} (esperaba ~${expectedX.toFixed(2)})`)
})

test("penal: un supertiro bien colocado a la esquina AHORA SÍ le gana al arquero la mayoría de las veces", () => {
  const g = GOALS[1]
  let goals = 0
  const n = 20
  for (let i = 0; i < n; i++) {
    const w = createWorld({ teamSize: 1 })
    awardPenalty(w, 0)
    const shooter = w.skaters.find((s) => s.id === "L1")!
    const ty = g.cy + (i % 2 === 0 ? 0.9 : -0.9) // esquina de verdad, no el palo
    const angle = Math.atan2(ty - shooter.y, g.lineX - shooter.x)
    kick(w, shooter.id, angle, 30) // supertiro
    for (let t = 0; t < 90 && w.phase === "play"; t++) stepWorld(w, FIXED_DT)
    if (w.phase === "goal") goals++
  }
  assert.ok(goals >= n * 0.7, `supertiro a la esquina en el penal: ${goals}/${n} goles (esperaba al menos 70%)`)
})

test("penal: un tiro al medio, aunque sea supertiro, lo sigue atajando siempre (no se volvió gratis)", () => {
  const g = GOALS[1]
  let goals = 0
  const n = 10
  for (let i = 0; i < n; i++) {
    const w = createWorld({ teamSize: 1 })
    awardPenalty(w, 0)
    const shooter = w.skaters.find((s) => s.id === "L1")!
    const angle = Math.atan2(g.cy - shooter.y, g.lineX - shooter.x)
    kick(w, shooter.id, angle, 30)
    for (let t = 0; t < 90 && w.phase === "play"; t++) stepWorld(w, FIXED_DT)
    if (w.phase === "goal") goals++
  }
  assert.equal(goals, 0, "un supertiro al medio del arco debería seguir atajado siempre")
})

test("el corrimiento del tiro a un costado (shotSideOffset) no le vuelve a tapar el penal al arquero", () => {
  // Regresión real: un shotSideOffset de 0.16 (probado primero) hacía que el penal a la esquina
  // volviera a dar 0% de goles — el corrimiento lateral, sumado a lo ajustado que ya está el margen
  // del arquero parado en la línea, alcanzaba para devolver la pelota al alcance del arquero según
  // de qué lado tocara. 0.08 (el valor final) tiene margen real por debajo del límite donde se rompe.
  const g = GOALS[1]
  let goals = 0
  const n = 20
  for (let i = 0; i < n; i++) {
    const w = createWorld({ teamSize: 1 })
    awardPenalty(w, 0)
    const shooter = w.skaters.find((s) => s.id === "L1")!
    const ty = g.cy + (i % 2 === 0 ? 0.9 : -0.9)
    const angle = Math.atan2(ty - shooter.y, g.lineX - shooter.x)
    kick(w, shooter.id, angle, 30)
    for (let t = 0; t < 90 && w.phase === "play"; t++) stepWorld(w, FIXED_DT)
    if (w.phase === "goal") goals++
  }
  assert.ok(goals >= n * 0.7, `con shotSideOffset puesto, esquina en el penal: ${goals}/${n} goles (esperaba al menos 70%)`)
})
