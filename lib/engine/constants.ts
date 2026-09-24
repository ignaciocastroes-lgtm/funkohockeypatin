/**
 * Motor Funko-Patín — constantes de juego.
 * TODO está en METROS, SEGUNDOS y radianes. Nada depende de píxeles ni de frames.
 * Estos valores son el "panel de ajuste" del feeling: se tocan aquí y en ningún otro lado.
 */
import type { Surface, SkaterKind } from "./types"

/** Paso fijo de simulación. Independiente de los Hz de la pantalla. */
export const FIXED_DT = 1 / 120
/** Máximo de tiempo real que se simula por frame (evita espiral de la muerte si la pestaña se congela). */
export const MAX_FRAME_TIME = 0.25

/** Pista reglamentaria de hockey patines: 40 x 20 m, esquinas redondeadas. */
export const RINK = { length: 40, width: 20, cornerRadius: 3 } as const

/**
 * Portería. La reglamentaria mide 1.70 m de boca; aquí usamos 2.4 m como compromiso
 * arcade (los jugadores miden ~0.9 m de diámetro). Cambiar aquí para ajustar dificultad.
 */
export const GOAL = {
  /** Distancia de la línea de gol a la valla del fondo. */
  lineInset: 3,
  mouth: 2.4,
  depth: 1.0,
  postRadius: 0.06,
  wallThickness: 0.03,
} as const

export const PUCK = {
  radius: 0.11,
  maxSpeed: 38,
  /** Restitución contra vallas / postes / portero. */
  boardRestitution: 0.72,
  postRestitution: 0.6,
  goalieRestitution: 0.5,
  /** Restitución contra jugadores (rebote, no atrapada). Baja a propósito: una bocha de ~160 g no
   *  sale disparada porque alguien la roce sin querer — el tiro deliberado no usa esto, va directo
   *  por velocidad en `kick()`. */
  skaterRestitution: 0.3,
  /** Cuánto se avanza como máximo por sub-paso (m). Garantiza que no atraviese postes ni líneas. */
  maxSubstep: 0.07,
} as const

/**
 * Trayectoria semi-curva: un tiro tomado moviéndose de costado le pone un poco de efecto, como un
 * latigazo real. Es una curvatura de la DIRECCIÓN (rad/s), no una fuerza lateral — más simple y
 * siempre estable, y decae con el vuelo así no da una vuelta imposible en un tiro largo.
 */
export const CURVE = {
  /** Velocidad de patada a partir de la cual un tiro puede llevar efecto (los pases no curvan). */
  minShotSpeed: 15,
  /** Cuánto efecto (rad/s) le da cada m/s de velocidad lateral del patinador al tirar. */
  spinPerLateralSpeed: 0.09,
  /** Tope de curvatura (rad/s): ni el latigazo más de costado da una vuelta cerrada. */
  maxSpin: 1.1,
  /** El efecto se apaga con el vuelo (1/s): un tiro largo empieza a enderezarse. */
  spinDecay: 0.9,
} as const

export interface SurfaceParams {
  /** Frenado lineal del puck (m/s²). */
  puckDecel: number
  /** Arrastre proporcional del puck (1/s). */
  puckDrag: number
  /** Deslizamiento del patinador sin input (m/s²). Menor = se desliza más. */
  skaterGlide: number
  /** Multiplicador de aceleración de patinadores. */
  accelMul: number
}

export const SURFACES: Record<Surface, SurfaceParams> = {
  madera: { puckDecel: 1.6, puckDrag: 0.12, skaterGlide: 3.5, accelMul: 1.0 },
  cemento: { puckDecel: 2.6, puckDrag: 0.18, skaterGlide: 5.5, accelMul: 1.0 },
  sintetico: { puckDecel: 1.0, puckDrag: 0.08, skaterGlide: 2.2, accelMul: 0.95 },
}

export interface SkaterKindParams {
  radius: number
  mass: number
  /** Velocidad máxima (m/s). */
  maxSpeed: number
  /** Aceleración (m/s²). */
  accel: number
}

export const SKATER_KINDS: Record<SkaterKind, SkaterKindParams> = {
  equilibrado: { radius: 0.45, mass: 1.0, maxSpeed: 7.0, accel: 14 },
  pesado: { radius: 0.52, mass: 1.6, maxSpeed: 5.8, accel: 10 },
  veloz: { radius: 0.42, mass: 0.8, maxSpeed: 8.4, accel: 17 },
}

export const SKATER = {
  /** El portador va un poco más lento. */
  carrySpeedMul: 0.92,
  /** Rapidez de giro del cuerpo hacia donde se mueve (rad/s). */
  headingTurnRate: 14,
  /** Rapidez con la que el palo (y el puck) sigue la orientación (rad/s). */
  stickTurnRate: 12,
  /** Distancia palo-puck medida desde el borde del jugador (m). */
  stickReach: 0.18,
  /** Alcance extra para recoger un puck suelto (m). */
  pickupReach: 0.35,
  /** Alcance extra para robar un puck llevado (m). */
  stealReach: 0.12,
  /** Robar por la espalda no se puede: el rival tiene que venir dentro de este cono desde donde
   *  mira el portador (medio ángulo, rad). ~55° = 110° de cono total, delante del pecho. */
  stealConeHalfAngle: (55 * Math.PI) / 180,
  /** Velocidad relativa máxima a la que se puede controlar un puck (m/s). Más rápido = rebota. */
  trapMaxRelSpeed: 15,
  /** El que patea no puede recoger su propio pase durante este tiempo (s). */
  kickCooldown: 0.35,
  /** A quien le rebota el puck encima no lo puede atrapar de inmediato (s): un golpe fuerte no se
   *  controla al toque solo porque la física ya lo frenó lo suficiente un instante después. */
  deflectCooldown: 0.18,
  /** Tras ganar el puck no te lo pueden robar durante este tiempo (s). */
  controlGrace: 0.6,
  /** Tras perder el puck (robo/golpe) no puedes recuperarlo durante este tiempo (s). */
  lostCooldown: 0.5,
  /** Fracción de la velocidad del patinador que hereda el puck al patear. */
  kickInherit: 0.35,
  kickMaxSpeed: 32,
  /** Velocidad de impacto entre patinadores (m/s) a partir de la cual el portador suelta el puck. */
  hitSpillSpeed: 5.0,
  /** Restitución entre patinadores. */
  collisionRestitution: 0.35,
  /** Restitución contra vallas. */
  boardRestitution: 0.2,
} as const

