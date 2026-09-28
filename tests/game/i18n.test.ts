import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PT, RULES, detectLang, isLang, localizeDom, setLang, getLang, tr } from "../../lib/game/i18n"

const src = ["lib/app/app.ts", "lib/game/match.ts", "lib/game/draw.ts", "lib/game/demo-tutor.ts", "lib/app/teams.ts"]
  .map((f) => readFileSync(f, "utf8")).join("\n")

test("idiomas: en español todo queda igual (el texto original ES la clave)", () => {
  for (const k of Object.keys(PT)) assert.equal(tr(k, "es"), k)
  assert.equal(tr("algo que no está", "pt"), "algo que no está", "lo que falta se ve en español, nunca roto")
})

test("idiomas: portugués — diccionario y reglas con variables", () => {
  assert.equal(tr("Jugar partido", "pt"), "Jogar partida")
  assert.equal(tr("  Volver ", "pt"), "  Voltar ", "conserva los espacios de los bordes")
  assert.equal(tr("QUITAR\nFUERTE", "pt"), "DESARMAR\nFORTE")
  assert.equal(tr("Pista sintético", "pt"), "Piso sintético")
  assert.equal(tr("ESPAÑA vs PORTUGAL · 2:00 · Difícil", "pt"), "ESPAÑA vs PORTUGAL · 2:00 · Difícil")
  assert.equal(tr("¡PENAL para CHILE!", "pt"), "PENÁLTI para CHILE!")
  assert.equal(tr("Vista: cancha completa — tocá para cambiar", "pt"), "Vista: pista completa — toca para mudar")
  assert.equal(tr("Se juega en la pista del local: madera (equilibrada).", "pt"), "Joga-se no piso da casa: madeira (equilibrado).")
  assert.equal(tr("3 toques más...", "pt"), "mais 3 toques...")
  assert.equal(tr("HUACHIPATO se queda con la Copa.", "pt"), "HUACHIPATO fica com a Taça.", "los nombres de equipo no se traducen")
})

test("idiomas: detectLang — cualquier portugués → pt; el resto y lo raro → es", () => {
  for (const l of ["pt", "pt-PT", "pt-BR", "PT-br"]) assert.equal(detectLang(l), "pt")
  for (const l of ["es", "es-CL", "es-PY", "en-US", "", undefined, null, "ptolemy"]) assert.equal(detectLang(l as never), "es")
  assert.ok(isLang("pt") && isLang("es") && !isLang("en") && !isLang(undefined))
})

test("idiomas: ninguna traducción vacía, y los saltos de línea de los botones se conservan", () => {
  for (const [k, v] of Object.entries(PT)) {
    assert.ok(v.trim().length > 0, `traducción vacía: ${k}`)
    assert.equal(k.split("\n").length, v.split("\n").length, `${JSON.stringify(k)} y su traducción deben tener las mismas líneas (botones de 2 líneas)`)
  }
})

test("idiomas: cada clave del diccionario existe en el código (atrapa claves viejas o mal escritas)", () => {
  const missing = Object.keys(PT).filter((k) => !src.includes(k.replace(/\n/g, "\\n")))
  assert.deepEqual(missing, [], `claves que ya no aparecen en el código:\n${missing.join("\n")}`)
})

test("idiomas: las reglas no rompen textos que no les tocan, y ninguna regla explota con basura", () => {
  for (const [re] of RULES) assert.ok(re instanceof RegExp)
  for (const junk of ["", " ", "\n", "((", "🇨🇱", "a".repeat(5000)]) assert.equal(typeof tr(junk, "pt"), "string")
})

test("idiomas: localizeDom traduce texto y aria-label de un árbol y no toca inputs", () => {
  const text = (data: string, parent?: unknown) => ({ nodeType: 3, data, parentNode: parent ?? { tagName: "DIV" } })
  const attrs: Record<string, string> = { "aria-label": "Volver" }
  const input = { nodeType: 1, tagName: "INPUT", getAttribute: () => null, setAttribute() {}, childNodes: { forEach() {} } }
  const inputText = text("Jugar", input)
  const btnText = text("Jugar partido")
  const btn = {
    nodeType: 1, tagName: "BUTTON",
    getAttribute: (a: string) => attrs[a] ?? null,
    setAttribute: (a: string, v: string) => { attrs[a] = v },
    childNodes: { forEach: (f: (n: unknown) => void) => { f(btnText); f(inputText) } },
  }
  setLang("es"); localizeDom(btn as never)
  assert.equal(btnText.data, "Jugar partido", "en español no cambia nada")
  setLang("pt"); localizeDom(btn as never)
  assert.equal(btnText.data, "Jogar partida")
  assert.equal(attrs["aria-label"], "Voltar")
  assert.equal(inputText.data, "Jugar", "el contenido de un input es del usuario: no se traduce")
  setLang("es")
  assert.equal(getLang(), "es")
})
