import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, GOALS, TeamAI, RINK, drainEvents, findSkater, kick, stepWorld, createWorld, setInput } from "../../lib/engine"
import type { World, GameEvent } from "../../lib/engine"
import { makeWorld, parkOthers, place, shootPuck } from "./helpers"

function playAI(w: World, ai: TeamAI, seconds: number, human: string | null = null, each?: (w: World) => void): GameEvent[] {
  const out: GameEvent[] = []
  const n = Math.round(seconds / FIXED_DT)
  for (let i = 0; i < n; i++) {
    ai.update(w, human, FIXED_DT)
    stepWorld(w, FIXED_DT)
    if (w.events.length) out.push(...drainEvents(w))
    if (each) each(w)
  }
  return out
}

test("IA vs IA: el partido fluye (sin NaN, sin salirse, sin puck muerto, con pases y tiros)", () => {
  for (const seed of [1, 2, 3]) {
    const w = createWorld({ duration: 90 })
    const ai = new TeamAI({ seed })
    let idle = 0
    let maxIdle = 0
    let bad = false
    const events = playAI(w, ai, 90, null, (ww) => {
      const p = ww.puck
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad = true
      for (const s of ww.skaters) {
        if (!Number.isFinite(s.x) || s.x < -0.5 || s.x > RINK.length + 0.5 || s.y < -0.5 || s.y > RINK.width + 0.5) bad = true
      }
      idle = !p.carrierId && Math.hypot(p.vx, p.vy) < 0.3 ? idle + FIXED_DT : 0
      maxIdle = Math.max(maxIdle, idle)
    })
    let kicks = 0
    let passes = 0
    let lastKicker: string | null = null
    for (const ev of events) {
      if (ev.type === "kick") { kicks++; lastKicker = ev.id }
      if (ev.type === "pickup" && lastKicker) {
        if (ev.id !== lastKicker && ev.id[0] === lastKicker[0]) passes++
        lastKicker = null
      }
    }
    assert.equal(bad, false, `seed ${seed}: estado inválido`)
    assert.ok(maxIdle < 3, `seed ${seed}: puck parado ${maxIdle.toFixed(1)}s`)
    assert.ok(kicks >= 25, `seed ${seed}: pocas patadas ${kicks}`)
    assert.ok(passes >= 10, `seed ${seed}: pocos pases completados ${passes}`)
    assert.ok(w.fouls[0] + w.fouls[1] <= 6, `seed ${seed}: demasiadas faltas de la IA`)
  }
})

test("la IA es determinista con la misma semilla", () => {
  const run = (seed: number) => {
    const w = createWorld({ duration: 40 })
    const ai = new TeamAI({ seed })
    playAI(w, ai, 40)
    return JSON.stringify({ s: w.score, p: [w.puck.x.toFixed(4), w.puck.y.toFixed(4)], k: w.skaters.map((s) => [s.x.toFixed(4), s.y.toFixed(4)]) })
  }
  assert.equal(run(7), run(7))
})

test("con balón, cerca de la portería y con la línea libre: tira", () => {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, ["L2"])
  place(w, "L2", 29, 10)
  shootPuck(w, 29.8, 10, 0, 0)
  const ai = new TeamAI({ seed: 3 })
  const ev = playAI(w, ai, 3, "L1")
  const k = ev.find((e) => e.type === "kick" && e.id === "L2")
  assert.ok(k, "debía tirar")
  assert.ok(w.score[0] >= 1 || ev.some((e) => e.type === "goal"), "y sin portero debe ser gol")
})

test("con balón y presionado, pasa a un compañero libre (y lo recibe)", () => {
  const w = makeWorld({ teamSize: 4 })
  parkOthers(w, ["L2", "L3", "V1"])
  const c = place(w, "L2", 14, 10)
  place(w, "L3", 22, 4)
  place(w, "V1", 15.6, 10.3) // encima del portador
  shootPuck(w, 14.8, 10, 0, 0)
  const ai = new TeamAI({ seed: 5, skill: [0.9, 0.2] })
  c.pickupCooldown = 0
  // los rivales no se mueven: solo se mide la decisión de pasar y la recepción
  const freeze = (ww: World) => { for (const s of ww.skaters) if (s.side === 1) { s.vx = 0; s.vy = 0; s.inputX = 0; s.inputY = 0 } }
  const ev = playAI(w, ai, 3, "L1", freeze)
  assert.ok(ev.some((e) => e.type === "kick" && e.id === "L2"), "debía soltar el balón")
  assert.ok(ev.some((e) => e.type === "pickup" && e.id !== "L2" && e.id[0] === "L"), "el compañero debía recibirlo")
})

