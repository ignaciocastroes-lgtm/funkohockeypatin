/**
 * Protocolo del 2P. TODO lo que llega por red viene de un desconocido: `parseMessage` valida tipo,
 * largo y rango de cada campo y devuelve null ante cualquier duda (nunca lanza, nunca deja pasar basura).
 *
 * Quién simula: el HOST (crea la sala). Corre `stepWorld` y manda snapshots (~20 Hz) + eventos. El INVITADO
 * solo manda su stick y sus botones, y dibuja lo que recibe. Un solo motor hace la física, así no hay
 * divergencia entre Android e iPhone (ver docs/DEUDA-multijugador-2-dispositivos.txt, sección 4).
 */
import { HEX, isKind, isSurface } from "../app/teams"
import type { GameEvent, PuckKind, SkaterKind, Surface } from "../engine"
import type { ButtonAction } from "../game/actions"

export const PROTOCOL_VERSION = 1
export const MAX_MESSAGE_BYTES = 16 * 1024

export interface HelloTeam { name: string; color: string; pantsColor?: string; crest: string; kinds: SkaterKind[]; names: string[] }
export interface HelloOpts {
  teams: [HelloTeam, HelloTeam]
  surface: Surface
  puckKind: PuckKind
  duration: number
  venue?: "generic" | "cantoni"
}

export type Snapshot = {
  t: "snap"
  seq: number
  w: [number, number, number, number, number, number, number] // time, clock, phaseTimer, score0, score1, fouls0, fouls1
  ph: string
  on: string[]
  rest: Array<[string, number]>
  bench: Array<[string, number, number]>
  sk: Array<[string, number, number, number, number, number, number, number]> // id x y vx vy heading stick stamina
  gl: Array<[number, number, number, number]>
  pk: { x: number; y: number; vx: number; vy: number; c: string | null; lt: string | null; ls: number | null; cs: 0 | 1; ss: 0 | 1; sp: number }
  ex: { subs: [number, number]; ac: [number, number] | null; dc: [number, number] | null; sd: 0 | 1; pen: 0 | 1 }
  ctl: [string | null, string | null]
}

export type Msg =
  | { t: "hi"; v: number }
  | { t: "hello"; v: number; opts: HelloOpts }
  | { t: "in"; mx: number; my: number }
  | { t: "btn"; a: ButtonAction }
  | { t: "ev"; e: GameEvent[] }
  | { t: "bye" }
  | Snapshot

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null)
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max && !/[\u0000-\u001f<>]/.test(v) ? v : null)
const ID = /^[A-Za-z][0-9]{1,2}$/
const id = (v: unknown): string | null => (typeof v === "string" && ID.test(v) ? v : null)
const BIG = 1000
const BUTTONS: readonly string[] = ["pase", "pase-fuerte", "tiro", "tiro-fuerte"]

function parseTeam(raw: unknown): HelloTeam | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as Record<string, unknown>
  const name = str(t.name, 24), crest = str(t.crest, 12)
  if (!name || !crest || typeof t.color !== "string" || !HEX.test(t.color)) return null
  if (t.pantsColor !== undefined && !(typeof t.pantsColor === "string" && HEX.test(t.pantsColor))) return null
  if (!Array.isArray(t.kinds) || t.kinds.length > 12 || !t.kinds.every(isKind)) return null
  if (!Array.isArray(t.names) || t.names.length > 12) return null
  const names: string[] = []
  for (const n of t.names) { const s = str(n, 16); if (s === null) return null; names.push(s) }
  const out: HelloTeam = { name, color: t.color, crest, kinds: t.kinds as SkaterKind[], names }
  if (typeof t.pantsColor === "string") out.pantsColor = t.pantsColor
  return out
}

