import test from "node:test"
import assert from "node:assert/strict"
import { actionLayout } from "../../lib/game/action-layout"
import { createWorld, kick, findSkater, STAMINA, SUPER_SHOT_COST, powerFromFlick, SKATER } from "../../lib/engine"

test("rombo de botones: ningún par de botones se solapa (bug de la captura: FUERTE tapado por SÚPER)", () => {
  for (const [size, gap] of [[68, 12], [74, 14], [56, 8]] as const) {
    const { centers } = actionLayout(size, gap)
    const pts = Object.values(centers)
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dist = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
      assert.ok(dist >= size + gap - 1, `botones ${i}/${j} a ${dist.toFixed(1)}px con diámetro ${size}`)
    }
  }
})

test("rombo de botones: todos quedan dentro de la caja", () => {
  const size = 68
  const { box, centers } = actionLayout(size, 12)
  for (const [x, y] of Object.values(centers)) {
    assert.ok(x - size / 2 >= -0.5 && y - size / 2 >= -0.5 && x + size / 2 <= box + 0.5 && y + size / 2 <= box + 0.5)
  }
})

test("tiro fuerte a potencia máxima: súper con estrella (tanque >= costo), tiro fuerte normal sin ella", () => {
  const speed = powerFromFlick(4.2 + 1 * 1.8)
  assert.ok(speed >= STAMINA.superShotMinSpeed)
  for (const [stamina, expectSuper] of [[STAMINA.max, true], [SUPER_SHOT_COST - 1, false]] as const) {
    const w = createWorld() as any
    const s = w.skaters.find((k: any) => k.side === 0)
    w.phase = "play"
    w.puck.carrierId = s.id
    s.stamina = stamina
    assert.ok(kick(w, s.id, 0, speed))
    assert.equal(w.puck.superShot, expectSuper)
    assert.ok(Math.hypot(w.puck.vx, w.puck.vy) <= SKATER.kickMaxSpeed * 1.5)
  }
})

import { crowdSpacing } from "../../lib/game/draw"
test("tribuna: más lejos (zoom chico) = menos densidad, sin saltos continuos", () => {
  assert.ok(crowdSpacing(8, false) > crowdSpacing(12, false))
  assert.ok(crowdSpacing(12, false) > crowdSpacing(20, false))
  assert.equal(crowdSpacing(16, false), crowdSpacing(40, false))
  assert.ok(crowdSpacing(20, true) > crowdSpacing(20, false))
  // tres valores posibles nada más (así la caché de layout no se reconstruye a cada cuadro de zoom)
  const set = new Set([5, 8, 10.9, 11, 14, 15.9, 16, 30].map((p) => crowdSpacing(p, false)))
  assert.equal(set.size, 3)
})
