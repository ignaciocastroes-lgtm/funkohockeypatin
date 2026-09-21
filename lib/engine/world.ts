import { FIXED_DT, GOALIE, MATCH, PUCK, RINK, RULES, SKATER, SKATER_KINDS, SURFACES } from "./constants"
import { boardContact, collectContacts, GOALS, type Contact } from "./geometry"
import type { GameEvent, Goalie, Puck, Side, Skater, SkaterKind, World, WorldConfig } from "./types"

// ---------- utilidades ----------
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

function angleDiff(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

function rotateToward(cur: number, target: number, maxStep: number): number {
  const d = angleDiff(cur, target)
  if (Math.abs(d) <= maxStep) return target
  return cur + Math.sign(d) * maxStep
}

function emit(w: World, ev: GameEvent) {
  if (w.events.length >= 256) w.events.shift()
  w.events.push(ev)
}

/** Devuelve y limpia los eventos acumulados (goles, golpes, pases...). */
export function drainEvents(w: World): GameEvent[] {
  const out = w.events.slice()
  w.events.length = 0
  return out
}

export function findSkater(w: World, id: string | null): Skater | undefined {
  if (id === null) return undefined
  for (const s of w.skaters) if (s.id === id) return s
  return undefined
}

// ---------- creación ----------
const DEFAULT_KINDS: SkaterKind[] = ["pesado", "equilibrado", "veloz", "equilibrado"]

/** Formación de saque: fracciones (largo desde su propia portería, ancho). */
function formation(i: number): [number, number] {
  switch (i) {
    case 0: return [0.42, 0.5]
    case 1: return [0.28, 0.28]
    case 2: return [0.28, 0.72]
    case 3: return [0.15, 0.5]
    default: return [0.2 + 0.04 * (i - 4), 0.15 + 0.7 * (((i - 4) % 2) === 0 ? 0.25 : 0.75)]
  }
}

function placeKickoff(w: World) {
  const L = RINK.length
  const W = RINK.width
  for (const s of w.skaters) {
    const idx = Number(s.id.slice(1)) - 1
    const [fx, fy] = formation(idx)
    s.x = s.side === 0 ? fx * L : L - fx * L
    s.y = fy * W
    s.vx = 0; s.vy = 0
    s.px = s.x; s.py = s.y
    s.heading = s.side === 0 ? 0 : Math.PI
    s.stickAngle = s.heading
    s.inputX = 0; s.inputY = 0
    s.pickupCooldown = 0
    s.controlGrace = 0
  }
  for (const g of w.goalies) {
    const geom = GOALS[g.side]
    g.x = geom.lineX - geom.dir * GOALIE.standoff
    g.y = geom.cy
    g.vx = 0; g.vy = 0
    g.px = g.x; g.py = g.y
    g.aimY = geom.cy
    g.reactTimer = 0
    g.wasIncoming = false
  }
  const p = w.puck
  p.x = L / 2; p.y = W / 2; p.vx = 0; p.vy = 0
  p.px = p.x; p.py = p.y
  p.carrierId = null
  p.lastTouchId = null
  p.lastTouchSide = null
}

export function createWorld(cfg: WorldConfig = {}): World {
  const teamSize = cfg.teamSize ?? MATCH.teamSize
  const duration = cfg.duration ?? MATCH.duration
  const hasGoalies = cfg.goalies ?? true
  const skaters: Skater[] = []
  for (const side of [0, 1] as Side[]) {
    for (let i = 0; i < teamSize; i++) {
      const kind = cfg.kinds?.[side]?.[i] ?? DEFAULT_KINDS[i % DEFAULT_KINDS.length]
      const k = SKATER_KINDS[kind]
      skaters.push({
        id: `${side === 0 ? "L" : "V"}${i + 1}`,
        side, kind,
        name: cfg.names?.[side]?.[i] ?? `Jugador ${i + 1}`,
        isCaptain: i === 0,
        x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0,
        radius: k.radius, mass: k.mass, maxSpeed: k.maxSpeed, accel: k.accel,
        heading: 0, stickAngle: 0,
        inputX: 0, inputY: 0,
        pickupCooldown: 0, controlGrace: 0,
      })
    }
  }
  const goalies: Goalie[] = hasGoalies
    ? ([0, 1] as Side[]).map((side) => ({ side, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, radius: GOALIE.radius, aimY: 0, reactTimer: 0, wasIncoming: false }))
    : []
  const puck: Puck = {
    x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0,
    radius: PUCK.radius, carrierId: null, lastTouchId: null, lastTouchSide: null,
  }
  const w: World = {
    surface: cfg.surface ?? "madera",
    time: 0, steps: 0, clock: duration, phase: "play", phaseTimer: 0,
    score: [0, 0], skaters, goalies, puck, events: [],
    hasGoalies, teamSize, duration,
    bench: [], fouls: [0, 0],
  }
  placeKickoff(w)
  return w
}

/** Devuelve todo al saque inicial (mantiene marcador y reloj). */
export function kickoff(w: World) {
  placeKickoff(w)
  w.phase = "play"
  w.phaseTimer = 0
  emit(w, { type: "kickoff" })
}

// ---------- entrada del jugador / IA ----------
export function setInput(w: World, id: string, x: number, y: number) {
  const s = findSkater(w, id)
  if (!s) return
  const m = Math.hypot(x, y)
  if (m > 1) { x /= m; y /= m }
  s.inputX = x
  s.inputY = y
}

function releaseCarrier(w: World, carrier: Skater, cooldown: number) {
  w.puck.carrierId = null
  carrier.pickupCooldown = cooldown
}

/** Patea el puck (pase o tiro). Solo el portador puede. Ángulo en rad, velocidad en m/s. */
export function kick(w: World, id: string, angle: number, speed: number): boolean {
  const s = findSkater(w, id)
  const p = w.puck
  if (!s || p.carrierId !== id || w.phase !== "play") return false
  const sp = clamp(speed, 0, SKATER.kickMaxSpeed)
  const cx = Math.cos(angle)
  const cy = Math.sin(angle)
  const off = s.radius + p.radius + SKATER.stickReach
  p.x = s.x + cx * off
  p.y = s.y + cy * off
  const bc = boardContact(p.x, p.y, p.radius)
  if (bc) { p.x += bc.nx * bc.pen; p.y += bc.ny * bc.pen }
  p.vx = cx * sp + s.vx * SKATER.kickInherit
  p.vy = cy * sp + s.vy * SKATER.kickInherit
  s.stickAngle = angle
  p.carrierId = null
  p.lastTouchId = s.id
  p.lastTouchSide = s.side
  s.pickupCooldown = SKATER.kickCooldown
  emit(w, { type: "kick", id: s.id, speed: sp })
  return true
}

// ---------- paso de simulación ----------
export function stepWorld(w: World, dt: number = FIXED_DT): void {
  for (const s of w.skaters) { s.px = s.x; s.py = s.y }
  for (const g of w.goalies) { g.px = g.x; g.py = g.y }
  w.puck.px = w.puck.x
  w.puck.py = w.puck.y
  w.steps++

  if (w.phase === "ended") return
  if (w.phase === "goal") {
    w.phaseTimer -= dt
    if (w.phaseTimer <= 0) {
      if (w.clock <= 0) { w.phase = "ended"; emit(w, { type: "end" }) }
      else kickoff(w)
    }
    return
  }

  w.time += dt
  w.clock -= dt

  updateBench(w, dt)
  updateSkaters(w, dt)
  updateGoalies(w, dt)
  collideBodies(w)
  applyFouls(w)
  resolveBodiesVsStatics(w)
  updatePuck(w, dt)

  if (w.phase === "play" && w.clock <= 0) {
    w.clock = 0
    w.phase = "ended"
    emit(w, { type: "end" })
  }
}

// ---------- reglas: faltas y tarjeta azul ----------
const _fouls: Array<{ off: Skater; vic: Skater; impact: number }> = []

function applyFouls(w: World) {
  if (_fouls.length === 0) return
  const list = _fouls.splice(0, _fouls.length)
  for (const f of list) {
    const off = f.off
    if (!w.skaters.includes(off)) continue // ya expulsado en este mismo paso
    w.fouls[off.side]++
    const benched = w.bench.filter((b) => b.side === off.side).length
    const onIce = w.skaters.filter((s) => s.side === off.side).length
    emit(w, { type: "foul", id: off.id, victim: f.vic.id, side: off.side, impact: f.impact })
    if (benched >= RULES.maxBenched || onIce <= RULES.minSkaters) continue
    if (w.puck.carrierId === off.id) releaseCarrier(w, off, SKATER.lostCooldown)
    w.skaters.splice(w.skaters.indexOf(off), 1)
    off.vx = 0; off.vy = 0; off.inputX = 0; off.inputY = 0
    w.bench.push({ skater: off, side: off.side, timer: RULES.penaltySeconds })
  }
}

function updateBench(w: World, dt: number) {
  if (w.bench.length === 0) return
  for (let i = w.bench.length - 1; i >= 0; i--) {
    const b = w.bench[i]
    b.timer -= dt
    if (b.timer > 0) continue
    const s = b.skater
    s.x = b.side === 0 ? 6 : RINK.length - 6
    s.y = RINK.width / 2
    s.px = s.x; s.py = s.y
    s.vx = 0; s.vy = 0
    s.pickupCooldown = 0
    s.controlGrace = 0
    w.skaters.push(s)
    w.bench.splice(i, 1)
    emit(w, { type: "return", id: s.id })
  }
}

// ---------- patinadores ----------
const _contacts: Contact[] = []

function updateSkaters(w: World, dt: number) {
  const surf = SURFACES[w.surface]
  const carrierId = w.puck.carrierId
  for (const s of w.skaters) {
    if (s.pickupCooldown > 0) s.pickupCooldown = Math.max(0, s.pickupCooldown - dt)
    if (s.controlGrace > 0) s.controlGrace = Math.max(0, s.controlGrace - dt)

    const carrying = carrierId === s.id
    const maxV = s.maxSpeed * (carrying ? SKATER.carrySpeedMul : 1)
    const inMag = Math.min(1, Math.hypot(s.inputX, s.inputY))
    const speed = Math.hypot(s.vx, s.vy)

    if (inMag > 0.01) {
      const tx = (s.inputX / Math.max(inMag, 1e-9)) * inMag * maxV
      const ty = (s.inputY / Math.max(inMag, 1e-9)) * inMag * maxV
      const dx = tx - s.vx
      const dy = ty - s.vy
      const d = Math.hypot(dx, dy)
      const maxDelta = s.accel * surf.accelMul * dt
      if (d <= maxDelta) { s.vx = tx; s.vy = ty }
      else { s.vx += (dx / d) * maxDelta; s.vy += (dy / d) * maxDelta }
    } else if (speed > 0) {
      // deslizamiento: frena poco (patines)
      const ns = Math.max(0, speed - surf.skaterGlide * dt)
      const k = ns / speed
      s.vx *= k; s.vy *= k
    }
    // si va más rápido que su máximo (tras un golpe), decae solo
    const sp2 = Math.hypot(s.vx, s.vy)
    if (sp2 > maxV * 1.02 && inMag > 0.01) {
      const ns = Math.max(maxV, sp2 - surf.skaterGlide * 2 * dt)
      const k = ns / sp2
      s.vx *= k; s.vy *= k
    }

    s.x += s.vx * dt
    s.y += s.vy * dt

    // orientación del cuerpo
    let targetH = s.heading
    if (inMag > 0.1) targetH = Math.atan2(s.inputY, s.inputX)
    else if (sp2 > 0.8) targetH = Math.atan2(s.vy, s.vx)
    s.heading = rotateToward(s.heading, targetH, SKATER.headingTurnRate * dt)

    // el palo sigue la dirección de movimiento (o el cuerpo si casi está parado)
    const stickTarget = sp2 > 1.0 ? Math.atan2(s.vy, s.vx) : s.heading
    s.stickAngle = rotateToward(s.stickAngle, stickTarget, SKATER.stickTurnRate * dt)
  }
}

// ---------- porteros (IA básica; se afina en la ronda de IA) ----------
function updateGoalies(w: World, dt: number) {
  const p = w.puck
  const kAim = 1 - Math.exp(-dt / GOALIE.reaction)
  for (const g of w.goalies) {
    const geom = GOALS[g.side]
    const limit = GOALIE.range
    // lo que el portero "ve": por defecto cierra el ángulo siguiendo al puck a medias...
    let seenY = geom.cy + (p.y - geom.cy) * 0.6
    // ...y cuando sale un disparo tarda un instante en reaccionar
    const incoming = p.vx * geom.dir > GOALIE.shotSpeed && !p.carrierId
    if (incoming && !g.wasIncoming) g.reactTimer = GOALIE.reactionDelay
    g.wasIncoming = incoming
    if (g.reactTimer > 0) g.reactTimer -= dt
    if (incoming && g.reactTimer <= 0) {
      const t = clamp((g.x - p.x) / p.vx, 0, 1.2)
      seenY = p.y + p.vy * t
    }
    // retardo de reacción: su puntería sigue a lo que ve con inercia
    g.aimY += (seenY - g.aimY) * kAim
    const targetY = clamp(g.aimY, geom.cy - limit, geom.cy + limit)
    const desired = clamp((targetY - g.y) * 9, -GOALIE.maxSpeed, GOALIE.maxSpeed)
    const dv = desired - g.vy
    const maxDelta = GOALIE.accel * dt
    g.vy += clamp(dv, -maxDelta, maxDelta)
    g.y += g.vy * dt
    g.y = clamp(g.y, geom.cy - limit, geom.cy + limit)
    g.vx = 0
  }
}

// ---------- colisiones entre cuerpos ----------
function collideBodies(w: World) {
  const sk = w.skaters
  const E = SKATER.collisionRestitution
  for (let i = 0; i < sk.length; i++) {
    for (let j = i + 1; j < sk.length; j++) {
      const a = sk[i]
      const b = sk[j]
      const min = a.radius + b.radius
      let dx = b.x - a.x
      let dy = b.y - a.y
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min) continue
      let d = Math.sqrt(d2)
      if (d < 1e-9) { dx = 1; dy = 0; d = 1e-9 }
      const nx = dx / d
      const ny = dy / d
      // cierre de cada uno hacia el otro ANTES del impulso (para saber quién es el agresor)
      const closeA = Math.max(0, a.vx * nx + a.vy * ny)
      const closeB = Math.max(0, -(b.vx * nx + b.vy * ny))
      const inv = 1 / a.mass + 1 / b.mass
      const pen = min - d
      a.x -= nx * pen * (1 / a.mass) / inv
      a.y -= ny * pen * (1 / a.mass) / inv
      b.x += nx * pen * (1 / b.mass) / inv
      b.y += ny * pen * (1 / b.mass) / inv
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (vn < 0) {
        const j2 = (-(1 + E) * vn) / inv
        a.vx -= (j2 * nx) / a.mass; a.vy -= (j2 * ny) / a.mass
        b.vx += (j2 * nx) / b.mass; b.vy += (j2 * ny) / b.mass
        const impact = -vn
        if (impact > 2) emit(w, { type: "hit", a: a.id, b: b.id, impact })
        if (a.side !== b.side && impact >= RULES.foulImpact) {
          const total = closeA + closeB
          if (total > 1e-6 && Math.max(closeA, closeB) / total >= RULES.aggressorShare) {
            const aggA = closeA >= closeB
            _fouls.push({ off: aggA ? a : b, vic: aggA ? b : a, impact })
          }
        }
        if (impact >= SKATER.hitSpillSpeed && a.side !== b.side) {
          const cid = w.puck.carrierId
          if (cid === a.id || cid === b.id) {
            const carrier = cid === a.id ? a : b
            const sgn = carrier === b ? 1 : -1
            const p = w.puck
            releaseCarrier(w, carrier, SKATER.lostCooldown)
            p.vx = carrier.vx * 0.6 + nx * sgn * 3.5
            p.vy = carrier.vy * 0.6 + ny * sgn * 3.5
            emit(w, { type: "spill", id: carrier.id, impact })
          }
        }
      }
    }
  }
  // porteros: inmóviles frente a los patinadores
  for (const g of w.goalies) {
    for (const s of sk) {
      const min = g.radius + s.radius
      let dx = s.x - g.x
      let dy = s.y - g.y
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min) continue
      let d = Math.sqrt(d2)
      if (d < 1e-9) { dx = 1; dy = 0; d = 1e-9 }
      const nx = dx / d
      const ny = dy / d
      s.x += nx * (min - d)
      s.y += ny * (min - d)
      const vn = s.vx * nx + s.vy * ny
      if (vn < 0) { s.vx -= (1 + E) * vn * nx; s.vy -= (1 + E) * vn * ny }
    }
  }
}

