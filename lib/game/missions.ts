/**
 * Misiones de entrenamiento (Ronda 57 del audit): una hoja de práctica de club, no un contador de
 * pases suelto. Cada misión enseña UN oficio concreto y se desbloquea en orden — la siguiente no
 * se muestra hasta que la anterior está lograda. `MissionTracker` mira los mismos eventos del
 * motor que ya usa `match.ts` (kick/pickup/steal/goal/combo) más la posición del puck cuadro a
 * cuadro; no le pide nada nuevo al motor.
 */
import { RINK } from "../engine"
import type { GameEvent, Side, World } from "../engine"

export interface MissionDef {
  id: string
  /** Título corto (lista de misiones). */
  title: string
  /** Qué hacer, en una línea — se muestra como banner fijo mientras se juega la misión. */
  goal: string
  /** Se muestra al lograrla. */
  doneText: string
  /** Escenario de entrenamiento con el que se juega esta misión. */
  scenario: {
    goalie: "local" | "visita" | "ninguno" | "ambos"
    /** Mission 6: partido de verdad, la IA rival juega (en las demás, el rival no se mueve). */
    scrimmage?: boolean
  }
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: "recorrido",
    title: "1 · Recorrido",
    goal: "Llevá la bocha de tu arco al arco rival sin perderla.",
    doneText: "¡Eso es! Cruzaste toda la cancha sin que te la saquen.",
    scenario: { goalie: "ninguno" },
  },
  {
    id: "pase",
    title: "2 · Pase que llega",
    goal: "Esperá a que un compañero se ofrezca cerca y dale un pase — que lo reciba de verdad.",
    doneText: "¡Pase recibido! Así se juega en equipo.",
    scenario: { goalie: "ninguno" },
  },
  {
    id: "pared",
    title: "3 · Pared",
    goal: "Dale un pase a un compañero y recibila de vuelta enseguida (uno-dos).",
    doneText: "¡Pared perfecta! Diste el pase y te desmarcaste para la devolución.",
    scenario: { goalie: "ninguno" },
  },
  {
    id: "combo",
    title: "4 · Ataque de 3 toques",
    goal: "Encadená 3 toques de tu equipo y convertí con el combo ya armado.",
    doneText: "¡Golazo de combo! Tres toques limpios y a guardarla.",
    scenario: { goalie: "visita" },
  },
  {
    id: "definicion",
    title: "5 · Definición",
    goal: "El arquero se tira: elegí bien el rincón y convertí.",
    doneText: "¡Se la metiste al arquero! Elegiste bien el palo.",
    scenario: { goalie: "visita" },
  },
  {
    id: "presion",
    title: "6 · Partido de verdad",
    goal: "Con el rival presionando: abrite espacio y dale un pase ANTES de que te quiten la bocha.",
    doneText: "¡Jugada de verdad! Diste el pase justo antes del quite.",
    scenario: { goalie: "ambos", scrimmage: true },
  },
]

const sideOf = (id: string): Side => (id[0] === "L" ? 0 : 1)

/** Cuántas misiones ya logró: 0..MISSIONS.length. La lista guardada puede traer ids viejos o
 *  desordenados (versión anterior, dato corrupto) — se cuenta un prefijo válido, no cualquier id. */
export function missionsCompletedCount(done: readonly string[]): number {
  let n = 0
  for (const m of MISSIONS) {
    if (!done.includes(m.id)) break
    n++
  }
  return n
}

/** La próxima misión a jugar (o null si ya las hizo todas). */
export function nextMission(done: readonly string[]): MissionDef | null {
  const n = missionsCompletedCount(done)
  return MISSIONS[n] ?? null
}

/**
 * Sigue el progreso de UNA misión durante un entrenamiento. Se alimenta de:
 *  - `onKickoff()` en cada saque (arranca limpio: un intento por vez, sin arrastrar medio pase
 *    del intento anterior);
 *  - `onEvent(ev, world, controlledId)` por cada evento que emite el motor;
 *  - `tick(world, dt)` una vez por paso fijo (para la misión 1, que mide recorrido, no un evento).
 * `done` se pone en `true` una sola vez — no hace falta "apagarla" de nuevo.
 */
export class MissionTracker {
  readonly def: MissionDef
  done = false

  // misión 1: recorrido continuo del mismo portador
  private runCarrier: string | null = null
  private runMinX = 0
  private runMaxX = 0

  // misión 2 y 6: último que pateó (para reconocer un pase completado)
  private lastKick: { id: string } | null = null

