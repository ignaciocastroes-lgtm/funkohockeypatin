export type Surface = "madera" | "cemento" | "sintetico"
export type SkaterKind = "equilibrado" | "pesado" | "veloz"
export type Side = 0 | 1
export type Phase = "play" | "goal" | "ended"

/** Lado 0 = local (defiende la portería izquierda, ataca hacia +x). Lado 1 = visita. */
export interface Skater {
  id: string
  side: Side
  kind: SkaterKind
  name: string
  isCaptain: boolean
  x: number; y: number; vx: number; vy: number
  /** Posición del paso anterior (para interpolar el render). */
  px: number; py: number
  radius: number
  mass: number
  maxSpeed: number
  accel: number
  /** Hacia dónde mira el cuerpo (rad). */
  heading: number
  /** Dirección del palo respecto al cuerpo (rad). El puck llevado va aquí. */
  stickAngle: number
  /** Intención de movimiento, magnitud <= 1. La pone el jugador o la IA. */
  inputX: number; inputY: number
  /** Mientras > 0 no puede recoger el puck. */
  pickupCooldown: number
  /** Mientras > 0 no le pueden robar el puck. */
  controlGrace: number
}

export interface Goalie {
  side: Side
  x: number; y: number; vx: number; vy: number
  px: number; py: number
  radius: number
  /** Hacia dónde "cree" el portero que va el tiro (con retardo de reacción). */
  aimY: number
  /** Tiempo muerto de reacción restante desde que vio salir un disparo (s). */
  reactTimer: number
  wasIncoming: boolean
}

export interface Puck {
  x: number; y: number; vx: number; vy: number
  px: number; py: number
  radius: number
  carrierId: string | null
  lastTouchId: string | null
  lastTouchSide: Side | null
}

export type GameEvent =
  | { type: "goal"; side: Side }
  | { type: "kick"; id: string; speed: number }
  | { type: "pickup"; id: string }
  | { type: "steal"; id: string; from: string }
  | { type: "spill"; id: string; impact: number }
  | { type: "hit"; a: string; b: string; impact: number }
  | { type: "board"; speed: number }
  | { type: "post"; speed: number }
  | { type: "save"; speed: number }
  | { type: "deflect"; id: string; speed: number }
  | { type: "foul"; id: string; victim: string; side: Side; impact: number }
  | { type: "return"; id: string }
  | { type: "kickoff" }
  | { type: "end" }

export interface WorldConfig {
  teamSize?: number
  surface?: Surface
  duration?: number
  /** false = sin porteros (útil para tests). */
  goalies?: boolean
  /** Tipos por equipo, en orden (el índice 0 es el capitán). */
  kinds?: [SkaterKind[], SkaterKind[]]
  names?: [string[], string[]]
}

export interface BenchEntry {
  skater: Skater
  side: Side
  /** Segundos de juego que le quedan afuera. */
  timer: number
}

export interface World {
  surface: Surface
  time: number
  steps: number
  clock: number
  phase: Phase
  phaseTimer: number
  score: [number, number]
  skaters: Skater[]
  goalies: Goalie[]
  puck: Puck
  events: GameEvent[]
  hasGoalies: boolean
  teamSize: number
  duration: number
  /** Expulsados (tarjeta azul) con su tiempo restante. */
  bench: BenchEntry[]
  /** Faltas cometidas por equipo. */
  fouls: [number, number]
}
