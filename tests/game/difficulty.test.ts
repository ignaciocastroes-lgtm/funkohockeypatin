import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, GOALS, TeamAI, assistAim, createWorld, drainEvents, findSkater, kick, setInput, stepWorld } from "../../lib/engine"
import type { World } from "../../lib/engine"
import { NIVEL_PROFILE, NIVEL_SKILL } from "../../lib/game/match"
import type { Nivel } from "../../lib/game/match"

/** Mismo armado que `createMatch` (sin DOM): mundo + IA con el perfil del nivel. */
function setup(nivel: Nivel, seed: number): { w: World; ai: TeamAI } {
  const p = NIVEL_PROFILE[nivel]
  const w = createWorld({ duration: 90, goalieSkill: [p.myGoalie, p.rivalGoalie], carrierShield: [p.shield, 1], aimAssist: [p.aimAssist, 1] })
  const ai = new TeamAI({ seed, skill: [p.mates, p.rival] })
  return { w, ai }
}

/** Un "humano" ingenuo y algo impreciso: corre al arco y tira desde 11 m apuntando con error, usando
 *  la MISMA ayuda de puntería que los botones (`assistAim`). Devuelve la diferencia de gol. */
function play(nivel: Nivel, seed: number): number {
  const { w, ai } = setup(nivel, seed)
  const g = GOALS[1]
  let rng = seed * 9301 + 49297
  const rnd = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < Math.round(95 / FIXED_DT) && w.phase !== "ended"; i++) {
    const carrier = w.puck.carrierId ? findSkater(w, w.puck.carrierId) : undefined
    const mine = carrier && carrier.side === 0 ? carrier : w.skaters.filter((s) => s.side === 0).sort((a, b) => Math.hypot(a.x - w.puck.x, a.y - w.puck.y) - Math.hypot(b.x - w.puck.x, b.y - w.puck.y))[0]
    if (mine) {
      if (w.puck.carrierId === mine.id) {
        const d = Math.hypot(g.lineX - mine.x, g.cy - mine.y)
        setInput(w, mine.id, (g.lineX - mine.x) / d, (g.cy - mine.y) / d)
        if (d < 11) {
          const raw = Math.atan2(g.cy + (rnd() - 0.5) * 4 - mine.y, g.lineX - mine.x) // a veces afuera del arco
          const r = assistAim(w, mine.id, raw, 22)
          kick(w, mine.id, r.angle, r.speed)
        }
      } else {
        const d = Math.hypot(w.puck.x - mine.x, w.puck.y - mine.y) || 1
        setInput(w, mine.id, (w.puck.x - mine.x) / d, (w.puck.y - mine.y) / d)
      }
    }
    ai.update(w, mine?.id ?? null, FIXED_DT)
    stepWorld(w, FIXED_DT)
    drainEvents(w)
  }
  return w.score[0] - w.score[1]
}

test("dificultad: Normal es exactamente el comportamiento de antes (todas las ayudas en neutro)", () => {
  const n = NIVEL_PROFILE.normal
  assert.equal(n.aimAssist, 1)
  assert.equal(n.shield, 1)
  assert.equal(n.mates, 0.7)
  assert.equal(n.myGoalie, 0.7)
  assert.equal(n.rival, NIVEL_SKILL.normal)
  assert.equal(n.rivalGoalie, NIVEL_SKILL.normal)
})

test("dificultad: las ayudas van en el sentido correcto de Fácil a Difícil", () => {
  const [f, n, d] = [NIVEL_PROFILE.facil, NIVEL_PROFILE.normal, NIVEL_PROFILE.dificil]
  assert.ok(f.aimAssist > n.aimAssist && n.aimAssist > d.aimAssist)
  assert.ok(f.shield < n.shield && n.shield < d.shield)
  assert.ok(f.rival < n.rival && n.rival < d.rival)
  assert.ok(f.myGoalie > n.myGoalie && n.myGoalie > d.myGoalie)
})

test("dificultad: al mismo jugador ingenuo le va mejor en Fácil que en Normal, y en Normal que en Difícil", () => {
  const total = (nivel: Nivel) => { let s = 0; for (let seed = 1; seed <= 12; seed++) s += play(nivel, seed); return s }
  const f = total("facil"), n = total("normal"), d = total("dificil")
  assert.ok(f > n, `Fácil (${f}) debería dar mejor diferencia de gol que Normal (${n})`)
  assert.ok(n > d, `Normal (${n}) debería dar mejor diferencia de gol que Difícil (${d})`)
})

test("protección del portador: con `carrierShield` bajo, un rival en diagonal ya no le saca la bocha", () => {
  // Rival a 45° del frente del portador (medido desde el cuerpo, como el motor): dentro del cono de
  // siempre (55°), afuera del de Fácil (55° × 0.6 = 33°). Se busca a qué distancia sobre esa diagonal
  // el cono normal roba, y en ESE mismo lugar se prueba el de Fácil.
  const tryAt = (shield: number, t: number) => {
    const w = createWorld({ goalies: false, carrierShield: [shield, 1] })
    const l1 = w.skaters.find((s) => s.id === "L1")!
    const v1 = w.skaters.find((s) => s.id === "V1")!
    w.skaters.forEach((s, i) => { if (s !== l1 && s !== v1) { s.x = s.px = 2 + i * 1.2; s.y = s.py = 1 } })
    w.phase = "play"
    l1.x = l1.px = 20; l1.y = l1.py = 10; l1.heading = 0; l1.vx = l1.vy = 0
    v1.x = v1.px = 30; v1.y = v1.py = 18
    w.puck.carrierId = "L1"
    stepWorld(w, FIXED_DT) // la bocha queda en el palo
    l1.controlGrace = 0; l1.heading = 0; l1.vx = l1.vy = 0
    v1.pickupCooldown = 0
    const a = Math.PI / 4
    v1.x = v1.px = l1.x + Math.cos(a) * t
    v1.y = v1.py = l1.y + Math.sin(a) * t
    v1.vx = v1.vy = 0
    stepWorld(w, FIXED_DT)
    return w.puck.carrierId === "V1"
  }
  let spot: number | null = null
  for (let t = 0.5; t <= 1.6 && spot === null; t += 0.05) if (tryAt(1, t)) spot = t
  assert.ok(spot !== null, "con el cono normal, algún rival en la diagonal de 45° tiene que poder robar")
  assert.equal(tryAt(0.6, spot!), false, `en el mismo lugar (${spot!.toFixed(2)} m), con el cono de Fácil no roba`)
})