  // misión 3: máquina de estados del uno-dos (pared)
  private wallStage: 0 | 1 | 2 | 3 = 0
  private wallPartner: string | null = null
  private wallTimer = 0

  // misión 6: pase que salió bajo marca real (rival a menos de `PRESSURE_RANGE`)
  private pressureKick: { id: string } | null = null

  constructor(def: MissionDef) {
    this.def = def
  }

  onKickoff() {
    this.runCarrier = null
    this.lastKick = null
    this.wallStage = 0
    this.wallPartner = null
    this.wallTimer = 0
    this.pressureKick = null
  }

  tick(w: World, dt: number) {
    if (this.done) return
    if (this.def.id === "recorrido") this.tickRecorrido(w)
    if (this.wallStage > 0) {
      this.wallTimer += dt
      if (this.wallTimer > 5) { this.wallStage = 0; this.wallPartner = null }
    }
  }

  private tickRecorrido(w: World) {
    const carrierId = w.puck.carrierId
    if (!carrierId || sideOf(carrierId) !== 0) { this.runCarrier = null; return }
    const s = w.skaters.find((q) => q.id === carrierId)
    if (!s) return
    if (this.runCarrier !== carrierId) {
      this.runCarrier = carrierId
      this.runMinX = s.x
      this.runMaxX = s.x
      return
    }
    this.runMinX = Math.min(this.runMinX, s.x)
    this.runMaxX = Math.max(this.runMaxX, s.x)
    if (this.runMaxX - this.runMinX >= RINK.length * 0.55) this.done = true
  }

  onEvent(ev: GameEvent, w: World, controlledId: string | null) {
    if (this.done) return
    if (ev.type === "kickoff") { this.onKickoff(); return }
    switch (this.def.id) {
      case "pase": this.eventPase(ev); break
      case "pared": this.eventPared(ev, controlledId); break
      case "combo": this.eventCombo(ev); break
      case "definicion": this.eventDefinicion(ev, w); break
      case "presion": this.eventPresion(ev, w); break
    }
  }

  private eventPase(ev: GameEvent) {
    if (ev.type === "kick") this.lastKick = { id: ev.id }
    else if (ev.type === "pickup") {
      if (this.lastKick && this.lastKick.id !== ev.id && sideOf(this.lastKick.id) === 0 && sideOf(ev.id) === 0) this.done = true
      this.lastKick = null
    } else if (ev.type === "steal") this.lastKick = null
  }

  private eventPared(ev: GameEvent, controlledId: string | null) {
    switch (this.wallStage) {
      case 0:
        if (ev.type === "kick" && ev.id === controlledId) { this.wallStage = 1; this.wallTimer = 0 }
        break
      case 1:
        if (ev.type === "pickup") {
          if (sideOf(ev.id) === 0 && ev.id !== controlledId) { this.wallStage = 2; this.wallPartner = ev.id; this.wallTimer = 0 }
          else this.wallStage = 0
        } else if (ev.type === "steal") this.wallStage = 0
        break
      case 2:
        if (ev.type === "kick" && ev.id === this.wallPartner) { this.wallStage = 3; this.wallTimer = 0 }
        else if (ev.type === "steal" || ev.type === "pickup") this.wallStage = 0
        break
      case 3:
        if (ev.type === "pickup") {
          if (ev.id === controlledId) this.done = true
          this.wallStage = 0
        } else if (ev.type === "steal") this.wallStage = 0
        break
    }
  }

  private eventCombo(ev: GameEvent) {
    if (ev.type === "goal" && ev.side === 0 && ev.combo) this.done = true
  }

  private eventDefinicion(ev: GameEvent, w: World) {
    if (ev.type === "goal" && ev.side === 0 && w.hasGoalies) this.done = true
  }

  private static readonly PRESSURE_RANGE = 3.2

  private eventPresion(ev: GameEvent, w: World) {
    if (ev.type === "kick" && sideOf(ev.id) === 0) {
      const kicker = w.skaters.find((s) => s.id === ev.id)
      let nearest = Infinity
      if (kicker) for (const o of w.skaters) if (o.side === 1) nearest = Math.min(nearest, Math.hypot(o.x - kicker.x, o.y - kicker.y))
      this.pressureKick = nearest < MissionTracker.PRESSURE_RANGE ? { id: ev.id } : null
    } else if (ev.type === "pickup") {
      if (this.pressureKick && this.pressureKick.id !== ev.id && sideOf(ev.id) === 0) this.done = true
      this.pressureKick = null
    } else if (ev.type === "steal") this.pressureKick = null
  }
}
