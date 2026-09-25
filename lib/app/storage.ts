import type { Nivel } from "../game/match"
import type { MusicLevel } from "../game/crowd"
import { DEFAULT_TEAMS, MAX_CUSTOM_TEAMS, sanitizeTeam } from "./teams"
import type { Team } from "./teams"
import { sanitizeCup } from "./cup"
import type { Cup } from "./cup"

export const STORAGE_KEY = "funko-patin:v1"
export const DURATIONS = [60, 120, 180, 300] as const

export interface Settings {
  nivel: Nivel
  /** Duración del partido en segundos. */
  duration: number
  localId: string
  visitId: string
  leftHanded: boolean
  sound: boolean
  /** Música de fondo (ambiente de fiesta en las gradas, independiente de los efectos/público):
   *  prendida, atenuada o apagada — no afecta al resto del público ni a los efectos. */
  music: MusicLevel
  /** "No volver a mostrar" el tutorial de controles (que sale al arrancar una Copa). */
  tutorialOptOut: boolean
  /** Modo entrenamiento desbloqueado (ganando la Copa, o con el atajo secreto). */
  trainingUnlocked: boolean
}

export interface Saved {
  customTeams: Team[]
  settings: Settings
  /** Copa en curso (llave de eliminación directa), si hay una. */
  cup: Cup | null
}

export const DEFAULT_SETTINGS: Settings = {
  nivel: "normal",
  duration: 120,
  localId: DEFAULT_TEAMS[0].id,
  visitId: DEFAULT_TEAMS[1].id,
  leftHanded: false,
  sound: true,
  music: "on",
  tutorialOptOut: false,
  trainingUnlocked: false,
}

/** localStorage si existe y funciona (modo privado, cookies bloqueadas, SSR => null). */
export function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    const k = "__fp_probe__"
    window.localStorage.setItem(k, "1")
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    return null
  }
}

export function allTeams(saved: Saved): Team[] {
  return [...DEFAULT_TEAMS, ...saved.customTeams]
}

/** Deja la configuración coherente: ids que existan y local != visita. */
export function normalize(saved: Saved): Saved {
  const teams = allTeams(saved)
  const s = saved.settings
  if (!teams.some((t) => t.id === s.localId)) s.localId = DEFAULT_SETTINGS.localId
  if (!teams.some((t) => t.id === s.visitId) || s.visitId === s.localId) {
    s.visitId = (teams.find((t) => t.id !== s.localId) ?? teams[0]).id
  }
  if (saved.cup && !saved.cup.teamIds.every((id) => teams.some((t) => t.id === id))) saved.cup = null
  return saved
}

/** Lee lo guardado. Nunca lanza: ante cualquier dato roto vuelve a los valores por defecto. */
export function load(storage: Storage | null = safeStorage()): Saved {
  const fresh = (): Saved => ({ customTeams: [], settings: { ...DEFAULT_SETTINGS }, cup: null })
  if (!storage) return fresh()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fresh()
    const data = JSON.parse(raw) as Record<string, unknown>
    if (!data || typeof data !== "object") return fresh()
    const out = fresh()
    const seen = new Set<string>(DEFAULT_TEAMS.map((t) => t.id))
    const names = new Set<string>(DEFAULT_TEAMS.map((t) => t.name))
    if (Array.isArray(data.customTeams)) {
      for (const r of data.customTeams) {
        const t = sanitizeTeam(r)
        if (!t || seen.has(t.id) || names.has(t.name)) continue
        seen.add(t.id)
        names.add(t.name)
        out.customTeams.push(t)
        if (out.customTeams.length >= MAX_CUSTOM_TEAMS) break
      }
    }
    const s = (data.settings ?? {}) as Record<string, unknown>
    if (s.nivel === "facil" || s.nivel === "normal" || s.nivel === "dificil") out.settings.nivel = s.nivel
    if (typeof s.duration === "number" && (DURATIONS as readonly number[]).includes(s.duration)) out.settings.duration = s.duration
    if (typeof s.localId === "string") out.settings.localId = s.localId
    if (typeof s.visitId === "string") out.settings.visitId = s.visitId
    if (typeof s.leftHanded === "boolean") out.settings.leftHanded = s.leftHanded
    if (typeof s.sound === "boolean") out.settings.sound = s.sound
    if (s.music === "on" || s.music === "low" || s.music === "off") out.settings.music = s.music
    else if (typeof s.music === "boolean") out.settings.music = s.music ? "on" : "off" // migración de una versión anterior (era on/off nomás)
    if (typeof s.tutorialOptOut === "boolean") out.settings.tutorialOptOut = s.tutorialOptOut
    // migración: quien ya lo había visto (versión anterior) no lo necesita de nuevo
    else if (s.seenTutorial === true) out.settings.tutorialOptOut = true
    if (typeof s.trainingUnlocked === "boolean") out.settings.trainingUnlocked = s.trainingUnlocked
    out.cup = sanitizeCup(data.cup, seen)
    return normalize(out)
  } catch {
    return fresh()
  }
}

export function save(saved: Saved, storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, customTeams: saved.customTeams, settings: saved.settings, cup: saved.cup }))
    return true
  } catch {
    return false
  }
}
