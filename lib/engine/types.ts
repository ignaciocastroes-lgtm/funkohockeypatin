export type Surface = "madera" | "cemento" | "sintetico"
export type SkaterKind = "equilibrado" | "pesado" | "veloz"
export type PuckKind = "liviana" | "normal" | "pesada"
export type Side = 0 | 1
export type Phase = "play" | "timeOn" | "goal" | "ended"

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
  /** Energía 0-100. Patinar a velocidad constante no la gasta; acelerar sí. */
  stamina: number
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
  /** Ángulo de vuelo del puck la última vez que estaba "entrando" — para notar un desvío (poste,
   *  patinador) de golpe y volver a girar hacia la nueva trayectoria, en vez de seguir apuntando
   *  adonde iba ANTES del desvío. null si no hay un tiro en curso. */
  lastShotAngle: number | null
}

export interface Puck {
  x: number; y: number; vx: number; vy: number
  px: number; py: number
  radius: number
  carrierId: string | null
  lastTouchId: string | null
  lastTouchSide: Side | null
  /** Este vuelo puntual del puck viene de un golazo de combo: no lo frena el arquero. */
  comboShot: boolean
  /** Efecto (rad/s de curvatura sobre la velocidad). 0 = recto. Se lo da el tiro, decae con el vuelo. */
  spin: number
}

export type GameEvent =
  | { type: "goal"; side: Side; combo?: boolean }
  | { type: "kick"; id: string; speed: number; superShot?: boolean }
  | { type: "pickup"; id: string }
  | { type: "steal"; id: string; from: string }
  | { type: "spill"; id: string; impact: number }
  | { type: "hit"; a: string; b: string; impact: number }
  | { type: "board"; speed: number }
  | { type: "post"; speed: number }
  | { type: "save"; speed: number; combo?: boolean }
  | { type: "deflect"; id: string; speed: number }
  | { type: "foul"; id: string; victim: string; side: Side; impact: number }
  | { type: "return"; id: string }
  | { type: "kickoff" }
  | { type: "end" }
  | { type: "combo"; side: Side; touches: number; kind: "attack" | "defense" }
  | { type: "sub"; side: Side; outId: string; inId: string }
  | { type: "penalty"; side: Side; shooterId: string }

export interface WorldConfig {
  teamSize?: number
  /** Plantilla total incluidos los suplentes por cansancio (por defecto MATCH.rosterSize). */
  rosterSize?: number
  surface?: Surface
  duration?: number
  /** false = sin porteros (útil para tests). [local, visita] = por lado (modo entrenamiento). */
  goalies?: boolean | [boolean, boolean]
  /** Tipos por equipo, en orden (el índice 0 es el capitán). */
  kinds?: [SkaterKind[], SkaterKind[]]
  names?: [string[], string[]]
  /** Peso de la bocha: cambia velocidad máxima, frenado y rebote (por defecto "normal"). Más
   *  pesada = más lenta y previsible (para aprender); más liviana = más rápida y rebota más
   *  (exige más precisión). Ver `PUCK_KINDS`. */
  puckKind?: PuckKind
}

export interface BenchEntry {
  skater: Skater
  side: Side
  /** Segundos de juego que le quedan afuera. */
  timer: number
}

/** Suplente en descanso (cambio por cansancio). Nada que ver con `BenchEntry` (esa es la tarjeta azul). */
export interface SubEntry {
  skater: Skater
  side: Side
}

/** Cadena de toques armada: al llegar a `touches >= 3` el próximo toque decisivo queda potenciado. */
export interface ComboState {
  side: Side
  touches: number
}

export interface World {
  surface: Surface
  puckKind: PuckKind
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
  /** Suplentes frescos esperando entrar por cansancio (no confundir con `bench`, que es la tarjeta azul). */
  restBench: SubEntry[]
  /** Cambios por cansancio ya usados por equipo (tope: RULES.maxFatigueSubs). */
  subsUsed: [number, number]
  /** Cadena de pases en ataque armada; al llegar a 3 el próximo tiro es "golazo" (le gana al arquero). */
  attackCombo: ComboState | null
  /** Cadena de despejes en defensa armada; al llegar a 3 la próxima atajada es garantizada. */
  defCombo: ComboState | null
  /** Muerte súbita (desempate de Copa): el próximo gol termina el partido en el acto (gol de oro). */
  suddenDeath: boolean
  /** Al que le hicieron el gol saca con la pelota (no un saque neutral): quién, hasta el próximo
   *  saque, que la consume y vuelve a null. */
  nextKickoffSide: Side | null
  /** Penal en curso: mientras dure, el arquero se queda parado en la línea (no puede adelantarse a
   *  cerrar el ángulo, como en un penal de verdad) — se apaga solo en el próximo saque normal. */
  penaltyActive: boolean
}
