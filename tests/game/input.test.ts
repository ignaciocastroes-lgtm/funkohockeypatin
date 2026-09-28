import test from "node:test"
import assert from "node:assert/strict"
import { TouchInput, digitFromCode, isShootKey, keyboardVector } from "../../lib/game/input"

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

test("teclado: WASD y flechas dan el mismo vector, diagonal normalizada", () => {
  assert.deepEqual(keyboardVector(new Set()), { x: 0, y: 0 })
  assert.deepEqual(keyboardVector(new Set(["KeyD"])), { x: 1, y: 0 })
  assert.deepEqual(keyboardVector(new Set(["ArrowRight"])), { x: 1, y: 0 })
  assert.deepEqual(keyboardVector(new Set(["KeyA"])), { x: -1, y: 0 })
  assert.deepEqual(keyboardVector(new Set(["KeyW"])), { x: 0, y: -1 })
  assert.deepEqual(keyboardVector(new Set(["KeyS"])), { x: 0, y: 1 })
  const diag = keyboardVector(new Set(["KeyW", "KeyD"]))
  assert.ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9, "la diagonal no debe ser más rápida")
  assert.ok(diag.x > 0 && diag.y < 0)
})

test("teclado: teclas opuestas se cancelan", () => {
  assert.deepEqual(keyboardVector(new Set(["KeyA", "KeyD"])), { x: 0, y: 0 })
  assert.deepEqual(keyboardVector(new Set(["KeyW", "KeyS", "ArrowLeft", "ArrowRight"])), { x: 0, y: 0 })
})

test("teclado: teclas ajenas al movimiento no hacen nada", () => {
  assert.deepEqual(keyboardVector(new Set(["ShiftLeft", "Tab"])), { x: 0, y: 0 })
})

test("teclado: Espacio es la tecla de tiro/pase, ninguna otra lo es", () => {
  assert.equal(isShootKey("Space"), true)
  assert.equal(isShootKey("Enter"), false)
  assert.equal(isShootKey("KeyW"), false)
})

test("atajo secreto: los dígitos se leen de la tecla física, así funciona con Shift apretado", () => {
  for (let d = 0; d <= 9; d++) {
    assert.equal(digitFromCode(`Digit${d}`), String(d))
    assert.equal(digitFromCode(`Numpad${d}`), String(d))
  }
  for (const c of ["KeyA", "Space", "ShiftLeft", "Escape", "NumpadAdd", "Digit", "Digit10", ""]) assert.equal(digitFromCode(c), null)
})

// ---------- pase de un dedo: tocar al compañero con el mismo dedo del joystick ----------

test("pase de un dedo: un toque rápido del dedo de movimiento es un tap estricto con su posición", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  const ev = i.up(1, 152, 201, 0.12)
  assert.deepEqual(ev, { kind: "tap", x: 152, y: 201, strict: true })
  assert.equal(i.moveX, 0)
  assert.equal(i.stick, null)
})

test("pase de un dedo: si el dedo de movimiento arrastra el joystick NO es un pase", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  i.move(1, 150 + i.radius, 200, 0.05)
  assert.equal(i.up(1, 150 + i.radius, 200, 0.1), null)
})

test("pase de un dedo: arrastrar y volver al punto de apoyo tampoco cuenta (fue un movimiento, no un toque)", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  i.move(1, 150 + i.radius, 200, 0.04)
  i.move(1, 150, 200, 0.08)
  assert.equal(i.up(1, 150, 200, 0.12), null)
})

test("pase de un dedo: apoyar el dedo de movimiento mucho rato y soltar no es un pase", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  assert.equal(i.up(1, 151, 200, 1.5), null)
})


test("un solo esquema: cualquier toque, de cualquier lado, es el stick — no hay zona de acción", () => {
  for (const x of [100, 700]) {
    const i = mk()
    i.down(1, x, 300, 0)
    i.move(1, x, 250, 0.05)
    assert.ok(i.moveY < 0, `el toque en x=${x} debe mover el stick`)
  }
})

test("un segundo dedo en pantalla no hace nada (los botones son DOM aparte) y no interrumpe el stick", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  i.move(1, 150 + i.radius, 200, 0.02)
  i.down(2, 600, 200, 0.1)
  assert.equal(i.up(2, 602, 200, 0.2), null, "el segundo dedo no genera pase ni tiro")
  assert.ok(i.moveX > 0.9, "el joystick no se interrumpe")
})

test("toque corto del dedo del stick sin arrastrar = tap estricto; apoyado mucho rato = nada", () => {
  const a = mk()
  a.down(5, 600, 200, 1)
  assert.deepEqual(a.up(5, 603, 201, 1.12), { kind: "tap", x: 603, y: 201, strict: true })
  const b = mk()
  b.down(5, 600, 200, 1)
  assert.equal(b.up(5, 601, 200, 2.5), null)
})

test("cancelar limpia el estado y la velocidad; un dedo ajeno no cancela el stick", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  i.move(1, 250, 200, 0.02)
  i.cancel(99)
  assert.ok(i.stick, "cancelar otro dedo no toca el stick")
  i.cancel(1)
  assert.equal(i.moveX, 0)
  assert.equal(i.stick, null)
  i.down(2, 600, 200, 0.1) // vuelve a quedar libre para un dedo nuevo
  assert.ok(i.stick)
})

test("ya no existe el gesto de estirar y soltar: arrastrar lejos y soltar no devuelve ningún evento", () => {
  const i = mk()
  i.down(1, 600, 250, 0)
  i.move(1, 600, 400, 0.1)
  assert.equal(i.up(1, 600, 400, 0.15), null)
})
