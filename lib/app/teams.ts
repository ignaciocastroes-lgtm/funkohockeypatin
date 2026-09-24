import type { SkaterKind, Surface } from "../engine"
import { colorDistance, rgb } from "../game/cues"

export interface RosterPlayer { name: string; kind: SkaterKind }

export interface Team {
  /** Identidad estable. Los equipos NUNCA se comparan por nombre. */
  id: string
  name: string
  color: string
  /** Escudo del equipo para el marcador (un emoji, del set CRESTS — incluye banderas). */
  crest: string
  /** Pista de localía: la superficie donde juega cuando es local. */
  surface: Surface
  /** Categoría (solo etiqueta: no afecta el motor ni el balance). */
  category: Category
  /** Siempre 6 jugadores (4 en pista + 2 suplentes por cansancio); el índice 0 es el capitán. */
  roster: RosterPlayer[]
  builtin?: boolean
}

/**
 * Set curado de escudos: iconos de club + banderas de países con tradición de hockey patín, para
 * armar selecciones (España, Portugal, Argentina, Chile...) sin depender de assets externos —
 * son emoji, se dibujan igual que cualquier otro crest.
 */
export const CRESTS = [
  "🦅", "🦈", "🐍", "🐉", "🐺", "🐻", "🦁", "🐆", "🦂", "🐗", "🦌", "🦇", "⚡", "🔥", "❄️", "💀",
  "🇪🇸", "🇵🇹", "🇦🇷", "🇨🇱", "🇮🇹", "🇫🇷", "🇧🇷", "🇩🇪", "🇦🇩", "🇦🇴", "🇲🇽", "🇺🇸",
]
export const DEFAULT_CREST = CRESTS[0]

export function isCrest(v: unknown): v is string {
  return typeof v === "string" && CRESTS.includes(v)
}

export const CATEGORIES = ["mixto", "masculino", "femenino"] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABEL: Record<Category, string> = { mixto: "Mixto", masculino: "Masculino", femenino: "Femenino" }
export const DEFAULT_CATEGORY: Category = "mixto"

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v)
}

export const ROSTER_SIZE = 6
export const MAX_CUSTOM_TEAMS = 12
export const NAME_MAX = 12
export const PLAYER_NAME_MAX = 10

export const KINDS: SkaterKind[] = ["equilibrado", "pesado", "veloz"]
export const SURFACES: Surface[] = ["madera", "sintetico", "cemento"]

export const KIND_LABEL: Record<SkaterKind, string> = { equilibrado: "Normal", pesado: "Pesado", veloz: "Veloz" }
export const SURFACE_LABEL: Record<Surface, string> = { madera: "Madera", sintetico: "Sintético", cemento: "Cemento" }
export const SURFACE_HINT: Record<Surface, string> = {
  madera: "Equilibrada",
  sintetico: "Rápida: todo se desliza más",
  cemento: "Lenta: frena rápido",
}

const DEFAULT_KINDS: SkaterKind[] = ["pesado", "equilibrado", "veloz", "equilibrado", "equilibrado", "veloz"]

const roster = (names: string[], kinds: SkaterKind[] = DEFAULT_KINDS): RosterPlayer[] =>
  names.map((name, i) => ({ name, kind: kinds[i] }))

/**
 * Selecciones nacionales: mismo tratamiento que los equipos de club (builtin, siempre disponibles,
 * no cuentan contra el cupo de equipos propios). Nombres de plantilla ficticios, no de jugadores
 * reales. `distinctColors()` ya separa los colores en cancha si dos selecciones quedan parecidas.
 */
export const NATIONAL_TEAMS: Team[] = [
  { id: "n-es", name: "ESPAÑA", color: "#c8102e", crest: "🇪🇸", surface: "cemento", category: "mixto", builtin: true, roster: roster(["Matador", "Furia", "Toro", "Brava", "Sol", "Fiesta"]) },
  { id: "n-pt", name: "PORTUGAL", color: "#046a38", crest: "🇵🇹", surface: "sintetico", category: "mixto", builtin: true, roster: roster(["Navegante", "Fado", "Océano", "Vela", "Farol", "Bravo"]) },
  { id: "n-ar", name: "ARGENTINA", color: "#6cace4", crest: "🇦🇷", surface: "cemento", category: "mixto", builtin: true, roster: roster(["Gaucho", "Pampa", "Tango", "Che", "Mate", "Fueguito"]) },
  { id: "n-cl", name: "CHILE", color: "#0039a6", crest: "🇨🇱", surface: "madera", category: "mixto", builtin: true, roster: roster(["Cóndor", "Andino", "Volcán", "Austral", "Copihue", "Roble"]) },
  { id: "n-it", name: "ITALIA", color: "#14b8a6", crest: "🇮🇹", surface: "sintetico", category: "mixto", builtin: true, roster: roster(["Azzurro", "Vespa", "Fontana", "Góndola", "Vulcano", "Pasta"]) },
  { id: "n-fr", name: "FRANCIA", color: "#002654", crest: "🇫🇷", surface: "madera", category: "mixto", builtin: true, roster: roster(["Gallo", "Eiffel", "Brisa", "Lavanda", "Bistró", "Marino"]) },
  { id: "n-br", name: "BRASIL", color: "#ffdf00", crest: "🇧🇷", surface: "cemento", category: "mixto", builtin: true, roster: roster(["Samba", "Carioca", "Malandro", "Zagueiro", "Batucada", "Ginga"]) },
  { id: "n-de", name: "ALEMANIA", color: "#f4f4f5", crest: "🇩🇪", surface: "sintetico", category: "mixto", builtin: true, roster: roster(["Panzer", "Águila", "Bosque", "Acero", "Rayo", "Muralla"]) },
  { id: "n-ad", name: "ANDORRA", color: "#e63946", crest: "🇦🇩", surface: "madera", category: "mixto", builtin: true, roster: roster(["Pirineo", "Nieve", "Cumbre", "Refugio", "Alud", "Sendero"]) },
  { id: "n-ao", name: "ANGOLA", color: "#f9a01b", crest: "🇦🇴", surface: "cemento", category: "mixto", builtin: true, roster: roster(["Kalunga", "Baobab", "Tambor", "Savana", "Kianda", "Muxima"]) },
  { id: "n-mx", name: "MÉXICO", color: "#006341", crest: "🇲🇽", surface: "sintetico", category: "mixto", builtin: true, roster: roster(["Azteca", "Charro", "Nopal", "Águila", "Fiesta", "Volcán"]) },
  { id: "n-us", name: "ESTADOS UNIDOS", color: "#0a3161", crest: "🇺🇸", surface: "madera", category: "mixto", builtin: true, roster: roster(["Liberty", "Estrella", "Trueno", "Yankee", "Eagle", "Rocket"]) },
]

