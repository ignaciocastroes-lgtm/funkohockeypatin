/** Foto compacta del mundo para el invitado: `makeSnapshot` (host) y `applySnapshot` (invitado). */
import type { Skater, Side, World } from "../engine"
import type { Snapshot } from "./protocol"

const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000

export function makeSnapshot(w: World, seq: number, ctl: [string | null, string | null]): Snapshot {
  const all: Skater[] = [...w.skaters, ...w.restBench.map((b) => b.skater), ...w.bench.map((b) => b.skater)]
  const p = w.puck
  return {
    t: "snap", seq,
    w: [r2(w.time), r2(w.clock), r2(w.phaseTimer), w.score[0], w.score[1], w.fouls[0], w.fouls[1]],
    ph: w.phase,
    on: w.skaters.map((s) => s.id),
    rest: w.restBench.map((b) => [b.skater.id, b.side]),
    bench: w.bench.map((b) => [b.skater.id, b.side, r2(b.timer)]),
    sk: all.map((s) => [s.id, r2(s.x), r2(s.y), r2(s.vx), r2(s.vy), r3(s.heading), r3(s.stickAngle), Math.round(s.stamina)]),
    gl: w.goalies.map((g) => [r2(g.x), r2(g.y), r2(g.vx), r2(g.vy)]),
    pk: { x: r3(p.x), y: r3(p.y), vx: r2(p.vx), vy: r2(p.vy), c: p.carrierId, lt: p.lastTouchId, ls: p.lastTouchSide, cs: p.comboShot ? 1 : 0, ss: p.superShot ? 1 : 0, sp: r2(p.spin) },
    ex: {
      subs: [w.subsUsed[0], w.subsUsed[1]],
      ac: w.attackCombo ? [w.attackCombo.side, w.attackCombo.touches] : null,
      dc: w.defCombo ? [w.defCombo.side, w.defCombo.touches] : null,
      sd: w.suddenDeath ? 1 : 0, pen: w.penaltyActive ? 1 : 0,
    },
    ctl,
  }
}

/** Pisa el mundo del invitado con la foto. Devuelve false (sin tocar nada) si la foto no encaja con este mundo. */
export function applySnapshot(w: World, s: Snapshot): boolean {
  const all = new Map<string, Skater>()
  for (const k of [...w.skaters, ...w.restBench.map((b) => b.skater), ...w.bench.map((b) => b.skater)]) all.set(k.id, k)
  const known = (i: string) => all.has(i)
  if (!s.on.every(known) || !s.rest.every((r) => known(r[0])) || !s.bench.every((r) => known(r[0])) || !s.sk.every((r) => known(r[0]))) return false
  if (s.gl.length !== w.goalies.length) return false

  for (const r of s.sk) {
    const k = all.get(r[0]) as Skater
    k.px = k.x; k.py = k.y
    k.x = r[1]; k.y = r[2]; k.vx = r[3]; k.vy = r[4]; k.heading = r[5]; k.stickAngle = r[6]; k.stamina = r[7]
  }
  w.skaters.length = 0
  for (const i of s.on) w.skaters.push(all.get(i) as Skater)
  w.restBench.length = 0
  for (const [i, side] of s.rest) w.restBench.push({ skater: all.get(i) as Skater, side: side as Side })
  w.bench.length = 0
  for (const [i, side, timer] of s.bench) w.bench.push({ skater: all.get(i) as Skater, side: side as Side, timer })
  s.gl.forEach((g, i) => { const t = w.goalies[i]; t.px = t.x; t.py = t.y; t.x = g[0]; t.y = g[1]; t.vx = g[2]; t.vy = g[3] })

  const p = w.puck, q = s.pk
  p.px = p.x; p.py = p.y
  p.x = q.x; p.y = q.y; p.vx = q.vx; p.vy = q.vy
  p.carrierId = q.c; p.lastTouchId = q.lt; p.lastTouchSide = q.ls as Side | null
  p.comboShot = q.cs === 1; p.superShot = q.ss === 1; p.spin = q.sp

  ;[w.time, w.clock, w.phaseTimer] = [s.w[0], s.w[1], s.w[2]]
  w.score = [s.w[3], s.w[4]]
  w.fouls = [s.w[5], s.w[6]]
  w.phase = s.ph as World["phase"]
  w.subsUsed = [s.ex.subs[0], s.ex.subs[1]]
  w.attackCombo = s.ex.ac ? { side: s.ex.ac[0] as Side, touches: s.ex.ac[1] } : null
  w.defCombo = s.ex.dc ? { side: s.ex.dc[0] as Side, touches: s.ex.dc[1] } : null
  w.suddenDeath = s.ex.sd === 1
  w.penaltyActive = s.ex.pen === 1
  return true
}
