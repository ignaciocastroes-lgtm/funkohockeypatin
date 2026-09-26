import { RINK, STAMINA, SUPER_SHOT_COST } from "./constants"
import { GOALS } from "./geometry"
import { passSpeedFor } from "./aim"
import { findSkater, kick, setInput, trySub } from "./world"
import type { Side, Skater, World } from "./types"

/**
 * IA de equipo (Ronda 3). Determinista: usa un generador con semilla y solo mira el mundo.
 * Se llama UNA vez por paso fijo. Maneja a todos los patinadores salvo el que controla el humano.
 *
 *   Con balón : regatea esquivando rivales; tira si está cerca y con línea libre;
 *               pasa si lo presionan o si un compañero está mejor.
 *   Sin balón : el más cercano presiona (sin cargar a lo loco: eso es falta), el último
 *               hombre cierra la portería, el resto marca. Al atacar, los compañeros
 *               buscan espacio libre para ofrecer un pase.
 */

export interface AIOptions {
  /** Habilidad por equipo, 0 (torpe) a 1 (afinado). [local, visita] */
  skill?: [number, number]
  seed?: number
}

interface Mem { carryTime: number; cooldown: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Distancia del punto (px,py) al segmento (ax,ay)-(bx,by). */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 < 1e-9 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * Identidad SIN posiciones fijas: no hay roles asignados a un jugador para siempre, hay una
 * PREFERENCIA que la IA usa como desempate cuando dos patinadores están parecidos de cerca.
 * Todos siguen pudiendo ser "último hombre" o pisar el área rival en la misma jugada — eso es
 * a propósito (así juega el hockey sobre patines) — pero de listado el 0 tira más para atrás,
 * el 1 pide la bola sin irse al fondo, y el 2/3 son quienes más pisan punta. El `kind` empuja
 * en la misma dirección: pesado cierra, veloz persigue.
 */
function rosterIndex(id: string): number {
  const m = id.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) - 1 : 0
}

/** Cuánto le gusta a este patinador ser el "último hombre" (más alto = más probable). */
function lastManPull(s: Skater): number {
  const idx = rosterIndex(s.id)
  let pull = idx === 0 ? 3 : idx === 1 ? -1 : -0.5
  if (s.kind === "pesado") pull += 1.5
  else if (s.kind === "veloz") pull -= 1.2
  return pull
}

/** Cuánto le gusta a este patinador salir a presionar al portador. */
function chaserPull(s: Skater): number {
  const idx = rosterIndex(s.id)
  let pull = idx === 0 ? -0.6 : 0
  if (s.kind === "veloz") pull += 1.6
  else if (s.kind === "pesado") pull -= 0.8
  return pull
}

export class TeamAI {
  private skill: [number, number]
  private rnd: () => number
  private mem = new Map<string, Mem>()
  private curOpp: Skater[] = []

  constructor(o: AIOptions = {}) {
    this.skill = o.skill ?? [0.7, 0.7]
    this.rnd = mulberry32(o.seed ?? 1)
  }

  private m(id: string): Mem {
    let x = this.mem.get(id)
    if (!x) { x = { carryTime: 0, cooldown: 0 }; this.mem.set(id, x) }
    return x
  }

  update(w: World, humanId: string | null, dt: number, sides: Side[] = [0, 1]) {
    if (w.phase !== "play") {
      for (const s of w.skaters) if (s.id !== humanId) setInput(w, s.id, 0, 0)
      return
    }
    const carrier = w.puck.carrierId ? findSkater(w, w.puck.carrierId) : undefined
    if (!carrier) for (const x of this.mem.values()) x.carryTime = 0
    // Cambio por cansancio: automático en cuanto hay alguien tirado y suplente fresco (tope: 3 por equipo).
    // Nunca al que tiene la bola, ni al que el humano está manejando ahora mismo.
    for (const side of sides) trySub(w, side, humanId)
    for (const side of sides) this.updateSide(w, side, humanId, carrier, dt)
  }

