import test from "node:test"
import assert from "node:assert/strict"
import { CAMERA, Camera, RINK, selectControlled } from "../../lib/engine"
import { makeWorld, place, shootPuck } from "./helpers"

const VW = 844, VH = 390

test("la cámara nunca muestra mucho más allá de las vallas", () => {
  const w = makeWorld({ teamSize: 2 })
  const cam = new Camera()
  for (const [px, py] of [[0, 0], [RINK.length, RINK.width], [0, RINK.width], [RINK.length, 0], [20, 10]]) {
    shootPuck(w, px, py, 0, 0)
    for (let i = 0; i < 240; i++) cam.update(1 / 60, w, "L1", VW, VH)
    const halfW = cam.width / 2, halfH = cam.height / 2
    assert.ok(cam.cx - halfW >= -CAMERA.edgeMargin - 1e-6, `izq ${cam.cx - halfW}`)
    assert.ok(cam.cx + halfW <= RINK.length + CAMERA.edgeMargin + 1e-6)
    assert.ok(cam.cy - halfH >= -CAMERA.edgeMargin - 1e-6)
    assert.ok(cam.cy + halfH <= RINK.width + CAMERA.edgeMargin + 1e-6)
  }
})

test("toScreen/toWorld son inversas", () => {
  const w = makeWorld({ teamSize: 1 })
  const cam = new Camera()
  cam.update(1 / 60, w, "L1", VW, VH)
  for (const [x, y] of [[3, 4], [20, 10], [37.5, 19]]) {
    const s = cam.toScreen(x, y)
    const b = cam.toWorld(s.x, s.y)
    assert.ok(Math.abs(b.x - x) < 1e-9 && Math.abs(b.y - y) < 1e-9)
  }
})

test("un jugador de 0.9 m mide un tamaño jugable en pantalla de móvil", () => {
  const w = makeWorld({ teamSize: 1 })
  const cam = new Camera()
  cam.update(1 / 60, w, "L1", VW, VH)
  const px = 0.9 * cam.ppm
  assert.ok(px >= 25 && px <= 60, `jugador = ${px.toFixed(1)} px`)
})

test("se aleja solo en pases largos y vuelve", () => {
  const w = makeWorld({ teamSize: 2 })
  const cam = new Camera()
  place(w, "L1", 8, 10)
  shootPuck(w, 8.5, 10, 0, 0)
  for (let i = 0; i < 120; i++) cam.update(1 / 60, w, "L1", VW, VH)
  const near = cam.width
  shootPuck(w, 30, 10, 0, 0)
  for (let i = 0; i < 240; i++) cam.update(1 / 60, w, "L1", VW, VH)
  assert.ok(cam.width > near + 5, `${near} -> ${cam.width}`)
  shootPuck(w, 9, 10, 0, 0)
  for (let i = 0; i < 400; i++) cam.update(1 / 60, w, "L1", VW, VH)
  assert.ok(Math.abs(cam.width - near) < 0.5)
})

test("la cámara converge igual a 30 y a 144 fps", () => {
  const out: number[] = []
  for (const fps of [30, 144]) {
    const w = makeWorld({ teamSize: 1 })
    const cam = new Camera()
    place(w, "L1", 10, 10)
    shootPuck(w, 10.7, 10, 0, 0)
    cam.update(1 / fps, w, "L1", VW, VH)
    place(w, "L1", 24, 8)
    shootPuck(w, 24.7, 8, 0, 0)
    for (let i = 0; i < 2 * fps; i++) cam.update(1 / fps, w, "L1", VW, VH)
    out.push(cam.cx)
  }
  assert.ok(Math.abs(out[0] - out[1]) < 1e-6, JSON.stringify(out))
})

test("selectControlled: el portador manda; si no, el más cercano con histéresis", () => {
  const w = makeWorld({ teamSize: 3 })
  place(w, "L1", 10, 10); place(w, "L2", 14, 10); place(w, "L3", 30, 4)
  w.puck.carrierId = "L2"
  assert.equal(selectControlled(w, 0, "L1"), "L2")
  w.puck.carrierId = null
  shootPuck(w, 12.2, 10, 0, 0)
  assert.equal(selectControlled(w, 0, "L1"), "L1") // histéresis: L1 sigue siendo válido
  shootPuck(w, 15.5, 10, 0, 0)
  assert.equal(selectControlled(w, 0, "L1"), "L2")
  // un pase en vuelo hacia L3: el control salta al receptor
  shootPuck(w, 24, 6, 12, -1.5)
  assert.equal(selectControlled(w, 0, "L1"), "L3")
})
