import test from "node:test"
import assert from "node:assert/strict"
import { kick, setInput } from "../../lib/engine"
import { GOALS, makeWorld, parkOthers, place, run, shootPuck } from "./helpers"

// ---------- crease: semicírculo solo del lado de la cancha ----------

test("crease: detrás de la red ya no expulsa (se puede envolver el arco)", () => {
  const g = GOALS[1] // lineX=37, dir=1: "detrás" es x > 37
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", g.lineX + 1.6, g.cy) // 1.6 m detrás de la línea, libre de la red física
  run(w, 0.3)
  assert.ok(Math.abs(s.x - (g.lineX + 1.6)) < 0.05, `no debería moverse por la crease estando detrás (x=${s.x})`)
})

test("crease: adelante (del lado de la cancha) sigue empujando igual que antes", () => {
  const g = GOALS[1]
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", g.lineX - 1.6, g.cy) // misma distancia, pero del lado de la cancha
  run(w, 0.3)
  assert.ok(s.x < g.lineX - 1.6 - 0.05, `del lado de la cancha la crease debe seguir empujando (x=${s.x})`)
})

// ---------- robo: cono explícito, no geometría accidental ----------

test("robo: por la espalda NO se puede, aunque esté pegado (cono explícito, no solo distancia)", () => {
  const w = makeWorld({ teamSize: 1 })
  const l1 = place(w, "L1", 15, 10)
  place(w, "V1", 14.9, 10) // pegadísimo, DETRÁS (L1 mira hacia +x)
  w.puck.carrierId = "L1"
  l1.heading = 0 // mira hacia +x
  const ev = run(w, 0.5)
  assert.ok(!ev.some((e) => e.type === "steal"), "a la espalda, ni pegado debería poder robar")
  assert.equal(w.puck.carrierId, "L1")
})

test("robo: de frente, a la misma distancia, sí se puede", () => {
  const w = makeWorld({ teamSize: 1 })
  const l1 = place(w, "L1", 15, 10)
  place(w, "V1", 15.1, 10) // misma distancia pero DELANTE
  w.puck.carrierId = "L1"
  l1.heading = 0
  const ev = run(w, 0.5)
  assert.ok(ev.some((e) => e.type === "steal" && e.id === "V1"), "de frente y pegado debería poder robar")
})

// ---------- time-on: solo si el puck está suelto o volando ----------

test("time-on: si el puck está pegado al palo cuando el reloj llega a 0, el partido termina ahí (sin gracia)", () => {
  const w = makeWorld({ teamSize: 1, duration: 1 })
  w.puck.carrierId = "L1"
  const ev = run(w, 1.05)
  assert.equal(w.phase, "ended", "con el puck en el palo no hay jugada 'en el aire' que salvar")
  assert.ok(ev.some((e) => e.type === "end"))
})

test("time-on: si el puck está suelto cuando el reloj llega a 0, sigue habiendo gracia", () => {
  const w = makeWorld({ teamSize: 1, duration: 1 })
  assert.equal(w.puck.carrierId, null)
  run(w, 1.05)
  assert.equal(w.phase, "timeOn", "suelto: sigue valiendo el tiempo de gracia de siempre")
})

// ---------- peso de la pelota: un roce incidental no la manda volando ----------

test("peso: un patinador que pasa cerca de un puck suelto y lento no lo manda muy lejos", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 10, 10)
  s.vx = 6; s.vy = 0 // corriendo rápido
  const skaterSpeed = s.vx
  w.puck.x = 10.5; w.puck.y = 10 // el puck queda justo en su camino, quieto
  w.puck.vx = 0; w.puck.vy = 0
  run(w, 0.15)
  const sp = Math.hypot(w.puck.vx, w.puck.vy)
  assert.ok(sp < skaterSpeed, `un roce no debería mandarlo más rápido que el propio patinador que lo tocó (puck ${sp} m/s, patinador ${skaterSpeed} m/s)`)
})

test("peso: un pase demasiado caliente rebota y a quien le pega no lo puede atrapar en el instante", () => {
  const w = makeWorld({ teamSize: 2 })
  place(w, "L1", 10, 10)
  const l2 = place(w, "L2", 20, 10)
  w.puck.carrierId = "L1"
  w.puck.x = 10; w.puck.y = 10
  run(w, 0.02)
  assert.ok(kick(w, "L1", 0, 30))
  const ev = run(w, 0.5)
  assert.ok(ev.some((e) => e.type === "deflect" && e.id === "L2"), "debería rebotar en L2")
  assert.ok(!ev.some((e) => e.type === "pickup" && e.id === "L2"), "no debería quedárselo al toque, aunque la física lo haya frenado")
})

