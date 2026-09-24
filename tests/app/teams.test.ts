import test from "node:test"
import assert from "node:assert/strict"
import { CATEGORIES, CRESTS, DEFAULT_CATEGORY, DEFAULT_CREST, DEFAULT_TEAMS, HEX, NATIONAL_TEAMS, colorDistance, defaultRoster, distinctColors, isCategory, isCrest, makeTeam, sanitizeTeam, MIN_COLOR_DISTANCE } from "../../lib/app/teams"
import type { Team, TeamDraft } from "../../lib/app/teams"
import { DEFAULT_SETTINGS, STORAGE_KEY, allTeams, load, save } from "../../lib/app/storage"
import type { Saved } from "../../lib/app/storage"

class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}
const mem = () => new MemStorage() as unknown as Storage

const draft = (over: Partial<TeamDraft> = {}): TeamDraft => ({ name: "Lobos", color: "#10b981", crest: "🐺", surface: "madera", category: "mixto", roster: defaultRoster(), ...over })

test("makeTeam: nombre en mayúsculas, recortado, con 6 jugadores", () => {
  const r = makeTeam(draft({ name: "  lobos del norte grande " }), DEFAULT_TEAMS)
  assert.ok("team" in r)
  if ("team" in r) {
    assert.equal(r.team.name, "LOBOS DEL NO")
    assert.equal(r.team.roster.length, 6)
    assert.match(r.team.id, /^c-/)
  }
})

test("makeTeam: rechaza vacío, color inválido y nombre repetido (sin importar mayúsculas)", () => {
  assert.ok("error" in makeTeam(draft({ name: "   " }), []))
  assert.ok("error" in makeTeam(draft({ color: "rojo" }), []))
  assert.ok("error" in makeTeam(draft({ name: "españa" }), DEFAULT_TEAMS))
})

test("makeTeam: editar el mismo equipo con su mismo nombre es válido", () => {
  const a = makeTeam(draft(), DEFAULT_TEAMS)
  assert.ok("team" in a)
  if (!("team" in a)) return
  const b = makeTeam(draft({ color: "#123456" }), [...DEFAULT_TEAMS, a.team], a.team.id)
  assert.ok("team" in b)
  if ("team" in b) { assert.equal(b.team.id, a.team.id); assert.equal(b.team.color, "#123456") }
})

test("BUG del original: el roster del formulario y el del equipo guardado NO comparten objetos", () => {
  const d = draft()
  const r = makeTeam(d, [])
  assert.ok("team" in r)
  if (!("team" in r)) return
  d.roster[0].name = "CAMBIADO"
  d.roster[2].kind = "pesado"
  assert.equal(r.team.roster[0].name, "Capitán")
  assert.equal(r.team.roster[2].kind, "veloz") // el guardado conserva su tipo original
})

test("sanitizeTeam: descarta basura y limpia campos", () => {
  assert.equal(sanitizeTeam(null), null)
  assert.equal(sanitizeTeam({ id: "x", name: "A", color: "red", surface: "madera", roster: [] }), null)
  assert.equal(sanitizeTeam({ id: "x", name: "A", color: "#ffffff", surface: "hielo", roster: [] }), null)
  const t = sanitizeTeam({ id: "x1", name: "<b>lobos</b>", color: "#ABCDEF", surface: "cemento", roster: [{ name: "Ana", kind: "veloz" }, { kind: "raro" }] })
  assert.ok(t)
  assert.equal(t!.name, "BLOBOS/B")
  assert.equal(t!.color, "#abcdef")
  assert.equal(t!.roster.length, 6)
  assert.equal(t!.roster[0].kind, "veloz")
  assert.equal(t!.roster[1].kind, "equilibrado")
})

