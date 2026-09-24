/**
 * Copa: llave de eliminación directa a 4 equipos (2 semifinales + final).
 * Es puro estado + funciones (sin DOM), fácil de testear y de guardar en storage.
 */

export interface CupMatch {
  home: string | null
  away: string | null
  played: boolean
  score: [number, number] | null
}

export interface Cup {
  id: string
  /** Los 4 equipos, en orden de sorteo: [0]v[1] es la semi 1, [2]v[3] la semi 2. */
  teamIds: [string, string, string, string]
  semis: [CupMatch, CupMatch]
  final: CupMatch
  championId: string | null
}

export function newCup(teamIds: [string, string, string, string]): Cup {
  return {
    id: `cup-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    teamIds: [...teamIds],
    semis: [
      { home: teamIds[0], away: teamIds[1], played: false, score: null },
      { home: teamIds[2], away: teamIds[3], played: false, score: null },
    ],
    final: { home: null, away: null, played: false, score: null },
    championId: null,
  }
}

function winner(m: CupMatch): string | null {
  if (!m.played || !m.score) return null
  if (m.score[0] === m.score[1]) return null
  return m.score[0] > m.score[1] ? m.home : m.away
}

export type MatchSlot = 0 | 1 | "final"

/**
 * Registra el resultado de un partido de la llave y avanza el bracket.
 * Un empate NO se registra (la Copa no admite empates): se devuelve `drawn: true` y el estado
 * queda igual, para que la app ofrezca "jugar de nuevo" ese mismo cruce.
 */
export function recordResult(cup: Cup, which: MatchSlot, score: [number, number]): { cup: Cup; drawn: boolean } {
  if (score[0] === score[1]) return { cup, drawn: true }
  const next: Cup = {
    ...cup,
    semis: [{ ...cup.semis[0] }, { ...cup.semis[1] }],
    final: { ...cup.final },
  }
  if (which === "final") {
    next.final.played = true
    next.final.score = score
    next.championId = winner(next.final)
  } else {
    next.semis[which] = { ...next.semis[which], played: true, score }
    const w0 = winner(next.semis[0])
    const w1 = winner(next.semis[1])
    next.final.home = w0
    next.final.away = w1
  }
  return { cup: next, drawn: false }
}

/** ¿Qué cruce toca jugar ahora? `null` si la copa ya tiene campeón. */
export function nextMatch(cup: Cup): { which: MatchSlot; home: string; away: string } | null {
  if (cup.championId) return null
  if (!cup.semis[0].played) return { which: 0, home: cup.semis[0].home!, away: cup.semis[0].away! }
  if (!cup.semis[1].played) return { which: 1, home: cup.semis[1].home!, away: cup.semis[1].away! }
  if (cup.final.home && cup.final.away && !cup.final.played) return { which: "final", home: cup.final.home, away: cup.final.away }
  return null
}

function sanitizeMatch(raw: unknown, validIds: Set<string>): CupMatch | null {
  if (!raw || typeof raw !== "object") return null
  const m = raw as Record<string, unknown>
  const home = typeof m.home === "string" && validIds.has(m.home) ? m.home : null
  const away = typeof m.away === "string" && validIds.has(m.away) ? m.away : null
  const played = m.played === true
  let score: [number, number] | null = null
  if (Array.isArray(m.score) && m.score.length === 2 && m.score.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) {
    score = [Math.floor(m.score[0]), Math.floor(m.score[1])]
  }
  return { home, away, played: played && score !== null, score: played ? score : null }
}

/** Lee una Copa guardada (o cualquier dato no confiable). `null` si no sirve. */
export function sanitizeCup(raw: unknown, validIds: Set<string>): Cup | null {
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== "string" || !c.id) return null
  if (!Array.isArray(c.teamIds) || c.teamIds.length !== 4) return null
  const teamIds = c.teamIds as unknown[]
  if (!teamIds.every((id) => typeof id === "string" && validIds.has(id))) return null
  const ids = teamIds as [string, string, string, string]
  if (new Set(ids).size !== 4) return null // los 4 deben ser distintos
  if (!Array.isArray(c.semis) || c.semis.length !== 2) return null
  const s0 = sanitizeMatch(c.semis[0], validIds)
  const s1 = sanitizeMatch(c.semis[1], validIds)
  const fin = sanitizeMatch(c.final, validIds)
  if (!s0 || !s1 || !fin) return null
  const championId = typeof c.championId === "string" && validIds.has(c.championId) ? c.championId : null
  return { id: c.id, teamIds: ids, semis: [s0, s1], final: fin, championId }
}