test("al atacar, los compañeros se abren a espacio libre (sin quedar tapados por un rival)", () => {
  const w = makeWorld({ teamSize: 4 })
  // el humano (L1) lleva el balón quieto; rivales agrupados cerca del portador
  const l1 = place(w, "L1", 16, 10)
  l1.pickupCooldown = 0
  shootPuck(w, 16.8, 10, 0, 0)
  place(w, "V1", 20, 9); place(w, "V2", 20, 11); place(w, "V3", 24, 10); place(w, "V4", 26, 8)
  const ai = new TeamAI({ seed: 2, skill: [0.8, 0.0] })
  playAI(w, ai, 0.05, "L1")
  assert.equal(w.puck.carrierId, "L1")
  // congelamos a los rivales para aislar el reposicionamiento de los compañeros
  playAI(w, ai, 6, "L1", (ww) => { for (const s of ww.skaters) if (s.side === 1) { s.vx = 0; s.vy = 0; s.inputX = 0; s.inputY = 0 } })
  const mates = w.skaters.filter((s) => s.side === 0 && s.id !== "L1")
  const openOnes = mates.filter((m) => {
    let lane = Infinity
    for (const o of w.skaters) {
      if (o.side !== 1) continue
      const dx = m.x - l1.x, dy = m.y - l1.y
      const l2 = dx * dx + dy * dy
      const t = Math.max(0, Math.min(1, ((o.x - l1.x) * dx + (o.y - l1.y) * dy) / l2))
      lane = Math.min(lane, Math.hypot(o.x - (l1.x + dx * t), o.y - (l1.y + dy * t)))
    }
    return lane > 1.3
  })
  assert.ok(openOnes.length >= 1, "al menos un compañero debe ofrecer una línea de pase limpia")
})

test("defendiendo: el más cercano presiona al portador rival y el último hombre se queda atrás", () => {
  const w = makeWorld({ teamSize: 4 })
  const v1 = place(w, "V1", 20, 10)
  v1.pickupCooldown = 0
  shootPuck(w, 19.2, 10, 0, 0)
  place(w, "L1", 12, 10); place(w, "L2", 14, 5); place(w, "L3", 14, 15); place(w, "L4", 9, 10)
  const ai = new TeamAI({ seed: 4, skill: [0.8, 0.8] })
  // el portador rival se queda quieto
  playAI(w, ai, 3, null, (ww) => { const v = findSkater(ww, "V1"); if (v) { v.vx = 0; v.vy = 0; v.inputX = 0; v.inputY = 0 } })
  const d = (id: string) => { const s = findSkater(w, id)!; return Math.hypot(s.x - v1.x, s.y - v1.y) }
  const nearest = Math.min(...["L1", "L2", "L3", "L4"].map(d))
  assert.ok(nearest < 2.5, `alguien debía llegar a presionar (dist ${nearest.toFixed(1)})`)
  const back = Math.min(...["L1", "L2", "L3", "L4"].map((id) => findSkater(w, id)!.x))
  assert.ok(back < 14, "alguien se queda atrás cubriendo la portería")
})

test("la IA nunca toca los controles del jugador humano y para todo fuera de juego", () => {
  const w = makeWorld({ teamSize: 4 })
  const ai = new TeamAI({ seed: 1 })
  setInput(w, "L1", 0.25, -0.5)
  ai.update(w, "L1", FIXED_DT)
  const l1 = findSkater(w, "L1")!
  assert.equal(l1.inputX, 0.25)
  assert.equal(l1.inputY, -0.5)
  w.phase = "goal"
  ai.update(w, "L1", FIXED_DT)
  assert.equal(findSkater(w, "L2")!.inputX, 0)
  assert.equal(l1.inputX, 0.25)
})

