import test from "node:test"
import assert from "node:assert/strict"
import { teammateAtPoint } from "../../lib/engine"
import { makeWorld, parkOthers, place } from "./helpers"

test("tocar a un compañero lo elige como receptor", () => {
  const w = makeWorld()
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10)
  assert.equal(teammateAtPoint(w, "L1", 20.3, 10.2, 1.5), "L2")
})

test("tocar lejos de todos no elige a nadie", () => {
  const w = makeWorld()
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10)
  assert.equal(teammateAtPoint(w, "L1", 30, 10, 1.5), null)
})

test("tocar al portador no es un pase", () => {
  const w = makeWorld()
  parkOthers(w, ["L1", "L2"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10)
  assert.equal(teammateAtPoint(w, "L1", 10, 10, 1.5), null)
})

test("tocar a un rival NO le pasa al compañero que esté cerca: gana el más cercano", () => {
  const w = makeWorld()
  parkOthers(w, ["L1", "L2", "V1"])
  place(w, "L1", 10, 10)
  place(w, "L2", 20, 10)
  place(w, "V1", 20.9, 10)
  // el toque cae a 0.1 m del rival y a 0.8 m del compañero: es el rival
  assert.equal(teammateAtPoint(w, "L1", 20.8, 10, 1.5), null)
  // pero tocando claramente al compañero sí es pase
  assert.equal(teammateAtPoint(w, "L1", 19.7, 10, 1.5), "L2")
})

test("elige al compañero más cercano cuando hay dos dentro del radio", () => {
  const w = makeWorld()
  parkOthers(w, ["L1", "L2", "L3"])
  place(w, "L1", 5, 10)
  place(w, "L2", 20, 10)
  place(w, "L3", 21, 10)
  assert.equal(teammateAtPoint(w, "L1", 20.7, 10, 2), "L3")
  assert.equal(teammateAtPoint(w, "L1", 20.2, 10, 2), "L2")
})

test("un portador que no existe no rompe", () => {
  const w = makeWorld()
  assert.equal(teammateAtPoint(w, "ZZ", 10, 10, 5), null)
})
