import type { Side } from "../engine"

/**
 * Lógica pura de la tanda de penales (sin nada de audio/DOM/motor, para poder testearla directo).
 * 3 intentos por lado, alternados (0,1,0,1...); si siguen empatados después de los 3, se sigue una
 * ronda más a la vez hasta que se decida. No es el reglamento real de bandera (que tiene reglas de
 * corte anticipado) — para este arcade alcanza con "hasta que alguien saque ventaja con la misma
 * cantidad de tiros".
 */
export interface ShootoutState {
  turn: Side
  attempts: [number, number]
  made: [number, number]
  log: { side: Side; scored: boolean }[]
}

export interface ShootoutResult {
  winner: Side
  made: [number, number]
  attempts: [number, number]
  log: ShootoutState["log"]
}

export function initialShootout(): ShootoutState {
  return { turn: 0, attempts: [0, 0], made: [0, 0], log: [] }
}

/** Aplica el resultado (convirtió o no) del intento que le tocaba a `state.turn`. Si la tanda queda
 *  decidida, `result` no es null (y `state.turn` ya no importa, terminó). */
export function applyShootoutAttempt(state: ShootoutState, scored: boolean): { state: ShootoutState; result: ShootoutResult | null } {
  const turn = state.turn
  const attempts: [number, number] = [...state.attempts]
  const made: [number, number] = [...state.made]
  attempts[turn]++
  if (scored) made[turn]++
  const log = [...state.log, { side: turn, scored }]
  const decided = attempts[0] === attempts[1] && attempts[0] >= 3 && made[0] !== made[1]
  if (decided) {
    const winner: Side = made[0] > made[1] ? 0 : 1
    return { state: { turn, attempts, made, log }, result: { winner, made, attempts, log } }
  }
  const nextTurn: Side = turn === 0 ? 1 : 0
  return { state: { turn: nextTurn, attempts, made, log }, result: null }
}