export function parseHelloOpts(raw: unknown): HelloOpts | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.teams) || o.teams.length !== 2) return null
  const a = parseTeam(o.teams[0]), b = parseTeam(o.teams[1])
  if (!a || !b || !isSurface(o.surface)) return null
  if (o.puckKind !== "liviana" && o.puckKind !== "normal" && o.puckKind !== "pesada") return null
  const duration = num(o.duration, 30, 900)
  if (duration === null) return null
  const venue = o.venue === "cantoni" ? "cantoni" : o.venue === "generic" ? "generic" : undefined
  const out: HelloOpts = { teams: [a, b], surface: o.surface, puckKind: o.puckKind, duration }
  if (venue) out.venue = venue
  return out
}

const EVENT_TYPES = new Set(["goal", "kick", "pickup", "steal", "tackle", "goalieClear", "spill", "hit", "board", "post", "save", "deflect", "foul", "return", "kickoff", "end", "combo", "sub", "penalty"])

/** Eventos: solo se aceptan tipos conocidos y se copian SOLO campos con tipo válido. */
function parseEvent(raw: unknown): GameEvent | null {
  if (!raw || typeof raw !== "object") return null
  const e = raw as Record<string, unknown>
  if (typeof e.type !== "string" || !EVENT_TYPES.has(e.type)) return null
  const side = (v: unknown) => (v === 0 || v === 1 ? v : null)
  switch (e.type) {
    case "goal": { const s = side(e.side); return s === null ? null : { type: "goal", side: s, combo: e.combo === true } }
    case "kick": { const i = id(e.id), sp = num(e.speed, 0, BIG); return i && sp !== null ? { type: "kick", id: i, speed: sp, superShot: e.superShot === true } : null }
    case "pickup": { const i = id(e.id); return i ? { type: "pickup", id: i } : null }
    case "steal": { const i = id(e.id), f = id(e.from); return i && f ? { type: "steal", id: i, from: f } : null }
    case "tackle": { const i = id(e.id); return i ? { type: "tackle", id: i, strong: e.strong === true, hit: e.hit === true } : null }
    case "goalieClear": { const s = side(e.side), ny = num(e.ny, -BIG, BIG); return s !== null && ny !== null ? { type: "goalieClear", side: s, ny } : null }
    case "save": { const s = side(e.side), sp = num(e.speed, 0, BIG), ny = num(e.ny, -BIG, BIG); return s !== null && sp !== null && ny !== null ? { type: "save", speed: sp, side: s, ny, combo: e.combo === true, goalieSuper: e.goalieSuper === true } : null }
    case "combo": { const s = side(e.side), t = num(e.touches, 0, 9); return s !== null && t !== null && (e.kind === "attack" || e.kind === "defense") ? { type: "combo", side: s, touches: t, kind: e.kind } : null }
    case "sub": { const s = side(e.side), o = id(e.outId), i = id(e.inId); return s !== null && o && i ? { type: "sub", side: s, outId: o, inId: i } : null }
    case "foul": { const s = side(e.side), i = id(e.id), v = id(e.victim), im = num(e.impact, 0, BIG); return s !== null && i && v && im !== null ? { type: "foul", id: i, victim: v, side: s, impact: im } : null }
    case "penalty": { const s = side(e.side), sh = id(e.shooterId); return s !== null && sh ? { type: "penalty", side: s, shooterId: sh } : null }
    case "spill": { const i = id(e.id), im = num(e.impact, 0, BIG); return i && im !== null ? { type: "spill", id: i, impact: im } : null }
    case "hit": { const a = id(e.a), b = id(e.b), im = num(e.impact, 0, BIG); return a && b && im !== null ? { type: "hit", a, b, impact: im } : null }
    case "board": { const sp = num(e.speed, 0, BIG); return sp === null ? null : { type: "board", speed: sp } }
    case "post": { const sp = num(e.speed, 0, BIG); return sp === null ? null : { type: "post", speed: sp } }
    case "deflect": { const i = id(e.id), sp = num(e.speed, 0, BIG); return i && sp !== null ? { type: "deflect", id: i, speed: sp } : null }
    case "return": { const i = id(e.id); return i ? { type: "return", id: i } : null }
    case "kickoff": return { type: "kickoff" }
    case "end": return { type: "end" }
  }
  return null
}