export const GOALIE = {
  /** Un poco más que los patinadores: el equipo (careta, guantes, pads) abulta el radio real. */
  radius: 0.58,
  maxSpeed: 4.5,
  accel: 26,
  /** Tiempo muerto (s) desde que sale un disparo hasta que el portero empieza a reaccionar. */
  reactionDelay: 0.22,
  /** Constante de tiempo (s) con la que su "puntería" sigue al tiro una vez que lo vio. */
  reaction: 0.1,
  /** Velocidad mínima hacia su portería (m/s) para considerarlo "disparo". */
  shotSpeed: 6,
  /** Recorrido lateral máximo del centro del portero desde el centro de la boca (m). */
  range: 0.75,
  /** Distancia de la línea de gol hacia el interior de la pista donde se para por defecto. */
  standoff: 0.85,
  /** Cuánto más puede salir (además del standoff) a cerrarle el ángulo a un atacante que se acerca (m). */
  advanceMax: 0.55,
  /** Distancia (m) del puck a la línea desde la que el portero empieza a adelantarse. */
  advanceRange: 9,
  /** Velocidad (m/s) con la que el portero avanza/retrocede en su eje de profundidad. */
  advanceSpeed: 3.2,
} as const

/**
 * Reglas. Las faltas son SIMÉTRICAS: valen igual para el humano y la IA.
 * Falta = golpe fuerte (velocidad de impacto >= foulImpact) donde casi todo el cierre lo pone el agresor.
 * Castigo = tarjeta azul: el infractor sale `penaltySeconds` de tiempo de juego (el reloj corre solo en juego).
 */
export const RULES = {
  foulImpact: 6.5,
  aggressorShare: 0.75,
  penaltySeconds: 25,
  /** Máximo de expulsados a la vez por equipo. */
  maxBenched: 2,
  /** Nunca se deja a un equipo con menos patinadores que esto. */
  minSkaters: 2,
  /** Cambios por cansancio permitidos por equipo por partido (no confundir con maxBenched). */
  maxFatigueSubs: 3,
  /** Cada tantas faltas acumuladas de un equipo, el otro cobra un penal (tu regla: cada 3; el
   *  reglamento real de hockey patín usa 10 y después cada 5 — este es tu arcade, no el oficial). */
  foulsPerPenalty: 3,
  /** Distancia del penal a la línea de gol (m) — la misma que usa el reglamento real. */
  penaltySpot: 7.4,
} as const

export const MATCH = {
  teamSize: 4,
  /** Plantilla total (en pista + suplentes por cansancio). */
  rosterSize: 6,
  /** Duración por defecto de un partido (s). */
  duration: 300,
  goalPause: 2.2,
  /** Cuando el reloj llega a 0 con el puck suelto o volando, se concede este tiempo de gracia
   *  antes de pitar el final, para que una jugada ya en marcha (un tiro, un rebote) pueda terminar. */
  timeOnGrace: 1.5,
} as const

/**
 * Energía. "Patinar a velocidad constante no cansa; acelerar sí": solo se gasta mientras el
 * patinador todavía está ganando velocidad (empujando hacia su máximo), no mientras la mantiene.
 */
export const STAMINA = {
  max: 100,
  /** Gasto (unidades/s) mientras acelera de verdad (input fuerte y por debajo de su tope). */
  drainPerSecond: 5,
  /** Recuperación lenta en pista mientras no está acelerando (desliza/coast). */
  iceRegenPerSecond: 3,
  /** Recuperación en la banca de cansancio: rápida, a propósito. */
  restRegenPerSecond: 34,
  /** Velocidad de patada (m/s) a partir de la cual un tiro cuenta como "super tiro". */
  superShotMinSpeed: 24,
  /** Si no hay energía para el super tiro, se limita a esta potencia (tiro fuerte normal, no super). */
  superShotCappedSpeed: 20,
  /** Bajo este % se ofrece/hace el cambio por cansancio si hay suplente fresco y cambios disponibles. */
  subThresholdPct: 25,
} as const

/** Costo en unidades (no fracción) del super tiro, derivado de STAMINA.max. */
export const SUPER_SHOT_COST = STAMINA.max / 2

export const CAMERA = {
  /** Ancho visible base (m). */
  baseWidth: 22,
  maxWidth: 34,
  /** Margen de encuadre alrededor del puck y del jugador controlado (m). */
  fitMargin: 3.5,
  /** Cuánto se adelanta la cámara en la dirección de la jugada (s de velocidad). */
  lookAhead: 0.3,
  /** Suavizado de posición y zoom (1/s). */
  posRate: 6,
  zoomRate: 2.5,
  /** Cuánto puede salirse la vista de la pista (m). */
  edgeMargin: 1.5,
} as const
