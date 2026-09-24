import test from "node:test"
import assert from "node:assert/strict"
import { newCup, recordResult } from "../../lib/app/cup"
import { DEFAULT_SETTINGS, STORAGE_KEY, load, save } from "../../lib/app/storage"
import { shouldShowCupTutorial } from "../../lib/app/tutorial"

class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}
const mem = () => new MemStorage() as unknown as Storage

const cup = () => newCup(["n-es", "n-pt", "n-ar", "n-cl"])

test("tutorial: sale al arrancar una Copa nueva", () => {
  assert.equal(shouldShowCupTutorial(false, cup(), null), true)
})

test("tutorial: una sola vez por Copa (reiniciar el mismo cruce no lo repite)", () => {
  const c = cup()
  assert.equal(shouldShowCupTutorial(false, c, c.id), false)
})

test("tutorial: otra Copa nueva lo vuelve a mostrar (mientras no se apague)", () => {
  const a = cup()
  const b = cup()
  b.id = a.id + "-otra"
  assert.equal(shouldShowCupTutorial(false, b, a.id), true)
})

test('tutorial: "No volver a mostrar" lo apaga siempre', () => {
  assert.equal(shouldShowCupTutorial(true, cup(), null), false)
})

test("tutorial: no sale a mitad de Copa (ya se jugó un cruce, p. ej. al retomar una Copa guardada)", () => {
  const { cup: after } = recordResult(cup(), 0, [3, 1])
  assert.equal(shouldShowCupTutorial(false, after, null), false)
})

test("tutorial: la opción de no volver a mostrar se guarda y se recupera", () => {
  const s = mem()
  const saved = load(s)
  assert.equal(saved.settings.tutorialOptOut, false)
  saved.settings.tutorialOptOut = true
  save(saved, s)
  assert.equal(load(s).settings.tutorialOptOut, true)
})

test("tutorial: por defecto NO está apagado (un usuario nuevo lo ve)", () => {
  assert.equal(DEFAULT_SETTINGS.tutorialOptOut, false)
})

test("tutorial: migración — quien ya había visto el tutorial (versión anterior) no lo vuelve a ver", () => {
  const s = mem()
  s.setItem(STORAGE_KEY, JSON.stringify({ v: 1, customTeams: [], settings: { seenTutorial: true }, cup: null }))
  assert.equal(load(s).settings.tutorialOptOut, true)
  const s2 = mem()
  s2.setItem(STORAGE_KEY, JSON.stringify({ v: 1, customTeams: [], settings: { seenTutorial: false }, cup: null }))
  assert.equal(load(s2).settings.tutorialOptOut, false)
})

test("tutorial: valores raros en el guardado no rompen (se ignoran)", () => {
  const s = mem()
  s.setItem(STORAGE_KEY, JSON.stringify({ v: 1, customTeams: [], settings: { tutorialOptOut: "sí" }, cup: null }))
  assert.equal(load(s).settings.tutorialOptOut, false)
})