test("colores: equipos parecidos => la visita cambia a un color de contraste; el local nunca", () => {
  assert.ok(colorDistance("#ef4444", "#ef4444") === 0)
  const [l, v] = distinctColors("#ef4444", "#f05050")
  assert.equal(l, "#ef4444")
  assert.ok(colorDistance(l, v) >= MIN_COLOR_DISTANCE)
  const same = distinctColors("#ea580c", "#0ea5e9")
  assert.deepEqual(same, ["#ea580c", "#0ea5e9"])
  // cualquier pareja de equipos de fábrica (hay varias selecciones con colores parecidos) queda
  // distinguible en la cancha
  for (const a of DEFAULT_TEAMS) for (const b of DEFAULT_TEAMS) {
    if (a === b) continue
    const [x, y] = distinctColors(a.color, b.color)
    assert.equal(x, a.color)
    assert.ok(colorDistance(x, y) >= MIN_COLOR_DISTANCE, `${a.name}/${b.name}`)
  }
})

test("storage: ida y vuelta conserva equipos y ajustes", () => {
  const s = mem()
  const t = makeTeam(draft({ name: "Lobos" }), DEFAULT_TEAMS)
  assert.ok("team" in t)
  if (!("team" in t)) return
  const saved: Saved = { customTeams: [t.team], settings: { ...DEFAULT_SETTINGS, nivel: "dificil", duration: 180, localId: t.team.id, visitId: "t3", leftHanded: true, sound: false }, cup: null }
  assert.ok(save(saved, s))
  const back = load(s)
  assert.equal(back.customTeams.length, 1)
  assert.equal(back.customTeams[0].name, "LOBOS")
  assert.equal(back.settings.nivel, "dificil")
  assert.equal(back.settings.localId, t.team.id)
  assert.equal(back.settings.leftHanded, true)
  assert.equal(back.settings.sound, false)
})

test("storage: JSON roto, tipos raros o storage nulo => valores por defecto, sin lanzar", () => {
  const s = mem()
  s.setItem(STORAGE_KEY, "{no es json")
  assert.deepEqual(load(s).settings, DEFAULT_SETTINGS)
  s.setItem(STORAGE_KEY, JSON.stringify({ customTeams: "x", settings: { nivel: 7, duration: 99999, localId: 5 } }))
  const l = load(s)
  assert.equal(l.customTeams.length, 0)
  assert.equal(l.settings.nivel, "normal")
  assert.equal(l.settings.duration, 120)
  assert.deepEqual(load(null).settings, DEFAULT_SETTINGS)
  assert.equal(save({ customTeams: [], settings: DEFAULT_SETTINGS, cup: null }, null), false)
})

test("storage: ids repetidos, nombres que chocan con los de fábrica y tope de equipos", () => {
  const s = mem()
  const mk = (i: number, name = `EQ${i}`) => ({ id: `c-${i}`, name, color: "#123456", surface: "madera", roster: defaultRoster() })
  const many = Array.from({ length: 30 }, (_, i) => mk(i))
  s.setItem(STORAGE_KEY, JSON.stringify({ customTeams: [mk(1, "ESPAÑA"), mk(2), mk(2, "OTRO"), ...many] }))
  const l = load(s)
  assert.ok(l.customTeams.every((t) => t.name !== "ESPAÑA"))
  assert.equal(new Set(l.customTeams.map((t) => t.id)).size, l.customTeams.length)
  assert.ok(l.customTeams.length <= 12)
})

test("storage: selección coherente aunque el equipo guardado ya no exista o local == visita", () => {
  const s = mem()
  s.setItem(STORAGE_KEY, JSON.stringify({ settings: { localId: "fantasma", visitId: "fantasma" } }))
  const l = load(s)
  const ids = allTeams(l).map((t: Team) => t.id)
  assert.ok(ids.includes(l.settings.localId))
  assert.ok(ids.includes(l.settings.visitId))
  assert.notEqual(l.settings.localId, l.settings.visitId)
})

test("crest: los 4 equipos de fábrica tienen un escudo válido del set CRESTS", () => {
  for (const t of DEFAULT_TEAMS) assert.ok(isCrest(t.crest), `${t.name} sin escudo válido: ${t.crest}`)
})

test("sanitizeTeam: equipo guardado SIN crest (formato viejo) migra al escudo por defecto", () => {
  const old = { id: "x2", name: "Viejo", color: "#112233", surface: "madera", roster: [] }
  const t = sanitizeTeam(old)
  assert.ok(t)
  assert.equal(t!.crest, DEFAULT_CREST)
})

