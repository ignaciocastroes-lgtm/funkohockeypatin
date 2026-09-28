import test from "node:test"
import assert from "node:assert/strict"
import { qrMatrix, qrSvg } from "../../lib/game/qr"

// La prueba de verdad (decodificar con un lector real) es scripts/verify-qr.py con OpenCV; acá se
// cuida la estructura para que un cambio que rompa el estándar no pase desapercibido.

test("QR: tamaño por versión (v1=21, v2=25, v3=29) y matriz cuadrada", () => {
  assert.equal(qrMatrix("A").length, 21)
  assert.equal(qrMatrix("https://ardisport.cl").length, 25)
  assert.equal(qrMatrix("https://ardisport.cl/?sala=7KQ2&lang=pt").length, 29)
  const m = qrMatrix("hola")
  assert.ok(m.every((r) => r.length === m.length))
})

test("QR: los tres patrones de esquina (7x7) y el módulo oscuro fijo están donde manda el estándar", () => {
  const m = qrMatrix("https://ardisport.cl")
  const n = m.length
  const finder = (x0: number, y0: number) => {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6
      const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
      assert.equal(m[y0 + dy][x0 + dx], edge || core, `finder en (${x0},${y0}) módulo (${dx},${dy})`)
    }
  }
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7)
  assert.equal(m[n - 8][8], true, "módulo oscuro fijo")
  for (let i = 8; i < n - 8; i++) assert.equal(m[6][i], i % 2 === 0, "timing horizontal")
})

test("QR: es determinista, cambia con el texto, y un texto muy largo falla con un error claro", () => {
  assert.deepEqual(qrMatrix("SALA-7KQ2"), qrMatrix("SALA-7KQ2"))
  assert.notDeepEqual(qrMatrix("SALA-7KQ2"), qrMatrix("SALA-7KQ3"))
  assert.throws(() => qrMatrix("x".repeat(400)), /demasiado largo/)
})

test("QR: el SVG trae zona de silencio de 4 módulos y no se cuela HTML del texto", () => {
  const svg = qrSvg("<script>alert(1)</script>", 100)
  assert.ok(svg.startsWith("<svg") && svg.includes("viewBox"))
  assert.ok(!svg.includes("<script"))
  const n = qrMatrix("A").length
  assert.ok(qrSvg("A").includes(`viewBox="0 0 ${n + 8} ${n + 8}"`))
})