function resolveBodiesVsStatics(w: World) {
  const E = SKATER.boardRestitution
  for (const s of w.skaters) {
    for (let pass = 0; pass < 3; pass++) {
      collectContacts(s.x, s.y, s.radius, true, _contacts)
      if (_contacts.length === 0) break
      for (const c of _contacts) {
        s.x += c.nx * c.pen
        s.y += c.ny * c.pen
        const vn = s.vx * c.nx + s.vy * c.ny
        if (vn < 0) { s.vx -= (1 + E) * vn * c.nx; s.vy -= (1 + E) * vn * c.ny }
      }
    }
  }
  for (const g of w.goalies) {
    collectContacts(g.x, g.y, g.radius, true, _contacts)
    for (const c of _contacts) { g.x += c.nx * c.pen; g.y += c.ny * c.pen }
  }
}

// ---------- posesión ----------
function giveTo(w: World, s: Skater) {
  const p = w.puck
  p.carrierId = s.id
  p.lastTouchId = s.id
  p.lastTouchSide = s.side
  s.controlGrace = SKATER.controlGrace
  s.stickAngle = Math.atan2(p.y - s.y, p.x - s.x)
  p.vx = s.vx
  p.vy = s.vy
}

function placeCarried(w: World, s: Skater) {
  const p = w.puck
  const off = s.radius + p.radius + SKATER.stickReach
  p.x = s.x + Math.cos(s.stickAngle) * off
  p.y = s.y + Math.sin(s.stickAngle) * off
  const bc = boardContact(p.x, p.y, p.radius)
  if (bc) { p.x += bc.nx * bc.pen; p.y += bc.ny * bc.pen }
  p.vx = s.vx
  p.vy = s.vy
}

