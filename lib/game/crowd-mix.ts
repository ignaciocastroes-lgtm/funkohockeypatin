/**
 * Cerebro del público (gradas): decide CUÁNTO grita la gente, con qué volumen suena cada capa, hacia
 * dónde se panea y cuándo se empalma cada bucle. Todo es puro (sin AudioContext ni DOM) para poder
 * testearlo; `crowd.ts` solo ejecuta lo que se decide acá.
 *
 * Capas: dos murmullos de fondo (bucles) que siempre suenan, un bucle de "público entusiasmado" que
 * entra cuando sube la tensión, y golpes puntuales: ovaciones de gol y reacciones cortas.
 */
import { GOALS } from "../engine"
import type { GameEvent, Side, World } from "../engine"

export const CROWD = {
  /** Entusiasmo de reposo (0..1) con la pelota lejos de las porterías. */
  base: 0.16,
  /** Segundos que tarda en subir el entusiasmo hasta el objetivo (sube rápido)... */
  riseTime: 1.0,
  /** ...y en bajar (la gente se calma despacio). */
  fallTime: 3.5,
  /** Distancia (m) a una portería dentro de la cual sube la tensión. */
  dangerRange: 12,
  /** Fundido en cruz (s) al empalmar un bucle consigo mismo. */
  loopCrossfade: 1.4,
  /** Techos de volumen por capa (0..1, antes del volumen general del público). */
  bedMax: 0.8,
  energyMax: 0.6,
  roarMax: 0.72,
  reactMax: 0.7,
  /** Volumen general del público respecto de los efectos: es "ambiente", no protagonista. */
  master: 0.55,
} as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Tensión (0..1) que "se siente" en la cancha ahora mismo: pelota cerca de una portería, últimos
 * segundos, muerte súbita, combo armado. Es el OBJETIVO al que se acerca el entusiasmo del público.
 */
export function pressure(w: World): number {
  if (w.phase === "ended") return 0.2
  let dGoal = Infinity
  for (const g of GOALS) dGoal = Math.min(dGoal, Math.hypot(w.puck.x - g.lineX, w.puck.y - g.cy))
  const prox = clamp01(1 - dGoal / CROWD.dangerRange)
  let e = CROWD.base + 0.42 * Math.pow(prox, 1.3)
  if (w.clock <= 10) e += 0.2
  if (w.suddenDeath) e += 0.25
  if (w.attackCombo && w.attackCombo.touches >= 2) e += 0.12
  return clamp01(e)
}

/** Acerca `cur` a `target`: sube rápido y baja lento (exponencial, independiente de la tasa de cuadros). */
export function smoothExcitement(cur: number, target: number, dt: number): number {
  const tau = target > cur ? CROWD.riseTime : CROWD.fallTime
  const k = 1 - Math.exp(-Math.max(0, dt) / tau)
  return clamp01(cur + (target - cur) * k)
}

/** Volumen de cada murmullo de fondo: siempre suena y sube un poco con el entusiasmo. */
export function bedGain(e: number): number {
  return CROWD.bedMax * (0.4 + 0.6 * clamp01(e))
}

/** Volumen del bucle "entusiasmado": mudo en calma, entra pasado ~35 % de entusiasmo. */
export function energyGain(e: number): number {
  const x = clamp01((e - 0.35) / 0.65)
  return CROWD.energyMax * Math.pow(x, 1.4)
}

export interface CrowdReaction {
  /** Golpe de entusiasmo (0..1) que se suma al actual y luego decae solo. */
  bump: number
  /** Ovación de gol: volumen (0..1) y de qué lado de la pista salió el gol (para panear). */
  roar?: { gain: number; goalSide: Side }
  /** Reacción corta ("¡uy!"): volumen 0..1. */
  react?: number
  /** El silbato tapa al público un instante: cuánto baja (0..1) y por cuántos segundos. */
  duck?: { amount: number; seconds: number }
}

/**
 * Qué hace el público ante un evento del juego. `humanSide` es el equipo del jugador (0), o null en el
 * demo (IA vs IA): el gol propio se festeja más fuerte que el del rival.
 */
export function reactionFor(ev: GameEvent, humanSide: Side | null): CrowdReaction | null {
  switch (ev.type) {
    case "goal": {
      const mine = humanSide === null ? 0.85 : ev.side === humanSide ? 1 : 0.6
      // ev.side es quien ANOTÓ; el gol cae en la portería del otro lado
      const goalSide: Side = ev.side === 0 ? 1 : 0
      return { bump: 1, roar: { gain: (ev.combo ? 1 : 0.9) * mine, goalSide } }
    }
    case "post": return { bump: 0.35, react: 0.8 }
    case "save": return { bump: ev.combo ? 0.3 : 0.2, react: ev.combo ? 0.9 : 0.5 }
    case "kick": return ev.superShot ? { bump: 0.25, react: 0.35 } : null
    case "combo": return ev.touches >= 3 ? { bump: 0.2 } : null
    case "foul": return { bump: 0.2, duck: { amount: 0.45, seconds: 0.9 } }
    case "penalty": return { bump: 0.35, duck: { amount: 0.5, seconds: 1.1 } }
    case "kickoff": return { bump: 0.08, duck: { amount: 0.3, seconds: 0.4 } }
    case "end": return { bump: 0.8, roar: { gain: 0.8, goalSide: 0 }, duck: { amount: 0.5, seconds: 1.0 } }
    default: return null
  }
}

/**
 * Paneo estéreo (-1 izquierda .. 1 derecha) de algo que pasa en `worldX`, según dónde apunta la cámara:
 * si el gol es fuera de cuadro a la derecha, el festejo llega desde la derecha. `spread` acota cuánto
 * se abre (un festejo al 100 % de un lado se siente raro).
 */
export function panFor(worldX: number, camCx: number, camWidth: number, spread = 0.6): number {
  const half = Math.max(1e-6, camWidth / 2)
  const p = (worldX - camCx) / half
  return Math.max(-spread, Math.min(spread, p * spread))
}

/** Curva de fundido de potencia constante (seno/coseno) de `n` puntos: 0→1 ("in") o 1→0 ("out"). */
export function equalPowerCurve(n: number, dir: "in" | "out"): Float32Array {
  const c = new Float32Array(Math.max(2, n))
  for (let i = 0; i < c.length; i++) {
    const t = i / (c.length - 1)
    c[i] = dir === "in" ? Math.sin(t * Math.PI / 2) : Math.cos(t * Math.PI / 2)
  }
  return c
}

/**
 * Cuándo arranca la siguiente vuelta de un bucle: se solapa con la anterior `xfade` segundos, así el
 * empalme es un fundido en cruz y no depende de que el códec (MP3) deje o no un silencio en los bordes.
 * El fundido nunca puede ser más largo que la mitad del audio.
 */
export function nextLoopStart(prevStart: number, duration: number, xfade: number): number {
  const x = Math.min(xfade, duration / 2)
  return prevStart + duration - x
}

/** Elige una variante distinta a la última que sonó (si hay más de una). `rnd` es un número en [0,1). */
export function pickVariant(count: number, last: number, rnd: number): number {
  if (count <= 1) return 0
  const i = Math.min(count - 2, Math.floor(rnd * (count - 1)))
  return i >= last ? i + 1 : i
}
