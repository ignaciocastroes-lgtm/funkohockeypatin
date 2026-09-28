import test from "node:test"
import assert from "node:assert/strict"
import { STAMINA, SUPER_SHOT_COST, createWorld } from "../../lib/engine"
import { BTN_POWER, performButton, switchTarget, teammateInCone } from "../../lib/game/actions"
import { makeWorld, parkOthers, place, run, shootPuck } from "../engine/helpers"

function withCarrier(side: 0 | 1 = 0) {
  const w = makeWorld({ teamSize: 3 })
  const me = w.skaters.find((s) => s.side === side)!
  parkOthers(w, [me.id])
  place(w, me.id, 20, 10)
  shootPuck(w, 20.8, 10, 0, 0)
  w.puck.carrierId = me.id
  me.controlGrace = 0
  return { w, me }
}

test("acciones: con la pelota, el pad manda la dirección del tiro (no hacia donde mira)", () => {
  const { w, me } = withCarrier()
  me.heading = 0
  performButton(w, 0, me.id, "tiro", BTN_POWER.tiro, Math.PI / 2) // pad hacia abajo (+y)
  assert.equal(w.puck.carrierId, null)
  assert.ok(w.puck.vy > Math.abs(w.puck.vx) * 2, `debía salir hacia +y, salió (${w.puck.vx.toFixed(1)}, ${w.puck.vy.toFixed(1)})`)
})

test("acciones: pase con el pad apuntando a un compañero le pasa a ÉL y le da el control", () => {
  const { w, me } = withCarrier()
  const mates = w.skaters.filter((s) => s.side === 0 && s.id !== me.id)
  place(w, mates[0].id, 26, 10) // a la derecha
  place(w, mates[1].id, 14, 10) // a la izquierda
  const r = performButton(w, 0, me.id, "pase", BTN_POWER.pase, Math.PI) // pad a la izquierda
  assert.equal(r.lockReceiverId, mates[1].id)
  assert.ok(w.puck.vx < 0)
})

test("acciones: pase con el pad apuntando al vacío sale al espacio en esa dirección", () => {
  const { w, me } = withCarrier()
  const r = performButton(w, 0, me.id, "pase", BTN_POWER.pase, -Math.PI / 2) // arriba, sin nadie
  assert.equal(r.lockReceiverId, undefined)
  assert.equal(w.puck.carrierId, null)
  assert.ok(w.puck.vy < 0)
})

test("acciones: tiro fuerte es súper solo si el jugador tiene el tanque", () => {
  for (const [stamina, expected] of [[STAMINA.max, true], [SUPER_SHOT_COST - 1, false]] as const) {
    const { w, me } = withCarrier()
    me.stamina = stamina
    const r = performButton(w, 0, me.id, "tiro-fuerte", BTN_POWER["tiro-fuerte"], 0)
    assert.equal(!!r.superShot, expected)
  }
})

test("acciones: sin la pelota, los botones son quitar / cambio de jugador", () => {
  const w = makeWorld({ teamSize: 3 })
  const rival = w.skaters.find((s) => s.side === 1)!
  const me = w.skaters.find((s) => s.side === 0)!
  parkOthers(w, [me.id, rival.id])
  place(w, rival.id, 20, 10); place(w, me.id, 19, 10)
  shootPuck(w, 20.8, 10, 0, 0); w.puck.carrierId = rival.id; rival.controlGrace = 0; rival.heading = 0
  me.pickupCooldown = 0
  performButton(w, 0, me.id, "pase", 0.45, null) // QUITAR
  assert.equal(w.puck.carrierId, me.id, "quitar le sacó la pelota")

  // cambio de jugador: izquierda / derecha por el eje x, con vuelta al final
  const mates = w.skaters.filter((s) => s.side === 0)
  mates.forEach((m, i) => place(w, m.id, 10 + i * 8, 10)) // x = 10, 18, 26
  w.puck.carrierId = null
  const [a, b, c] = mates
  assert.equal(switchTarget(w, 0, b.id, -1), a.id)
  assert.equal(switchTarget(w, 0, b.id, 1), c.id)
  assert.equal(switchTarget(w, 0, a.id, -1), c.id, "sin nadie a la izquierda, da la vuelta al más lejano")
  assert.equal(switchTarget(w, 0, c.id, 1), a.id)
  const r = performButton(w, 0, b.id, "tiro", 0.6, null)
  assert.equal(r.switchTo, a.id)
})

test("acciones: el lado 1 (invitado) puede patear y defender igual que el lado 0", () => {
  const { w, me } = withCarrier(1)
  const r = performButton(w, 1, me.id, "tiro", BTN_POWER.tiro, Math.PI)
  assert.equal(w.puck.carrierId, null)
  assert.ok(w.puck.vx < 0, "el lado 1 tira hacia la izquierda si el pad va a la izquierda")
  assert.equal(r.superShot, undefined)
  assert.equal(teammateInCone(createWorld({ goalies: false }), "nadie", 0), null)
  run(w, 0.01)
})
