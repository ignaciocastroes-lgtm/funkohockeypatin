import test from "node:test"
import assert from "node:assert/strict"
import { TouchInput } from "../../lib/game/input"

const W = 800
const H = 360
const mk = (o = {}) => new TouchInput({ width: W, height: H, ...o })

test("joystick flotante: nace donde tocas y da un vector proporcional", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  assert.equal(i.moveX, 0)
  i.move(1, 150 + i.radius, 200, 0.02) // radio completo a la derecha
  assert.ok(Math.abs(i.moveX - 1) < 1e-9 && Math.abs(i.moveY) < 1e-9)
  i.move(1, 150 + i.radius / 2, 200, 0.04)
  assert.ok(i.moveX > 0.3 && i.moveX < 0.7)
  i.up(1, 150, 200, 0.06)
  assert.equal(i.moveX, 0)
  assert.equal(i.stick, null)
})

test("joystick: zona muerta y la base sigue al dedo si te pasas del radio", () => {
  const i = mk()
  i.down(1, 100, 100, 0)
  i.move(1, 103, 100, 0.01)
  assert.equal(i.moveX, 0) // dentro de la zona muerta
  i.move(1, 100 + i.radius * 3, 100, 0.02)
  assert.ok(Math.abs(i.moveX - 1) < 1e-9)
  assert.ok(i.stick!.ox > 100) // la base se movió
  // volver hacia el origen original ya frena (la base está cerca del dedo)
  i.move(1, i.stick!.ox - i.radius, 100, 0.03)
  assert.ok(i.moveX < 0)
})

test("dos dedos a la vez: uno mueve, el otro dispara, sin interferirse", () => {
  const i = mk()
  i.down(1, 120, 250, 0)
  i.move(1, 120 + i.radius, 250, 0.01)
  i.down(2, 600, 200, 0.02)
  // el dedo de acción se mueve; el de movimiento conserva su vector
  i.move(2, 650, 150, 0.04)
  assert.ok(i.moveX > 0.99)
  const ev = i.up(2, 700, 100, 0.06)
  assert.equal(ev?.kind, "flick")
  assert.ok(i.moveX > 0.99) // el joystick sigue activo
})

test("toque corto sin deslizar = tap", () => {
  const i = mk()
  i.down(5, 600, 200, 1)
  const ev = i.up(5, 603, 201, 1.12)
  assert.deepEqual(ev, { kind: "tap" })
})

test("dedo apoyado mucho rato sin moverse no dispara nada", () => {
  const i = mk()
  i.down(5, 600, 200, 1)
  assert.equal(i.up(5, 601, 200, 2.5), null)
})

test("deslizamiento: el ángulo sigue la dirección del dedo (arriba/abajo/derecha)", () => {
  const cases: Array<[number, number, number]> = [
    [0, -1, -Math.PI / 2], // arriba
    [0, 1, Math.PI / 2], // abajo
    [1, 0, 0], // derecha
    [-1, 0, Math.PI], // izquierda
  ]
  for (const [dx, dy, want] of cases) {
    const i = mk()
    i.down(3, 600, 200, 0)
    for (let k = 1; k <= 5; k++) i.move(3, 600 + dx * k * 20, 200 + dy * k * 20, k * 0.01)
    const ev = i.up(3, 600 + dx * 120, 200 + dy * 120, 0.06)
    assert.equal(ev?.kind, "flick")
    if (ev?.kind === "flick") {
      const d = Math.atan2(Math.sin(ev.angle - want), Math.cos(ev.angle - want))
      assert.ok(Math.abs(d) < 0.05, `dir (${dx},${dy}) dio ${ev.angle}`)
    }
  }
})

test("potencia: latigazo rápido > roce lento, medida en alturas de pantalla por segundo", () => {
  const fast = mk()
  fast.down(1, 600, 250, 0)
  for (let k = 1; k <= 6; k++) fast.move(1, 600, 250 - k * 30, k * 0.01) // 3000 px/s
  const f = fast.up(1, 600, 250 - 6 * 30, 0.07)

  const slow = mk()
  slow.down(1, 600, 250, 0)
  for (let k = 1; k <= 12; k++) slow.move(1, 600, 250 - k * 5, k * 0.04) // 125 px/s
  const s = slow.up(1, 600, 250 - 60, 0.49)

  assert.equal(f?.kind, "flick")
  assert.equal(s?.kind, "flick")
  if (f?.kind === "flick" && s?.kind === "flick") {
    assert.ok(f.vhPerSec > 6, `rápido ${f.vhPerSec}`)
    assert.ok(s.vhPerSec < 1.5, `lento ${s.vhPerSec}`)
  }
})

test("si el dedo frena antes de soltar, usa el recorrido completo (pase suave)", () => {
  const i = mk()
  i.down(1, 600, 250, 0)
  for (let k = 1; k <= 4; k++) i.move(1, 600 + k * 25, 250, k * 0.02)
  i.move(1, 700, 250, 0.5) // se queda quieto
  const ev = i.up(1, 700, 250, 0.7)
  assert.equal(ev?.kind, "flick")
  if (ev?.kind === "flick") {
    assert.ok(Math.abs(ev.angle) < 0.05)
    assert.ok(ev.vhPerSec < 1.5)
  }
})

test("con el joystick ocupado, un segundo dedo en la misma mitad toma el rol de acción", () => {
  const i = mk()
  i.down(1, 150, 200, 0) // joystick
  i.down(2, 100, 100, 0.01) // también a la izquierda: pasa a ser dedo de acción
  i.move(2, 100, 60, 0.03)
  // un tercer dedo con los dos roles ocupados se ignora
  i.down(3, 300, 300, 0.035)
  assert.equal(i.up(3, 300, 300, 0.04), null)
  const ev = i.up(2, 100, 20, 0.05)
  assert.equal(ev?.kind, "flick")
})

test("zurdo: los roles se invierten", () => {
  const i = mk({ leftHanded: true })
  i.down(1, 150, 200, 0) // izquierda = acción
  i.down(2, 650, 200, 0)
  i.move(2, 650 + i.radius, 200, 0.02)
  assert.ok(i.moveX > 0.99)
  assert.equal(i.up(1, 152, 201, 0.1)?.kind, "tap")
})

test("cancelar limpia el estado y la velocidad", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  i.move(1, 250, 200, 0.02)
  i.cancel(1)
  assert.equal(i.moveX, 0)
  assert.equal(i.stick, null)
  i.down(2, 600, 200, 0)
  i.cancel(2)
  assert.equal(i.aim, null)
})