test("dificultad: un rival hábil se impone a uno torpe (misma semilla, mismo 'humano' ingenuo)", () => {
  const g = GOALS[1]
  const match = (oppSkill: number, seed: number) => {
    const w = createWorld({ duration: 90 })
    const ai = new TeamAI({ seed, skill: [0.7, oppSkill] })
    let ctl: string | null = "L1"
    for (let i = 0; i < Math.round(95 / FIXED_DT) && w.phase !== "ended"; i++) {
      // humano ingenuo: el portador corre a la portería y tira desde 11 m; si no, va al puck
      const carrier = w.puck.carrierId ? findSkater(w, w.puck.carrierId) : undefined
      const mine = carrier && carrier.side === 0 ? carrier : w.skaters.filter((s) => s.side === 0).sort((a, b) => Math.hypot(a.x - w.puck.x, a.y - w.puck.y) - Math.hypot(b.x - w.puck.x, b.y - w.puck.y))[0]
      ctl = mine?.id ?? null
      if (mine) {
        if (w.puck.carrierId === mine.id) {
          const d = Math.hypot(g.lineX - mine.x, g.cy - mine.y)
          setInput(w, mine.id, (g.lineX - mine.x) / d, (g.cy - mine.y) / d)
          if (d < 11) {
            const side = i % 2 ? 0.7 : -0.7
            kick(w, mine.id, Math.atan2(g.cy + side - mine.y, g.lineX - mine.x), 27)
          }
        } else {
          const d = Math.hypot(w.puck.x - mine.x, w.puck.y - mine.y) || 1
          setInput(w, mine.id, (w.puck.x - mine.x) / d, (w.puck.y - mine.y) / d)
        }
      }
      ai.update(w, ctl, FIXED_DT)
      stepWorld(w, FIXED_DT)
      drainEvents(w)
    }
    return w.score[0] - w.score[1]
  }
  let weak = 0
  let strong = 0
  for (let seed = 1; seed <= 6; seed++) { weak += match(0.2, seed); strong += match(0.9, seed) }
  assert.ok(weak > strong, `el humano ingenuo debe irle mejor contra el torpe (${weak}) que contra el hábil (${strong})`)
})

test("defendiendo: cubre más de cerca al rival peligroso cerca del arco que al mismo rival lejos", () => {
  const own = GOALS[0] // el equipo que defiende (L) cuida esta portería, en lineX chico

  function gapFor(dangerX: number): number {
    const w = makeWorld({ teamSize: 4 })
    const v1 = place(w, "V1", 20, 10)
    v1.pickupCooldown = 0
    shootPuck(w, 19.2, 10, 0, 0) // V1 "lleva" el puck (portador rival, quieto)
    place(w, "V2", dangerX, 14) // el rival a cubrir: cerca o lejos del arco según el caso
    place(w, "V3", 35, 2) // lejos de todo, para que nunca sea el más peligroso
    place(w, "V4", 35, 18)
    place(w, "L1", 12, 10); place(w, "L2", 14, 6); place(w, "L3", 14, 14); place(w, "L4", 9, 10)
    const ai = new TeamAI({ seed: 7, skill: [0.8, 0.8] })
    playAI(w, ai, 3, null, (ww) => { const v = findSkater(ww, "V1"); if (v) { v.vx = 0; v.vy = 0; v.inputX = 0; v.inputY = 0 } })
    const v2 = findSkater(w, "V2")!
    return Math.min(...["L1", "L2", "L3", "L4"].map((id) => Math.hypot(findSkater(w, id)!.x - v2.x, findSkater(w, id)!.y - v2.y)))
  }

  const closeGap = gapFor(own.lineX + 3) // V2 pegado al arco: peligro real
  const farGap = gapFor(own.lineX + 16) // V2 lejos: todavía no es una amenaza inmediata
  assert.ok(closeGap < farGap, `debería cubrirlo más de cerca cuanto más cerca del arco está (cerca ${closeGap.toFixed(1)}, lejos ${farGap.toFixed(1)})`)
})

test("modo demo: IA vs IA sin humano (humanId null) llega a anotar goles de verdad", () => {
  let totalGoals = 0
  for (const seed of [11, 12, 13]) {
    const w = createWorld({ duration: 180 })
    const ai = new TeamAI({ seed })
    playAI(w, ai, 180, null)
    totalGoals += w.score[0] + w.score[1]
  }
  assert.ok(totalGoals >= 2, `en 3 partidos demo de 3 minutos debería haber al menos algún gol (hubo ${totalGoals})`)
})