function parseSnapshot(m: Record<string, unknown>): Snapshot | null {
  const seq = num(m.seq, 0, 1e9)
  if (seq === null || !Array.isArray(m.w) || m.w.length !== 7 || !m.w.every((x) => num(x, -BIG * 100, BIG * 100) !== null)) return null
  if (typeof m.ph !== "string" || m.ph.length > 10) return null
  if (!Array.isArray(m.on) || m.on.length > 16 || !m.on.every((x) => id(x))) return null
  if (!Array.isArray(m.rest) || m.rest.length > 16 || !m.rest.every((r) => Array.isArray(r) && id(r[0]) && (r[1] === 0 || r[1] === 1))) return null
  if (!Array.isArray(m.bench) || m.bench.length > 16 || !m.bench.every((r) => Array.isArray(r) && id(r[0]) && (r[1] === 0 || r[1] === 1) && num(r[2], 0, 1000) !== null)) return null
  if (!Array.isArray(m.sk) || m.sk.length > 24 || !m.sk.every((r) => Array.isArray(r) && r.length === 8 && id(r[0]) && r.slice(1).every((x) => num(x, -BIG, BIG) !== null))) return null
  if (!Array.isArray(m.gl) || m.gl.length > 2 || !m.gl.every((r) => Array.isArray(r) && r.length === 4 && r.every((x) => num(x, -BIG, BIG) !== null))) return null
  const p = m.pk as Record<string, unknown> | undefined, ex = m.ex as Record<string, unknown> | undefined
  if (!p || !ex || typeof p !== "object" || typeof ex !== "object") return null
  for (const k of ["x", "y", "vx", "vy", "sp"]) if (num(p[k], -BIG, BIG) === null) return null
  if (p.c !== null && !id(p.c)) return null
  if (p.lt !== null && !id(p.lt)) return null
  if (p.ls !== null && p.ls !== 0 && p.ls !== 1) return null
  if (!Array.isArray(ex.subs) || ex.subs.length !== 2 || !ex.subs.every((x) => num(x, 0, 99) !== null)) return null
  for (const k of ["ac", "dc"]) { const v = ex[k]; if (v !== null && !(Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1) && num(v[1], 0, 9) !== null)) return null }
  if (!Array.isArray(m.ctl) || m.ctl.length !== 2 || !m.ctl.every((x) => x === null || id(x))) return null
  return m as unknown as Snapshot
}

export function parseMessage(text: string): Msg | null {
  if (typeof text !== "string" || text.length > MAX_MESSAGE_BYTES) return null
  let m: unknown
  try { m = JSON.parse(text) } catch { return null }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null
  const o = m as Record<string, unknown>
  switch (o.t) {
    case "hi": { const v = num(o.v, 0, 1000); return v === null ? null : { t: "hi", v } }
    case "hello": { const v = num(o.v, 0, 1000), opts = parseHelloOpts(o.opts); return v !== null && opts ? { t: "hello", v, opts } : null }
    case "in": { const mx = num(o.mx, -1.01, 1.01), my = num(o.my, -1.01, 1.01); return mx !== null && my !== null ? { t: "in", mx: Math.max(-1, Math.min(1, mx)), my: Math.max(-1, Math.min(1, my)) } : null }
    case "btn": return typeof o.a === "string" && BUTTONS.includes(o.a) ? { t: "btn", a: o.a as ButtonAction } : null
    case "ev": {
      if (!Array.isArray(o.e) || o.e.length > 40) return null
      const e: GameEvent[] = []
      for (const raw of o.e) { const p = parseEvent(raw); if (p) e.push(p) }
      return { t: "ev", e }
    }
    case "bye": return { t: "bye" }
    case "snap": return parseSnapshot(o)
  }
  return null
}

export const encode = (m: Msg): string => JSON.stringify(m)