test("sanitizeTeam: un crest que no está en el set cae al escudo por defecto", () => {
  const t = sanitizeTeam({ id: "x3", name: "Raro", color: "#112233", crest: "🚀", surface: "madera", roster: [] })
  assert.ok(t)
  assert.equal(t!.crest, DEFAULT_CREST)
})

test("sanitizeTeam: un crest válido del set se conserva", () => {
  const pick = CRESTS[5]
  const t = sanitizeTeam({ id: "x4", name: "Bueno", color: "#112233", crest: pick, surface: "madera", roster: [] })
  assert.ok(t)
  assert.equal(t!.crest, pick)
})

test("makeTeam: crest inválido en el draft cae al escudo por defecto, uno válido se respeta", () => {
  const bad = makeTeam(draft({ crest: "no-existe" }), [])
  assert.ok("team" in bad)
  if ("team" in bad) assert.equal(bad.team.crest, DEFAULT_CREST)

  const pick = CRESTS[3]
  const good = makeTeam(draft({ crest: pick }), [])
  assert.ok("team" in good)
  if ("team" in good) assert.equal(good.team.crest, pick)
})

test("categoría: los 4 equipos de fábrica tienen una categoría válida", () => {
  for (const t of DEFAULT_TEAMS) assert.ok(isCategory(t.category), `${t.name} sin categoría válida: ${t.category}`)
})

test("sanitizeTeam: equipo guardado SIN category (formato viejo) migra a la categoría por defecto", () => {
  const old = { id: "x5", name: "Viejo", color: "#112233", crest: CRESTS[0], surface: "madera", roster: [] }
  const t = sanitizeTeam(old)
  assert.ok(t)
  assert.equal(t!.category, DEFAULT_CATEGORY)
})

test("sanitizeTeam: category inválida cae a la de por defecto, una válida se conserva", () => {
  const bad = sanitizeTeam({ id: "x6", name: "Raro", color: "#112233", crest: CRESTS[0], surface: "madera", category: "otra-cosa", roster: [] })
  assert.ok(bad)
  assert.equal(bad!.category, DEFAULT_CATEGORY)

  const good = sanitizeTeam({ id: "x7", name: "Bueno", color: "#112233", crest: CRESTS[0], surface: "madera", category: "femenino", roster: [] })
  assert.ok(good)
  assert.equal(good!.category, "femenino")
})

test("makeTeam: category inválida en el draft cae a la de por defecto, una válida se respeta", () => {
  const bad = makeTeam(draft({ category: "otra-cosa" as any }), [])
  assert.ok("team" in bad)
  if ("team" in bad) assert.equal(bad.team.category, DEFAULT_CATEGORY)

  const good = makeTeam(draft({ category: "masculino" }), [])
  assert.ok("team" in good)
  if ("team" in good) assert.equal(good.team.category, "masculino")
})

test("crest: el set incluye banderas para armar selecciones nacionales", () => {
  assert.ok(CRESTS.includes("🇪🇸"))
  assert.ok(CRESTS.includes("🇵🇹"))
  assert.ok(CRESTS.includes("🇦🇷"))
  assert.ok(CRESTS.includes("🇨🇱"))
})

test("categoría: las 3 opciones son mixto/masculino/femenino, sin repetidos", () => {
  assert.deepEqual(new Set(CATEGORIES).size, CATEGORIES.length)
  assert.deepEqual([...CATEGORIES].sort(), ["femenino", "masculino", "mixto"])
})

test("selecciones nacionales: pack completo, ids únicos, escudos de bandera válidos, sin chocar con los de club", () => {
  assert.equal(NATIONAL_TEAMS.length, 12)
  const ids = new Set(DEFAULT_TEAMS.map((t) => t.id))
  assert.equal(ids.size, DEFAULT_TEAMS.length, "ningún id de selección debería repetir uno de club (o entre sí)")
  for (const t of NATIONAL_TEAMS) {
    assert.ok(t.builtin, `${t.name} debería ser builtin como los de club`)
    assert.ok(isCrest(t.crest), `${t.name}: escudo inválido (${t.crest})`)
    assert.ok(HEX.test(t.color), `${t.name}: color inválido (${t.color})`)
    assert.equal(t.roster.length, 6)
  }
})
