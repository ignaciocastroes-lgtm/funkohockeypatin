import test from "node:test"
import assert from "node:assert/strict"
import { SuperTrail } from "../../lib/game/effects"

test("estela de súper tiro: no siembra dos marcas si la pelota casi no se movió", () => {
  const t = new SuperTrail()
  t.mark(0, 0, 0)
  t.mark(0.02, 0, 10)
  assert.equal(t.live(10).length, 1, "el segundo punto está demasiado cerca del anterior")
})

test("estela de súper tiro: sí siembra una marca nueva una vez que se alejó lo suficiente", () => {
  const t = new SuperTrail()
  t.mark(0, 0, 0)
  t.mark(5, 0, 10) // bien lejos del primero
  assert.equal(t.live(10).length, 2)
})

test("estela de súper tiro: las marcas viejas se apagan solas", () => {
  const t = new SuperTrail()
  t.mark(0, 0, 0)
  assert.equal(t.live(0).length, 1, "recién sembrada, sigue viva")
  assert.equal(t.live(10_000).length, 0, "mucho después, ya se apagó")
})

test("estela de súper tiro: no crece sin límite (tope de puntos guardados)", () => {
  const t = new SuperTrail()
  // Todas nacidas en el mismo instante (nada se apaga por tiempo): solo importa el tope de la lista.
  for (let i = 0; i < 200; i++) t.mark(i * 2, 0, 0)
  assert.ok(t.live(0).length <= 40)
})
