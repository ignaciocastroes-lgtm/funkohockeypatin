import test from "node:test"
import assert from "node:assert/strict"
import { GLYPH_CHARS, drawGlyphs, glyphWidth } from "../../lib/game/glyphs"

/** Canvas espía: cuenta trazos/rellenos y guarda todo número que se le pasa, para detectar NaN/Infinity. */
function spyCtx() {
  const calls: string[] = []
  const nums: number[] = []
  const target: Record<string, unknown> = {}
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k]
      return (...a: unknown[]) => { calls.push(k); for (const v of a) if (typeof v === "number") nums.push(v) }
    },
    set(t, k: string, v) { t[k] = v; if (typeof v === "number") nums.push(v); return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, nums }
}

test("glifos: existen todos los dígitos, los dos puntos y las letras de la placa", () => {
  for (const ch of "0123456789:") assert.ok(GLYPH_CHARS.includes(ch), `falta ${ch}`)
  for (const word of ["FALTA", "GOL", "GOLAZO", "FIN"]) for (const ch of word) assert.ok(GLYPH_CHARS.includes(ch), `falta ${ch} de ${word}`)
})

test("glifos: están todas las letras de la marca ARDISPORT.CL", () => {
  for (const ch of "ARDISPORT.CL") assert.ok(GLYPH_CHARS.includes(ch), `falta ${ch}`)
  assert.ok(glyphWidth("ARDISPORT.CL", 8) > 0)
})

test("glifos: cada uno dibuja algo (trazo o relleno) y solo números finitos", () => {
  for (const ch of GLYPH_CHARS.replace(" ", "")) {
    const { ctx, calls, nums } = spyCtx()
    drawGlyphs(ctx, ch, 10, 10, 20, { color: "#fff" })
    assert.ok(calls.includes("stroke") || calls.includes("fill"), `"${ch}" no dibuja nada`)
    assert.ok(nums.every(Number.isFinite), `"${ch}" produjo un número no finito`)
  }
})

test("glifos: el ancho crece con la altura y con la cantidad de caracteres", () => {
  assert.ok(glyphWidth("00", 40) > glyphWidth("0", 40))
  assert.ok(Math.abs(glyphWidth("00", 40) - 2 * glyphWidth("00", 20)) < 1e-9)
  assert.equal(glyphWidth("", 30), 0)
})

test("glifos: lo que dibuja coincide con lo que mide, y el alineado mueve el punto de arranque", () => {
  const { ctx } = spyCtx()
  assert.equal(drawGlyphs(ctx, "12:34", 0, 0, 30, { color: "#fff", align: "center" }), glyphWidth("12:34", 30))
  const l = spyCtx(); const c = spyCtx(); const r = spyCtx()
  drawGlyphs(l.ctx, "00", 100, 0, 30, { color: "#fff", align: "left" })
  drawGlyphs(c.ctx, "00", 100, 0, 30, { color: "#fff", align: "center" })
  drawGlyphs(r.ctx, "00", 100, 0, 30, { color: "#fff", align: "right" })
  // el primer número que recibe el canvas es el `translate(x, y)` del primer glifo = dónde arranca el texto
  const total = glyphWidth("00", 30)
  assert.equal(l.nums[0], 100)
  assert.ok(Math.abs(c.nums[0] - (100 - total / 2)) < 1e-9)
  assert.ok(Math.abs(r.nums[0] - (100 - total)) < 1e-9)
})

test("glifos: un carácter desconocido se ignora sin romper", () => {
  const { ctx, nums } = spyCtx()
  assert.doesNotThrow(() => drawGlyphs(ctx, "1€?2", 0, 0, 20, { color: "#fff" }))
  assert.ok(nums.every(Number.isFinite))
  assert.equal(glyphWidth("€?", 20), 0)
})