// ---------- trayectoria curva: un tiro tomado de costado sale con efecto ----------

test("efecto: un tiro recto (patinador quieto) no tiene curvatura", () => {
  const w = makeWorld({ teamSize: 1 })
  place(w, "L1", 10, 10)
  w.puck.carrierId = "L1"
  w.puck.x = 10; w.puck.y = 10
  assert.ok(kick(w, "L1", 0, 20))
  assert.equal(w.puck.spin, 0)
})

test("efecto: un pase (aunque el patinador se mueva de costado) no curva", () => {
  const w = makeWorld({ teamSize: 1 })
  const s = place(w, "L1", 10, 10)
  s.vy = 6 // corriendo de costado al pase
  w.puck.carrierId = "L1"
  w.puck.x = 10; w.puck.y = 10
  assert.ok(kick(w, "L1", 0, 10)) // pase, no tiro
  assert.equal(w.puck.spin, 0)
})

test("efecto: un tiro tomado corriendo de costado sale con efecto, y termina desviado de la línea recta", () => {
  const w = makeWorld({ teamSize: 1, goalies: false })
  const s = place(w, "L1", 10, 10)
  s.vy = 6 // corre hacia +y mientras tira hacia +x: efecto real
  w.puck.carrierId = "L1"
  w.puck.x = 10; w.puck.y = 10
  assert.ok(kick(w, "L1", 0, 20)) // tiro recto en +x
  assert.notEqual(w.puck.spin, 0, "un tiro de costado debe salir con efecto")
  const straightLineY = 10 // si fuera recto, y no cambiaría
  run(w, 1.2)
  assert.ok(Math.abs(w.puck.y - straightLineY) > 0.3, `debería haberse desviado de la línea recta (y=${w.puck.y})`)
})

test("efecto: se apaga con el vuelo (un tiro largo no da una vuelta imposible)", () => {
  const w = makeWorld({ teamSize: 1, goalies: false })
  const s = place(w, "L1", 10, 10)
  s.vy = 6
  w.puck.carrierId = "L1"
  w.puck.x = 10; w.puck.y = 10
  assert.ok(kick(w, "L1", 0, 20))
  const spin0 = Math.abs(w.puck.spin)
  run(w, 1.5)
  assert.ok(Math.abs(w.puck.spin) < spin0, "el efecto debería ir apagándose con el tiempo")
})

// ---------- penal: cada 3 faltas de un equipo, el rival cobra un penal ----------

test("penal: a la 3ª falta del mismo equipo, el rival queda mano a mano (capitán + arquero, el resto lejos)", () => {
  const w = makeWorld({ teamSize: 4 })
  const g = GOALS[0] // el arco que ataca V (rival de L, que es quien va a acumular las faltas)
  parkOthers(w, ["L2", "L3", "L4", "V2", "V3", "V4"])
  // L2/L3/L4 son "equilibrado"/"veloz"/"equilibrado" (tope 7.0/8.4/7.0 m/s): a L1 ("pesado", tope
  // 5.8) no le alcanza para superar el umbral de falta por sí solo, sin importar qué velocidad le
  // fuerce acá — lo frena su propio tope de velocidad.
  place(w, "L3", 34, 2); place(w, "L4", 34, 4)
  place(w, "V3", 34, 16); place(w, "V4", 34, 18)
  const chargeOnce = (chargerId: string, victimId: string, y: number) => {
    shootPuck(w, 30, 3, 0, 0) // la pelota lejos, que no se cruce en el camino
    place(w, victimId, 12, y, 0, 0)
    const c = place(w, chargerId, 8, y, 9.5, 0)
    c.pickupCooldown = 1e9
    setInput(w, chargerId, 1, 0)
    run(w, 1)
    setInput(w, chargerId, 0, 0)
  }
  chargeOnce("L2", "V2", 5)
  chargeOnce("L3", "V3", 10)
  chargeOnce("L4", "V4", 15)
  assert.ok(w.fouls[0] >= 3, `deberían haberse acumulado 3 faltas de L (hubo ${w.fouls[0]})`)
  const shooter = w.skaters.find((s) => s.side === 1 && s.isCaptain)!
  assert.equal(w.puck.carrierId, shooter.id, "el capitán de V debe quedar con la pelota para tirar")
  assert.ok(Math.abs(shooter.x - (g.lineX - g.dir * 7.4)) < 0.01, "parado en el punto de penal")
  for (const s of w.skaters) {
    if (s.id === shooter.id) continue
    const d = Math.hypot(s.x - shooter.x, s.y - shooter.y)
    assert.ok(d > 8, `${s.id} debería estar lejos del mano a mano (quedó a ${d.toFixed(1)}m)`)
  }
})