export const DEFAULT_TEAMS: Team[] = [...NATIONAL_TEAMS]

export function defaultRoster(): RosterPlayer[] {
  return roster(["Capitán", "Jugador 2", "Jugador 3", "Jugador 4", "Jugador 5", "Jugador 6"])
}

export const HEX = /^#[0-9a-f]{6}$/i

export function isKind(v: unknown): v is SkaterKind {
  return v === "equilibrado" || v === "pesado" || v === "veloz"
}
export function isSurface(v: unknown): v is Surface {
  return v === "madera" || v === "cemento" || v === "sintetico"
}

const clean = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max)

/** Valida un equipo leído de storage (o de cualquier fuente no confiable). Devuelve null si no sirve. */
export function sanitizeTeam(raw: unknown): Team | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as Record<string, unknown>
  const name = clean(t.name, NAME_MAX).toUpperCase()
  const id = clean(t.id, 40)
  if (!id || !name || !HEX.test(String(t.color)) || !isSurface(t.surface) || !Array.isArray(t.roster)) return null
  const players: RosterPlayer[] = []
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const p = (t.roster[i] ?? {}) as Record<string, unknown>
    players.push({ name: clean(p.name, PLAYER_NAME_MAX) || (i === 0 ? "Capitán" : `Jugador ${i + 1}`), kind: isKind(p.kind) ? p.kind : "equilibrado" })
  }
  return { id, name, color: String(t.color).toLowerCase(), crest: isCrest(t.crest) ? t.crest : DEFAULT_CREST, surface: t.surface, category: isCategory(t.category) ? t.category : DEFAULT_CATEGORY, roster: players }
}

export interface TeamDraft { name: string; color: string; crest: string; surface: Surface; category: Category; roster: RosterPlayer[] }

export type MakeResult = { team: Team } | { error: string }

/**
 * Crea (o edita, si `editId`) un equipo a partir del formulario. Copia profunda del roster:
 * el formulario y el equipo guardado nunca comparten objetos.
 */
export function makeTeam(draft: TeamDraft, existing: Team[], editId?: string): MakeResult {
  const name = clean(draft.name, NAME_MAX).toUpperCase()
  if (!name) return { error: "Ponle nombre al equipo." }
  if (!HEX.test(draft.color)) return { error: "Elige un color válido." }
  if (existing.some((t) => t.id !== editId && t.name === name)) return { error: `Ya existe un equipo llamado ${name}.` }
  const crest = isCrest(draft.crest) ? draft.crest : DEFAULT_CREST
  const category = isCategory(draft.category) ? draft.category : DEFAULT_CATEGORY
  const players: RosterPlayer[] = []
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const p = draft.roster[i]
    players.push({
      name: clean(p?.name, PLAYER_NAME_MAX) || (i === 0 ? "Capitán" : `Jugador ${i + 1}`),
      kind: isKind(p?.kind) ? p.kind : "equilibrado",
    })
  }
  const id = editId ?? `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  return { team: { id, name, color: draft.color.toLowerCase(), crest, category, surface: draft.surface, roster: players } }
}

// ---------- colores ----------
// `rgb` y `colorDistance` viven en game/cues.ts (las usa también el dibujo del aura de equipo).
export { colorDistance }

export const MIN_COLOR_DISTANCE = 110

function complement(hex: string): string {
  const [r, g, b] = rgb(hex)
  const c = (v: number) => (255 - v).toString(16).padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

/**
 * Si los dos equipos se parecen demasiado, la visita juega con un color de contraste
 * (el complementario; si aun así se confunde, blanco o negro). El local nunca cambia.
 */
export function distinctColors(local: string, visit: string): [string, string] {
  if (colorDistance(local, visit) >= MIN_COLOR_DISTANCE) return [local, visit]
  for (const cand of [complement(visit), complement(local), "#f8fafc", "#111827"]) {
    if (colorDistance(local, cand) >= MIN_COLOR_DISTANCE * 1.4) return [local, cand]
  }
  return [local, "#f8fafc"]
}
