import test from "node:test"
import assert from "node:assert/strict"
import { startSuddenDeath } from "../../lib/engine"
import { cleanWorld, place, run, shootPuck } from "./helpers"

test("muerte súbita: un gol termina el partido ahí mismo, sin jugar el resto del período", () => {
  const w = cleanWorld({ duration: 60 })
  startSuddenDeath(w, 60) // esto vuelve a poner a los patinadores en formación de saque
  place(w, "L1", 18, 19.2)
  place(w, "V1", 22, 19.2)
  for (const s of w.skaters) s.pickupCooldown = 1e9
  assert.equal(w.suddenDeath, true)
  assert.equal(w.clock, 60)
  shootPuck(w, 20, 10, 25, 0) // directo a la portería derecha
  const ev = run(w, 4, (x) => x.phase === "goal" || x.phase === "ended")
  assert.ok(ev.some((e) => e.type === "goal"), "el gol de oro debe registrarse")
  assert.equal(w.clock, 0, "el gol de oro corta el reloj: no sigue el resto del período")
  run(w, 3) // pausa de festejo + margen
  assert.equal(w.phase, "ended", "tras el gol de oro el partido termina, no vuelve al saque")
  const score = w.score[0] + w.score[1]
  run(w, 1)
  assert.equal(w.score[0] + w.score[1], score, "ya terminó: no se puede seguir anotando")
})

test("muerte súbita: sin gol, el período termina solo e igual el marcador sigue igualado", () => {
  const w = cleanWorld({ duration: 60 })
  w.score = [2, 2]
  startSuddenDeath(w, 0.3) // período cortito para el test
  run(w, 2.5)
  assert.equal(w.phase, "ended")
  assert.deepEqual(w.score, [2, 2], "sin gol de oro el marcador no se toca")
})

test("muerte súbita: se puede repetir un segundo período si el primero no tuvo gol", () => {
  const w = cleanWorld({ duration: 60 })
  startSuddenDeath(w, 0.2)
  run(w, 2)
  assert.equal(w.phase, "ended")
  startSuddenDeath(w, 60)
  assert.equal(w.phase, "play")
  assert.equal(w.clock, 60)
  assert.equal(w.suddenDeath, true)
})

// ---------- posesión: al que le hacen el gol, sale con la pelota ----------

test("posesión de saque: si anota el visita, el local sale con la pelota (no al revés)", () => {
  const w = cleanWorld({ duration: 90 })
  shootPuck(w, 20, 10, -25, 0) // directo al arco local: gol del visita
  run(w, 4, (x) => x.phase === "goal")
  assert.deepEqual(w.score, [0, 1])
  run(w, 2.4)
  assert.equal(w.phase, "play")
  assert.equal(w.puck.carrierId, "L1", "al local le hicieron el gol: sale él con la pelota")
})