// ---------- puck ----------
function scoreGoal(w: World, defendingSide: Side) {
  const scorer: Side = defendingSide === 0 ? 1 : 0
  w.score[scorer]++
  w.phase = "goal"
  w.phaseTimer = MATCH.goalPause
  w.puck.carrierId = null
  emit(w, { type: "goal", side: scorer })
}

/** ¿El segmento (ox,oy)->(nx,ny) del centro del puck cruzó una línea de gol dentro de los postes? */
function checkGoalCrossing(ox: number, oy: number, nx: number, ny: number): Side | null {
  for (const g of GOALS) {
    const before = (ox - g.lineX) * g.dir
    const after = (nx - g.lineX) * g.dir
    if (before <= 0 && after > 0) {
      const t = (g.lineX - ox) / (nx - ox)
      const y = oy + (ny - oy) * t
      if (y > g.yMin && y < g.yMax) return g.side
    }
  }
  return null
}

function updatePuck(w: World, dt: number) {
  const p = w.puck

  // 1) puck llevado
  if (p.carrierId) {
    const carrier = findSkater(w, p.carrierId)
    if (!carrier) { p.carrierId = null }
    else {
      placeCarried(w, carrier)
      if (carrier.controlGrace <= 0) {
        for (const o of w.skaters) {
          if (o.side === carrier.side || o.pickupCooldown > 0) continue
          const d = Math.hypot(p.x - o.x, p.y - o.y)
          if (d <= o.radius + p.radius + SKATER.stealReach) {
            const prev = carrier
            releaseCarrier(w, prev, SKATER.lostCooldown)
            giveTo(w, o)
            placeCarried(w, o)
            emit(w, { type: "steal", id: o.id, from: prev.id })
            return
          }
        }
      }
      return
    }
  }

  // 2) puck suelto: fricción
  const surf = SURFACES[w.surface]
  let speed = Math.hypot(p.vx, p.vy)
  if (speed > 0) {
    const ns = Math.max(0, speed - (surf.puckDecel + surf.puckDrag * speed) * dt)
    const k = ns / speed
    p.vx *= k; p.vy *= k
    speed = ns
  }
  if (speed > PUCK.maxSpeed) {
    const k = PUCK.maxSpeed / speed
    p.vx *= k; p.vy *= k
    speed = PUCK.maxSpeed
  }

  // 3) sub-pasos: el puck nunca avanza más de maxSubstep por iteración => no atraviesa postes ni líneas
  const n = Math.max(1, Math.ceil((speed * dt) / PUCK.maxSubstep))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    const ox = p.x
    const oy = p.y
    p.x += p.vx * h
    p.y += p.vy * h

    const scored = checkGoalCrossing(ox, oy, p.x, p.y)
    if (scored !== null) { scoreGoal(w, scored); return }

    // estáticos: vallas, postes, red
    for (let pass = 0; pass < 3; pass++) {
      collectContacts(p.x, p.y, p.radius, false, _contacts)
      if (_contacts.length === 0) break
      for (const c of _contacts) {
        p.x += c.nx * c.pen
        p.y += c.ny * c.pen
        const vn = p.vx * c.nx + p.vy * c.ny
        if (vn < 0) {
          const e = c.kind === "board" ? PUCK.boardRestitution : PUCK.postRestitution
          p.vx -= (1 + e) * vn * c.nx
          p.vy -= (1 + e) * vn * c.ny
          if (-vn > 2) emit(w, { type: c.kind === "board" ? "board" : "post", speed: -vn })
        }
      }
    }

    // porteros
    for (const g of w.goalies) {
      const min = g.radius + p.radius
      const dx = p.x - g.x
      const dy = p.y - g.y
      const d = Math.hypot(dx, dy)
      if (d >= min) continue
      const nx = d > 1e-9 ? dx / d : 1
      const ny = d > 1e-9 ? dy / d : 0
      p.x = g.x + nx * (min + 1e-4)
      p.y = g.y + ny * (min + 1e-4)
      const rvx = p.vx - g.vx
      const rvy = p.vy - g.vy
      const vn = rvx * nx + rvy * ny
      if (vn < 0) {
        const e = PUCK.goalieRestitution
        p.vx = g.vx + rvx - (1 + e) * vn * nx
        p.vy = g.vy + rvy - (1 + e) * vn * ny
        if (-vn > 3) emit(w, { type: "save", speed: -vn })
      }
    }

    // patinadores: recoger o rebotar
    let picked = false
    for (const s of w.skaters) {
      const dx = p.x - s.x
      const dy = p.y - s.y
      const d = Math.hypot(dx, dy)
      const reach = s.radius + p.radius + SKATER.pickupReach
      if (d > reach) continue
      const rvx = p.vx - s.vx
      const rvy = p.vy - s.vy
      const rel = Math.hypot(rvx, rvy)
      if (s.pickupCooldown <= 0 && rel <= SKATER.trapMaxRelSpeed) {
        giveTo(w, s)
        emit(w, { type: "pickup", id: s.id })
        placeCarried(w, s)
        picked = true
        break
      }
      const min = s.radius + p.radius
      if (d < min) {
        const nx = d > 1e-9 ? dx / d : 1
        const ny = d > 1e-9 ? dy / d : 0
        p.x = s.x + nx * (min + 1e-4)
        p.y = s.y + ny * (min + 1e-4)
        const vn = rvx * nx + rvy * ny
        if (vn < 0) {
          const e = PUCK.skaterRestitution
          p.vx = s.vx + rvx - (1 + e) * vn * nx
          p.vy = s.vy + rvy - (1 + e) * vn * ny
          p.lastTouchId = s.id
          p.lastTouchSide = s.side
          if (-vn > 3) emit(w, { type: "deflect", id: s.id, speed: -vn })
        }
      }
    }
    if (picked) return
  }
}
