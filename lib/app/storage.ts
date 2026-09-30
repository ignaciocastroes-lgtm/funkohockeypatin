import { isLang, type Lang } from "../game/i18n"
import type { Nivel } from "../game/match"
import type { MusicLevel } from "../game/crowd"
import type { PuckKind } from "../engine"
import { DEFAULT_TEAMS, MAX_CUSTOM_TEAMS, sanitizeTeam } from "./teams"
import type { Team } from "./teams"
import { sanitizeCup } from "./cup"
import type { Cup } from "./cup"
import { MISSIONS } from "../game/missions"

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
  /** Modo Dios vs Dios desbloqueado: mismo atajo secreto que el entrenamiento, pero al doble de
   *  "precio" (el doble de toques / código el doble de largo) — un partido nivel maestro, IA vs
   *  IA a tope, para mirar rebotes y pases de verdad. */
  godModeUnlocked: boolean
  /** Peso de la bocha en partido normal (por defecto "normal") — ver `PUCK_KINDS` en el motor. */
  puckKind: PuckKind
  /** Modo ahorro: menos densidad de público y sin las banderitas de la tribuna — para que ande
   *  mejor en celulares de gama baja. Vive acá (no en la pausa sola) porque también aplica en
   *  el demo de arranque, antes de que exista ningún partido en pausa. */
  graphicsSaver: boolean
  /** Estadio Aldo Cantoni (San Juan) desbloqueado: se gana ganando la Copa, una sola vez, para
   *  siempre (no se vuelve a bloquear si después se pierde una Copa nueva). De ahí en más, la
   *  final de la Copa se juega ahí, y queda disponible para elegir en entrenamiento y en el demo. */
  cantoniUnlocked: boolean
  /** Idioma elegido a mano. Sin esto (undefined) se usa el del navegador. */
  lang?: Lang
  /** Ids de misiones de entrenamiento logradas, en orden (ver `lib/game/missions.ts`). La próxima
   *  a jugar es la primera de la lista que no esté acá. */
  missionsDone: string[]
}

export interface Saved {
  customTeams: Team[]
  settings: Settings
  /** Copa en curso (llave de eliminación directa), si hay una. */
  cup: Cup | null
}

export const DEFAULT_SETTINGS: Settings = {
  // Fácil por defecto: quien abre el juego por primera vez (o alguien recién empezando, como el
  // caso que motivó todo este rediseño) tiene que entrar a un partido jugable, no a "Normal" —
  // "Normal" es una elección informada, no el piso de entrada.
  nivel: "facil",
  duration: 120,
  localId: DEFAULT_TEAMS[0].id,
  visitId: DEFAULT_TEAMS[1].id,
  leftHanded: false,
  sound: true,
  music: "on",
  tutorialOptOut: false,
  /** Antes esto vivía atrás de un gesto secreto (toques en el logo) o de ganar la Copa. Se
   *  desbloquea desde el arranque a propósito: el camino de misiones (ver `lib/game/missions.ts`)
   *  es justamente la puerta de entrada para quien recién empieza — no tiene sentido escondérsela
   *  detrás de la Copa. El gesto secreto sigue vivo (ver `unlockTraining`/`logoBrand` en app.ts)
   *  como curiosidad, pero ya no hace falta usarlo. */
  trainingUnlocked: true,
  godModeUnlocked: false,
  puckKind: "normal",
  graphicsSaver: false,
  cantoniUnlocked: false,
  missionsDone: [],
}

/** Prueba si `candidate` (localStorage o sessionStorage) existe y de verdad deja escribir —
 *  algunos navegadores lo exponen pero tiran excepción al usarlo (modo privado estricto, cookies
 *  de terceros bloqueadas, un iframe con sandbox sin `allow-same-origin`, etc.). */
function probeStorage(candidate: Storage | undefined | null): Storage | null {
  try {
    if (!candidate) return null
    const k = "__fp_probe__"
    candidate.setItem(k, "1")
    candidate.removeItem(k)
    return candidate
  } catch {
    return null
  }
}

