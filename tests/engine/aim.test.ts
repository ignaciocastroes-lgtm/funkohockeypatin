import test from "node:test"
import assert from "node:assert/strict"
import { GOAL, assistAim, bestPassTarget, powerFromFlick, passSpeedFor, kick, GOALS } from "../../lib/engine"
import { cleanWorld, makeWorld, parkOthers, place, run } from "./helpers"

test("potencia del deslizamiento: roce suave = pase corto, latigazo = tiro fuerte, monótona", () => {
  const a = powerFromFlick(0.5), b = powerFromFlick(2), c = powerFromFlick(4), d = powerFromFlick(9)
  assert.ok(a === 9 && a < b && b < c && c < d, [a, b, c, d].join(","))
  assert.ok(d <= 30.0001)
})

test("un deslizamiento cerca de un compañero se convierte en pase exacto a él", () => {
  const w = makeWorld({ teamSize: 2 })
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 22, 14)
  const exact = Math.atan2(4, 12)
  const r = assistAim(w, "L1", exact + 0.15, 10) // ~9° desviado
  assert.equal(r.target, "teammate")
  assert.equal(r.targetId, "L2")
  assert.ok(Math.abs(r.angle - exact) < 1e-9)
  assert.ok(r.speed >= passSpeedFor(Math.hypot(12, 4)) - 1e-9, "no debe quedarse corto")
})

test("el pase se adelanta a donde va el compañero", () => {
  const w = makeWorld({ teamSize: 2 })
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10, 0, 6) // corre hacia abajo
  const r = assistAim(w, "L1", 0.05, 14)
  assert.equal(r.target, "teammate")
  assert.ok(r.angle > 0.1, `debería apuntar por delante del receptor: ${r.angle}`)
})

test("un deslizamiento lejos de todo se queda como lo dibujó el dedo", () => {
  const w = makeWorld({ teamSize: 2 })
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 22, 14)
  const r = assistAim(w, "L1", -Math.PI / 2, 12)
  assert.equal(r.target, "free")
  assert.equal(r.angle, -Math.PI / 2)
})

test("tiros que van 'casi' a la boca se encuadran, respetando la esquina elegida", () => {
  const g = GOALS[1]
  for (const off of [-0.9, 0, 0.9]) {
    for (const miss of [0.0, 0.5, -0.5]) {
      const w = cleanWorld()
      const s = place(w, "L1", 29, 10)
      w.puck.carrierId = "L1"
      const aimY = g.cy + off + miss * (off === 0 ? 0.3 : 1) // un poco desviado
      const raw = Math.atan2(aimY - s.y, g.lineX - s.x)
      const r = assistAim(w, "L1", raw, 26)
      const yAtLine = s.y + Math.tan(r.angle) * (g.lineX - s.x)
      assert.ok(Math.abs(yAtLine - g.cy) <= GOAL.mouth / 2 - 0.29, `fuera de la boca: y=${yAtLine.toFixed(2)} off=${off} miss=${miss}`)
      if (Math.abs(aimY - g.cy) < GOAL.mouth / 2 - 0.3) assert.ok(Math.abs(yAtLine - aimY) < 1e-6, "debe respetar la esquina elegida")
    }
  }
})

test("un tiro de verdad muy desviado NO se corrige", () => {
  const w = cleanWorld()
  const s = place(w, "L1", 29, 10)
  const g = GOALS[1]
  const raw = Math.atan2(g.cy + 6 - s.y, g.lineX - s.x)
  assert.equal(assistAim(w, "L1", raw, 26).target, "free")
})

test("de extremo a extremo: deslizamiento hacia la esquina + patada = gol", () => {
  const g = GOALS[1]
  const w = cleanWorld()
  const s = place(w, "L1", 30, 10)
  w.puck.carrierId = "L1"
  s.stickAngle = 0
  run(w, 0.02)
  const raw = Math.atan2(g.cy + 1.4 - s.y, g.lineX - s.x) // apuntó ligeramente afuera del poste
  const r = assistAim(w, "L1", raw, 28)
  assert.ok(kick(w, "L1", r.angle, r.speed))
  run(w, 2, (x) => x.phase === "goal")
  assert.equal(w.phase, "goal")
})

test("toque: elige al compañero libre por delante antes que al tapado", () => {
  const w = makeWorld({ teamSize: 3 })
  parkOthers(w, ["L1", "L2", "L3", "V1"])
  place(w, "L1", 10, 10, 5, 0)
  place(w, "L2", 22, 10)   // adelante pero con un rival en medio
  place(w, "L3", 20, 16)   // adelante y libre
  place(w, "V1", 16, 10)
  assert.equal(bestPassTarget(w, "L1"), "L3")
})
