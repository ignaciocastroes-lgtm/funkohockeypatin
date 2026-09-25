import test from "node:test"
import assert from "node:assert/strict"
import { TouchInput, digitFromCode, isShootKey, keyboardVector } from "../../lib/game/input"
import { powerFromFlick } from "../../lib/engine/aim"
import { STAMINA } from "../../lib/engine/constants"

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
  assert.deepEqual(ev, { kind: "tap", x: 603, y: 201 }) // el toque ahora lleva su posición
})

test("dedo apoyado mucho rato sin moverse no dispara nada", () => {
  const i = mk()
  i.down(5, 600, 200, 1)
  assert.equal(i.up(5, 601, 200, 2.5), null)
})

test("estilo honda: el tiro sale para el lado CONTRARIO a como estiraste (arriba/abajo/derecha)", () => {
  const cases: Array<[number, number, number]> = [
    [0, -1, Math.PI / 2], // estiras para arriba -> tira para abajo
    [0, 1, -Math.PI / 2], // estiras para abajo -> tira para arriba
    [1, 0, Math.PI], // estiras para la derecha -> tira para la izquierda
    [-1, 0, 0], // estiras para la izquierda -> tira para la derecha
  ]
  for (const [dx, dy, want] of cases) {
    const i = mk()
    i.down(3, 600, 200, 0)
    for (let k = 1; k <= 5; k++) i.move(3, 600 + dx * k * 20, 200 + dy * k * 20, k * 0.01)
    const ev = i.up(3, 600 + dx * 120, 200 + dy * 120, 0.06)
    assert.equal(ev?.kind, "flick")
    if (ev?.kind === "flick") {
      const d = Math.atan2(Math.sin(ev.angle - want), Math.cos(ev.angle - want))
      assert.ok(Math.abs(d) < 0.05, `estirón (${dx},${dy}) debía tirar a ${want}, dio ${ev.angle}`)
    }
  }
})

test("potencia: cuanto más estiraste, más potencia — no importa la velocidad ni el camino", () => {
  const far = mk()
  far.down(1, 600, 250, 0)
  for (let k = 1; k <= 6; k++) far.move(1, 600, 250 - k * 30, k * 0.5) // recorrido largo, bien lento
  const f = far.up(1, 600, 250 - 6 * 30, 3)

  const near = mk()
  near.down(1, 600, 250, 0)
  for (let k = 1; k <= 12; k++) near.move(1, 600, 250 - k * 5, k * 0.01) // recorrido corto, bien rápido
  const n = near.up(1, 600, 250 - 60, 0.12)

  assert.equal(f?.kind, "flick")
  assert.equal(n?.kind, "flick")
  if (f?.kind === "flick" && n?.kind === "flick") {
    assert.ok(f.vhPerSec > n.vhPerSec, `lejos (lento) ${f.vhPerSec} vs cerca (rápido) ${n.vhPerSec} — solo importa la distancia`)
  }
})

test("potencia: un estirón corto (justo pasado el umbral de toque) da la potencia mínima, no cero", () => {
  const i = mk()
  i.down(1, 600, 250, 0)
  i.move(1, 630, 250, 0.1) // recorrido chico, apenas pasa el umbral de toque (23.4px con H=360)
  const ev = i.up(1, 630, 250, 0.2)
  assert.equal(ev?.kind, "flick")
  if (ev?.kind === "flick") {
    assert.ok(ev.vhPerSec >= 1.2 && ev.vhPerSec < 2, `esperaba potencia mínima, dio ${ev.vhPerSec}`)
    assert.ok(Math.abs(ev.angle - Math.PI) < 0.05, "estiró a la derecha, debe tirar a la izquierda")
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

test("pase de un dedo: mientras el dedo de movimiento está apoyado, el joystick sigue funcionando y el otro dedo pasa igual", () => {
  const i = mk()
  i.down(1, 150, 200, 0)
  i.move(1, 150 + i.radius, 200, 0.02)
  assert.ok(i.moveX > 0.9)
  i.down(2, 600, 200, 0.1)
  const ev = i.up(2, 602, 200, 0.2)
  assert.deepEqual(ev, { kind: "tap", x: 602, y: 200 })
  assert.ok(i.moveX > 0.9, "el joystick no se interrumpe")
})

test("esquema botones: cualquier toque es el stick (no hay zona de acción), y un segundo dedo no hace nada", () => {
  const i = mk({ buttonsMode: true })
  i.down(1, 700, 300, 0) // del lado "derecho": en el esquema normal sería acción, acá es stick igual
  i.move(1, 700, 250, 0.05)
  assert.ok(i.moveY < 0, "el toque del lado derecho debe mover el stick, no apuntar")
  assert.equal(i.aim, null, "no hay zona de acción en este esquema")
  i.down(2, 100, 100, 0.06) // segundo dedo: no hace nada, ya hay stick
  assert.equal(i.up(2, 100, 100, 0.07), null)
})

test("un estirón bien a fondo llega a velocidad de supertiro de verdad (integrado con powerFromFlick)", () => {
  const i = mk()
  i.down(1, 600, 250, 0)
  // estirón bien largo: bastante más allá de FLICK_MAX_DIST (0.32 * H=360 = 115px) para asegurar el tope
  i.move(1, 600, 400, 0.1)
  const ev = i.up(1, 600, 400, 0.15)
  assert.equal(ev?.kind, "flick")
  if (ev?.kind === "flick") {
    const speed = powerFromFlick(ev.vhPerSec)
    assert.ok(speed >= STAMINA.superShotMinSpeed, `un estirón a fondo debería llegar a supertiro: ${speed} vs ${STAMINA.superShotMinSpeed}`)
  }
})

test("un estirón chico (recién pasado el toque) NO llega a supertiro", () => {
  const i = mk()
  i.down(1, 600, 250, 0)
  i.move(1, 630, 250, 0.05) // apenas pasa el umbral de toque, lejos del máximo
  const ev = i.up(1, 630, 250, 0.08)
  assert.equal(ev?.kind, "flick")
  if (ev?.kind === "flick") {
    const speed = powerFromFlick(ev.vhPerSec)
    assert.ok(speed < STAMINA.superShotMinSpeed, `un estirón chico no debería ser supertiro: ${speed}`)
  }
})