/** localStorage si existe y funciona; si no, sessionStorage como red de contención. localStorage
 *  es lo normal (sobrevive a cerrar la pestaña); pero si algo del entorno lo bloquea (modo privado
 *  estricto, un iframe sandboxeado sin `allow-same-origin` — pasa seguido al probar la app adentro
 *  de un visor/preview embebido — o simplemente cookies/storage de terceros deshabilitado),
 *  sessionStorage al menos sobrevive a un F5 (recargar la página), que es el caso que de verdad
 *  se siente como "se resetea todo": sin ESTO, cada F5 arrancaba de cero por completo, silencioso,
 *  porque `probeStorage(window.localStorage)` fallaba y no había ningún plan B. Avisa por consola
 *  (una sola vez) cuándo pasa esto, para poder diagnosticarlo si vuelve a aparecer. */
let warnedStorageFallback = false
export function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null
  const ls = probeStorage(window.localStorage)
  if (ls) return ls
  const ss = probeStorage(window.sessionStorage)
  if (ss && !warnedStorageFallback) {
    warnedStorageFallback = true
    // eslint-disable-next-line no-console
    console.warn("[funko-patin] localStorage no está disponible acá — usando sessionStorage (sobrevive a F5, no a cerrar la pestaña). Los equipos, la Copa y los desbloqueos no van a quedar guardados de una sesión a otra.")
  }
  return ss
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

/** Lee lo guardado. Nunca lanza: ante cualquier dato roto vuelve a los valores por defecto (avisa
 *  por consola, para poder diagnosticarlo — antes fallaba en silencio). */
export function load(storage: Storage | null = safeStorage()): Saved {
  const fresh = (): Saved => ({ customTeams: [], settings: { ...DEFAULT_SETTINGS, missionsDone: [] }, cup: null })
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
    // Partidas viejas guardaban `controlScheme` ("honda"/"botones"): ese ajuste ya no existe y se ignora.
    if (typeof s.sound === "boolean") out.settings.sound = s.sound
    if (s.music === "on" || s.music === "low" || s.music === "off") out.settings.music = s.music
    else if (typeof s.music === "boolean") out.settings.music = s.music ? "on" : "off" // migración de una versión anterior (era on/off nomás)
    if (typeof s.tutorialOptOut === "boolean") out.settings.tutorialOptOut = s.tutorialOptOut
    // migración: quien ya lo había visto (versión anterior) no lo necesita de nuevo
    else if (s.seenTutorial === true) out.settings.tutorialOptOut = true
    if (typeof s.trainingUnlocked === "boolean") out.settings.trainingUnlocked = s.trainingUnlocked
    if (typeof s.godModeUnlocked === "boolean") out.settings.godModeUnlocked = s.godModeUnlocked
    if (s.puckKind === "liviana" || s.puckKind === "normal" || s.puckKind === "pesada") out.settings.puckKind = s.puckKind
    if (typeof s.graphicsSaver === "boolean") out.settings.graphicsSaver = s.graphicsSaver
    if (typeof s.cantoniUnlocked === "boolean") out.settings.cantoniUnlocked = s.cantoniUnlocked
    if (Array.isArray(s.missionsDone)) {
      const validIds = new Set(MISSIONS.map((m) => m.id))
      const seenM = new Set<string>()
      for (const id of s.missionsDone) {
        if (typeof id === "string" && validIds.has(id) && !seenM.has(id)) { seenM.add(id); out.settings.missionsDone.push(id) }
      }
    }
    if (isLang(s.lang)) out.settings.lang = s.lang
    out.cup = sanitizeCup(data.cup, seen)
    return normalize(out)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[funko-patin] no se pudo leer lo guardado — arrancando de cero.", err)
    return fresh()
  }
}

export function save(saved: Saved, storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, customTeams: saved.customTeams, settings: saved.settings, cup: saved.cup }))
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[funko-patin] no se pudo guardar (¿quota llena?).", err)
    return false
  }
}