  // ------------------------------------------------------------------
  private updateSide(w: World, side: Side, humanId: string | null, carrier: Skater | undefined, dt: number) {
    const skill = this.skill[side]
    const team = w.skaters.filter((s) => s.side === side)
    const opp = w.skaters.filter((s) => s.side !== side)
    this.curOpp = opp
    const ai = team.filter((s) => s.id !== humanId)
    if (ai.length === 0) return
    const u = side === 0 ? 1 : -1
    const own = GOALS[side]
    const p = w.puck
    const puckF = (p.x - own.lineX) * u
    const speedMul = 0.8 + 0.2 * skill

    for (const s of team) {
      const mm = this.m(s.id)
      mm.carryTime = carrier && carrier.id === s.id ? mm.carryTime + dt : 0
      if (mm.cooldown > 0) mm.cooldown -= dt
    }

    const mode: "attack" | "defend" | "loose" = carrier ? (carrier.side === side ? "attack" : "defend") : "loose"

    // --- quién va por el puck: el más cercano de TODO el equipo (si es el humano, nadie más lo persigue)
    let chaser: Skater | undefined
    if (mode !== "attack") {
      const tx = mode === "defend" ? carrier!.x + carrier!.vx * 0.2 : p.x + p.vx * 0.3
      const ty = mode === "defend" ? carrier!.y + carrier!.vy * 0.2 : p.y + p.vy * 0.3
      let best = Infinity
      for (const s of team) {
        // Distancia real, con un empujoncito de preferencia (kind + lugar en la lista) para
        // desempatar entre dos que están parecido de cerca — no reemplaza "el más cerca va".
        const d = Math.hypot(s.x - tx, s.y - ty) - (s.id === humanId ? 1.2 : 0) - chaserPull(s) * 0.9
        if (d < best) { best = d; chaser = s }
      }
    }

    const busy = new Set<string>()
    if (mode === "attack" && carrier) busy.add(carrier.id)
    if (chaser) busy.add(chaser.id)

    // --- último hombre: el más atrasado de los libres
    let lastMan: Skater | undefined
    {
      let best = Infinity
      for (const s of team) {
        if (busy.has(s.id)) continue
        // f mide qué tan atrás está; restar el "pull" hace que el 0 (y el pesado) ganen el
        // desempate para quedarse de último hombre sin que eso les esté reservado siempre.
        const f = (s.x - own.lineX) * u - lastManPull(s)
        if (f < best) { best = f; lastMan = s }
      }
      if (lastMan) busy.add(lastMan.id)
    }

    // --- conductor con balón
    if (mode === "attack" && carrier && carrier.id !== humanId) this.carry(w, carrier, opp, team, skill, dt)

    // --- presión sobre el portador / balón suelto
    if (chaser && chaser.id !== humanId) {
      const target = mode === "defend"
        ? { x: carrier!.x + carrier!.vx * 0.25, y: carrier!.y + carrier!.vy * 0.25 }
        : { x: p.x + p.vx * 0.3, y: p.y + p.vy * 0.3 }
      const d = Math.hypot(target.x - chaser.x, target.y - chaser.y)
      // cerca del portador frena: cargar a toda velocidad es falta
      const cap = mode === "defend" && d < 3.2 ? 0.62 : 1
      this.moveTo(w, chaser, target.x, target.y, cap * speedMul, team, false)
    }

    // --- último hombre: entre el puck y su portería
    if (lastMan && lastMan.id !== humanId) {
      const F = mode === "attack" ? clamp(puckF - 9, 6, 15) : clamp(puckF * 0.4, 5, 12)
      const tx = own.lineX + u * F
      const ty = own.cy + (p.y - own.cy) * 0.35
      this.moveTo(w, lastMan, tx, ty, speedMul, team, true)
    }

    // --- el resto
    const rest = team.filter((s) => !busy.has(s.id) && s.id !== humanId)
    if (mode === "attack" && carrier) {
      const claimed: Array<{ x: number; y: number }> = []
      const oppGoal = GOALS[side === 0 ? 1 : 0]
      // ¿La jugada ya entró de verdad en zona de gol? Ahí ya no sirve "abrirse ancho a mitad de
      // cancha": lo que enseña el hockey de patines es plantarse en la boca del arco, un palo cada
      // uno, a peinar un pelotazo o un rebote — un desvío también es gol.
      const deepAttack = Math.abs(oppGoal.lineX - carrier.x) < 13
      // Nadie tiene un carril fijo de por vida, pero de listado el 2 y el 3 son quienes más
      // pisan punta (ancho y arriba); el 1 es el armador: pide la bola cerca, no se cuelga al
      // fondo; el 0, si igual quedó libre acá (no de último hombre), acompaña corto y central.
      rest.sort((a, b) => a.y - b.y)
      let wing = 0
      rest.forEach((s) => {
        const idx = rosterIndex(s.id)
        const opposite = carrier.y < RINK.width / 2
        if ((idx === 2 || idx === 3) && deepAttack) {
          // Un palo cada punta: ofrece el desvío de cerca en vez de esperar el pase de vuelta.
          const side2 = wing % 2 === 0 ? opposite : !opposite
          const tx = oppGoal.lineX - u * 2.1
          const ty = side2 ? oppGoal.yMax - 0.7 : oppGoal.yMin + 0.7
          claimed.push({ x: tx, y: ty })
          this.moveTo(w, s, tx, ty, speedMul, team, true)
          wing++
          return
        }
        let laneBase: number
        let ahead: number
        if (idx === 2 || idx === 3) {
          const side2 = wing % 2 === 0 ? opposite : !opposite
          laneBase = side2 ? RINK.width * 0.85 : RINK.width * 0.15
          ahead = 8 + (s.kind === "veloz" ? 2 : 0)
          wing++
        } else if (idx === 1) {
          laneBase = RINK.width * 0.5 + (opposite ? 5 : -5)
          ahead = 3
        } else {
          laneBase = RINK.width * 0.5 + (opposite ? -4 : 4)
          ahead = s.kind === "pesado" ? 0 : 2
        }
        const spot = this.findOpenSpot(w, side, carrier, carrier.x + u * ahead, laneBase, opp, claimed)
        claimed.push(spot)
        this.moveTo(w, s, spot.x, spot.y, speedMul, team, true)
      })
    } else {
      // defendiendo / balón suelto: marcar al rival más peligroso sin marcar (el más cercano a mi portería)
      const targets = opp
        .filter((o) => !carrier || o.id !== carrier.id)
        .sort((a, b) => Math.abs(a.x - own.lineX) - Math.abs(b.x - own.lineX))
      const pressAttack = mode === "loose" && puckF > 22
      rest.forEach((s, i) => {
        if (pressAttack) {
          const ty = i % 2 === 0 ? RINK.width * 0.3 : RINK.width * 0.7
          this.moveTo(w, s, p.x + u * (i % 2 === 0 ? 5 : 1), ty, speedMul, team, true)
          return
        }
        const o = targets[i]
        if (!o) { this.moveTo(w, s, own.lineX + u * 9, RINK.width / 2, speedMul, team, true); return }
        const dx = own.lineX - o.x
        const dy = own.cy - o.y
        const d = Math.hypot(dx, dy) || 1
        // Cubre la línea de tiro, no al cuerpo: más cerca del rival cuanto más cerca está del arco
        // (ahí el remate es real), más suelto cuando todavía está lejos (curar el pase, no pegarse).
        // El pesado marca más corto y firme; el veloz se anima a soltar un poco más porque
        // confía en recuperar con el sprint.
        const kindTight = s.kind === "pesado" ? 0.72 : s.kind === "veloz" ? 1.18 : 1
        const interpose = clamp((0.8 + (d / RINK.length) * 3.6) * kindTight, 0.7, 3.6)
        this.moveTo(w, s, o.x + (dx / d) * interpose, o.y + (dy / d) * interpose, speedMul, team, true)
      })
    }
  }

