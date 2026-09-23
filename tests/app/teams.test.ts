import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_TEAMS, colorDistance, defaultRoster, distinctColors, makeTeam, sanitizeTeam, MIN_COLOR_DISTANCE } from "../../lib/app/teams"
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

const draft = (over: Partial<TeamDraft> = {}): TeamDraft => ({ name: "Lobos", color: "#10b981", surface: "madera", roster: defaultRoster(), ...over })

test("makeTeam: nombre en mayúsculas, recortado, con 4 jugadores", () => {
  const r = makeTeam(draft({ name: "  lobos del norte grande " }), DEFAULT_TEAMS)
  assert.ok("team" in r)
  if ("team" in r) {
    assert.equal(r.team.name, "LOBOS DEL NO")
    assert.equal(r.team.roster.length, 4)
    assert.match(r.team.id, /^c-/)
  }
})

test("makeTeam: rechaza vacío, color inválido y nombre repetido (sin importar mayúsculas)", () => {
  assert.ok("error" in makeTeam(draft({ name: "   " }), []))
  assert.ok("error" in makeTeam(draft({ color: "rojo" }), []))
  assert.ok("error" in makeTeam(draft({ name: "halcones" }), DEFAULT_TEAMS))
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
  assert.equal(t!.roster.length, 4)
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
  // cualquier pareja de equipos de fábrica (HALCONES y DRAGONES se parecen) queda distinguible en la cancha
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
  s.setItem(STORAGE_KEY, JSON.stringify({ customTeams: [mk(1, "HALCONES"), mk(2), mk(2, "OTRO"), ...many] }))
  const l = load(s)
  assert.ok(l.customTeams.every((t) => t.name !== "HALCONES"))
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
