import type { SkaterKind, Surface } from "../engine"

export interface RosterPlayer { name: string; kind: SkaterKind }

export interface Team {
  /** Identidad estable. Los equipos NUNCA se comparan por nombre. */
  id: string
  name: string
  color: string
  /** Pista de localía: la superficie donde juega cuando es local. */
  surface: Surface
  /** Siempre 4 jugadores; el índice 0 es el capitán. */
  roster: RosterPlayer[]
  builtin?: boolean
}

export const ROSTER_SIZE = 4
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

const roster = (names: string[], kinds: SkaterKind[] = ["pesado", "equilibrado", "veloz", "equilibrado"]): RosterPlayer[] =>
  names.map((name, i) => ({ name, kind: kinds[i] }))

export const DEFAULT_TEAMS: Team[] = [
  { id: "t1", name: "HALCONES", color: "#ea580c", surface: "madera", builtin: true, roster: roster(["Capi", "Rayo", "Turbo", "Nacho"]) },
  { id: "t2", name: "TIBURONES", color: "#0ea5e9", surface: "sintetico", builtin: true, roster: roster(["Diente", "Marea", "Flecha", "Coral"]) },
  { id: "t3", name: "COBRAS", color: "#eab308", surface: "cemento", builtin: true, roster: roster(["Venom", "Sombra", "Rápida", "Colmillo"]) },
  { id: "t4", name: "DRAGONES", color: "#ef4444", surface: "madera", builtin: true, roster: roster(["Fuego", "Escama", "Ala", "Brasa"]) },
]

export function defaultRoster(): RosterPlayer[] {
  return roster(["Capitán", "Jugador 2", "Jugador 3", "Jugador 4"])
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
  return { id, name, color: String(t.color).toLowerCase(), surface: t.surface, roster: players }
}

export interface TeamDraft { name: string; color: string; surface: Surface; roster: RosterPlayer[] }

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
  const players: RosterPlayer[] = []
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const p = draft.roster[i]
    players.push({
      name: clean(p?.name, PLAYER_NAME_MAX) || (i === 0 ? "Capitán" : `Jugador ${i + 1}`),
      kind: isKind(p?.kind) ? p.kind : "equilibrado",
    })
  }
  const id = editId ?? `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  return { team: { id, name, color: draft.color.toLowerCase(), surface: draft.surface, roster: players } }
}

// ---------- colores ----------
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Distancia perceptual aproximada entre dos colores (0..~765). Fórmula "redmean". */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const rm = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

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