  // ------------------------------------------------------------------
  /** Movimiento hacia un punto con llegada suave, separación entre compañeros y esquive de vallas. */
  private moveTo(w: World, s: Skater, tx: number, ty: number, cap: number, team: Skater[], arrive: boolean) {
    let dx = tx - s.x
    let dy = ty - s.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-6) { setInput(w, s.id, 0, 0); return }
    let mag = arrive ? clamp((d - 0.4) / 2.2, 0, 1) : 1
    dx /= d
    dy /= d
    let ix = dx * mag
    let iy = dy * mag
    for (const o of team) {
      if (o.id === s.id) continue
      const ox = s.x - o.x
      const oy = s.y - o.y
      const od = Math.hypot(ox, oy)
      if (od < 2.4 && od > 1e-6) {
        const k = ((2.4 - od) / 2.4) * 0.9
        ix += (ox / od) * k
        iy += (oy / od) * k
      }
    }
    mag = Math.hypot(ix, iy)
    if (mag > 1) { ix /= mag; iy /= mag }
    // sin balón y sin ir a tacklear: frena al acercarse a un rival (cargarlo a toda velocidad es falta)
    if (arrive) {
      for (const o of this.curOpp) {
        const ox = o.x - s.x
        const oy = o.y - s.y
        const od = Math.hypot(ox, oy)
        if (od < 3.2 && od > 1e-6 && (ox * ix + oy * iy) / od > 0.35) {
          cap = Math.min(cap, clamp(0.35 + 0.65 * ((od - 1.1) / 2.1), 0.35, 1))
        }
      }
    }
    setInput(w, s.id, ix * cap, iy * cap)
  }

  /** Busca, alrededor de un punto base, el sitio más libre para ofrecerse a recibir un pase. */
  private findOpenSpot(
    w: World, side: Side, carrier: Skater, bx: number, by: number, opp: Skater[], claimed: Array<{ x: number; y: number }>,
  ): { x: number; y: number } {
    const u = side === 0 ? 1 : -1
    const goalF = GOALS[side === 0 ? 1 : 0].lineX
    const maxX = goalF - u * 4
    let best = { x: bx, y: by }
    let bestScore = -Infinity
    for (const ox of [-3, 0, 3]) {
      for (const oy of [-4, -2, 0, 2, 4]) {
        const x = clamp(bx + ox, 4, RINK.length - 4)
        const y = clamp(by + oy, 2.5, RINK.width - 2.5)
        if ((x - maxX) * u > 0) continue
        let lane = 3
        let near = 5
        for (const o of opp) {
          lane = Math.min(lane, distToSegment(o.x, o.y, carrier.x, carrier.y, x, y))
          near = Math.min(near, Math.hypot(o.x - x, o.y - y))
        }
        let crowd = 0
        for (const c of claimed) if (Math.hypot(c.x - x, c.y - y) < 4) crowd += 3
        const progress = ((x - carrier.x) * u) * 0.12
        const score = lane * 2 + near * 1.2 + progress - crowd - Math.hypot(ox, oy) * 0.25
        if (score > bestScore) { bestScore = score; best = { x, y } }
      }
    }
    return best
  }

  // ------------------------------------------------------------------
  private carry(w: World, s: Skater, opp: Skater[], team: Skater[], skill: number, _dt: number) {
    const side = s.side
    const u = side === 0 ? 1 : -1
    const goal = GOALS[side === 0 ? 1 : 0]
    const mm = this.m(s.id)
    const think = 0.55 - 0.4 * skill
    const dGoal = Math.hypot(goal.lineX - s.x, goal.cy - s.y)
    const facingGoal = (goal.lineX - s.x) * u > 1

    let pressure = 99
    for (const o of opp) pressure = Math.min(pressure, Math.hypot(o.x - s.x, o.y - s.y))

    if (mm.carryTime >= think && s.pickupCooldown <= 0) {
      // 1) tiro
      // Dos zonas, no una: de cerca (`closeRange`) se puede tirar con algo de marca encima —
      // un tiro de poder normal, atajable de verdad. De lejos, hasta `bombRange` (así juegan
      // los grandes: un supertiro de 30 m), solo si el arco está REALMENTE despejado de punta a
      // punta (o directo a un compañero parado en el segundo palo, que cuenta como despejado
      // porque `clear` solo mira rivales — si la desvía, es gol). Nada de bypass ni garantía: el
      // arquero hace lo que puede, la velocidad real decide.
      const closeRange = 10 + 6 * skill
      const bombRange = 30
      if (facingGoal && dGoal <= bombRange) {
        const g = w.goalies.find((q) => q.side === goal.side)
        const aimY = g && g.y > goal.cy ? goal.yMin + 0.4 : goal.yMax - 0.4
        const bias = g ? 0 : this.rnd() < 0.5 ? goal.yMin + 0.4 : goal.yMax - 0.4
        const ty = g ? aimY : bias
        let clear = true
        for (const o of opp) if (distToSegment(o.x, o.y, s.x, s.y, goal.lineX, ty) < 0.85) { clear = false; break }
        const inClose = dGoal <= closeRange
        if (inClose && (clear || pressure < 1.6)) {
          const err = (this.rnd() - 0.5) * 2 * 0.12 * (1 - skill)
          // BUG real que encontré acá antes: siempre se pateaba a 24-28 m/s, que es justo el piso
          // del "súper tiro" (`STAMINA.superShotMinSpeed`) — CUALQUIER remate de cerca terminaba
          // siendo un súper tiro. Ahora el de cerca es un tiro de poder normal (más floja cuanto
          // más lejos, dentro de esta zona), y de vez en cuando, si hay margen y tanque, carga el
          // súper tiro de cerca también.
          const near = clamp(1 - dGoal / closeRange, 0, 1) // 1 = pegado al arco, 0 = borde de esta zona
          const wantsSuper = near > 0.6 && clear && s.stamina >= SUPER_SHOT_COST + 15
            && this.rnd() < 0.1 + 0.2 * skill
          const speed = wantsSuper
            ? STAMINA.superShotMinSpeed + 2 + 3 * skill
            : 12 + 6 * near + 3 * skill // 12..21 m/s: potente y realista, pero el arquero tiene chance
          kick(w, s.id, Math.atan2(ty - s.y, goal.lineX - s.x) + err, speed)
          mm.carryTime = 0
          return
        }
        // El supertiro de larga distancia: solo con el arco de verdad libre (ni un rival cortando
        // la línea) y solo si hay tanque para cargarlo — como el humano, gasta la mitad de la
        // energía. La chance sube con el nivel del jugador: esto lo hacen "los mejores", no cualquiera.
        if (!inClose && clear && s.stamina >= SUPER_SHOT_COST && this.rnd() < 0.05 + 0.35 * skill) {
          const err = (this.rnd() - 0.5) * 2 * 0.08 * (1 - skill)
          kick(w, s.id, Math.atan2(ty - s.y, goal.lineX - s.x) + err, STAMINA.superShotMinSpeed + 2 + 6 * skill)
          mm.carryTime = 0
          return
        }
      }
      // 2) pase
      if (pressure < 2.7 || mm.carryTime > 1.8) {
        let best: Skater | null = null
        let bestScore = 2.5
        for (const t of team) {
          if (t.id === s.id) continue
          const dist = Math.hypot(t.x - s.x, t.y - s.y)
          if (dist < 3.5 || dist > 22) continue
          const flight = Math.min(0.8, dist / 14)
          const tx = t.x + t.vx * flight
          const ty = t.y + t.vy * flight
          let lane = 3
          for (const o of opp) lane = Math.min(lane, distToSegment(o.x, o.y, s.x, s.y, tx, ty))
          if (lane < 1.3) continue
          let near = 5
          for (const o of opp) near = Math.min(near, Math.hypot(o.x - tx, o.y - ty))
          const gain = ((t.x - s.x) * u) * 0.25
          const score = lane * 1.2 + near * 0.8 + gain + (pressure < 1.8 ? 2 : 0)
          if (score > bestScore) { bestScore = score; best = t }
        }
        if (best) {
          const dist = Math.hypot(best.x - s.x, best.y - s.y)
          const flight = Math.min(0.8, dist / 14)
          const tx = best.x + best.vx * flight
          const ty = best.y + best.vy * flight
          const err = (this.rnd() - 0.5) * 2 * 0.06 * (1 - skill)
          kick(w, s.id, Math.atan2(ty - s.y, tx - s.x) + err, passSpeedFor(dist))
          mm.carryTime = 0
          return
        }
      }
    }

    // 3) regate: hacia la portería rival esquivando
    let gx = goal.lineX - u * 3
    let gy = goal.cy + (s.y - goal.cy) * 0.45
    let dx = gx - s.x
    let dy = gy - s.y
    const dl = Math.hypot(dx, dy) || 1
    dx /= dl
    dy /= dl
    for (const o of opp) {
      const ox = o.x - s.x
      const oy = o.y - s.y
      const od = Math.hypot(ox, oy)
      if (od < 3.6 && od > 1e-6 && ox * dx + oy * dy > -0.5) {
        const k = ((3.6 - od) / 3.6) * 1.8
        dx -= (ox / od) * k
        dy -= (oy / od) * k
      }
    }
    // vallas
    if (s.y < 2.2) dy += 0.8
    if (s.y > RINK.width - 2.2) dy -= 0.8
    if ((s.x - own(side).lineX) * u < 2.5) dx += u * 0.6
    const m = Math.hypot(dx, dy) || 1
    const speedMul = 0.8 + 0.2 * skill
    setInput(w, s.id, (dx / m) * speedMul, (dy / m) * speedMul)
  }
}

function own(side: Side) { return GOALS[side] }

