import { CURVE, FIXED_DT, GOAL, GOALIE, MATCH, PUCK, PUCK_KINDS, RINK, RULES, SKATER, SKATER_KINDS, STAMINA, SUPER_SHOT_COST, SURFACES } from "./constants"
import { boardContact, collectContacts, GOALS, type Contact } from "./geometry"
import type { ComboState, GameEvent, Goalie, Puck, Side, Skater, SkaterKind, SubEntry, World, WorldConfig } from "./types"

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
    g.lastShotAngle = null
  }
  const p = w.puck
  p.x = L / 2; p.y = W / 2; p.vx = 0; p.vy = 0
  p.px = p.x; p.py = p.y
  p.carrierId = null
  p.lastTouchId = null
  p.lastTouchSide = null
  p.comboShot = false
  p.spin = 0
  w.attackCombo = null
  w.defCombo = null
  w.penaltyActive = false
  if (w.nextKickoffSide !== null) {
    // Al que le hicieron el gol, sale con la pelota — no es un saque neutral.
    const side = w.nextKickoffSide
    const candidate = w.skaters.find((s) => s.side === side && s.isCaptain) ?? w.skaters.find((s) => s.side === side)
    if (candidate) giveTo(w, candidate)
    w.nextKickoffSide = null
  }
}

export function awardPenalty(w: World, side: Side) {
  const geom = GOALS[side === 0 ? 1 : 0] // el arco RIVAL: ahí tira
  const own = w.skaters.filter((s) => s.side === side)
  const shooter = own.find((s) => s.isCaptain) ?? own[0]
  if (!shooter) return
  const sx = geom.lineX - geom.dir * RULES.penaltySpot
  const heading = geom.dir > 0 ? 0 : Math.PI
  for (const s of w.skaters) {
    if (s === shooter) {
      s.x = sx; s.y = geom.cy
    } else {
      // el resto, de los dos equipos, lejos del área — esto es mano a mano
      s.x = RINK.length / 2 + (s.side === 0 ? -6 : 6)
      s.y = s.side === 0 ? 3 : RINK.width - 3
    }
    s.vx = 0; s.vy = 0; s.px = s.x; s.py = s.y
    s.inputX = 0; s.inputY = 0
    s.pickupCooldown = 0; s.controlGrace = 0
  }
  shooter.heading = heading
  shooter.stickAngle = heading
  shooter.controlGrace = 0.5
  shooter.stamina = 100 // el penal siempre es con el tanque lleno — nunca le "gana" el cansancio
  // del partido, ni entre intentos de una misma tanda: así siempre puede ser un supertiro de verdad.
  for (const g of w.goalies) {
    const gg = GOALS[g.side]
    // En un penal de verdad el arquero tiene que quedarse PARADO EN LA LÍNEA hasta que se patea (no
    // puede adelantarse a cerrar el ángulo, como sí hace en el juego normal). El cuerpo se para con
    // el DORSO tocando la línea (no el centro exacto: eso lo hacía solaparse con el propio arco y la
    // física lo empujaba sola, otro bug encontrado en el camino) — mismo standoff que usa
    // `updateGoalies` cuando `penaltyActive`, para que no haya un salto en el primer paso.
    g.x = gg.lineX - gg.dir * GOALIE.radius
    g.y = gg.cy
    g.vx = 0; g.vy = 0; g.px = g.x; g.py = g.y
    g.aimY = gg.cy; g.reactTimer = 0; g.wasIncoming = false; g.lastShotAngle = null
  }
  const p = w.puck
  p.x = sx; p.y = geom.cy; p.vx = 0; p.vy = 0; p.px = p.x; p.py = p.y
  p.carrierId = shooter.id
  p.lastTouchId = null; p.lastTouchSide = null
  p.comboShot = false; p.spin = 0
  w.attackCombo = null; w.defCombo = null
  emit(w, { type: "penalty", side, shooterId: shooter.id })
  w.penaltyActive = true
}

export function createWorld(cfg: WorldConfig = {}): World {
  const teamSize = cfg.teamSize ?? MATCH.teamSize
  // La plantilla total (en pista + suplentes) nunca es menor que teamSize; por defecto 6 (4 + 2).
  const rosterSize = Math.max(teamSize, cfg.rosterSize ?? MATCH.rosterSize)
  const duration = cfg.duration ?? MATCH.duration
  const goaliesBySide: [boolean, boolean] = Array.isArray(cfg.goalies)
    ? cfg.goalies
    : [cfg.goalies ?? true, cfg.goalies ?? true]
  const hasGoalies = goaliesBySide[0] || goaliesBySide[1]
  const skaters: Skater[] = []
  const restBench: SubEntry[] = []
  for (const side of [0, 1] as Side[]) {
    for (let i = 0; i < rosterSize; i++) {
      const kind = cfg.kinds?.[side]?.[i] ?? DEFAULT_KINDS[i % DEFAULT_KINDS.length]
      const k = SKATER_KINDS[kind]
      const s: Skater = {
        id: `${side === 0 ? "L" : "V"}${i + 1}`,
        side, kind,
        name: cfg.names?.[side]?.[i] ?? `Jugador ${i + 1}`,
        isCaptain: i === 0,
        x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0,
        radius: k.radius, mass: k.mass, maxSpeed: k.maxSpeed, accel: k.accel,
        heading: 0, stickAngle: 0,
        inputX: 0, inputY: 0,
        pickupCooldown: 0, controlGrace: 0,
        stamina: STAMINA.max,
      }
      if (i < teamSize) skaters.push(s)
      else {
        // Suplentes: parqueados fuera de la pista (un poco separados de la banca de tarjeta azul).
        s.x = side === 0 ? 6 : RINK.length - 6
        s.y = RINK.width / 2 + 2.4 + (restBench.filter((b) => b.side === side).length) * 1.1
        s.px = s.x; s.py = s.y
        restBench.push({ skater: s, side })
      }
    }
  }
  const goalies: Goalie[] = ([0, 1] as Side[])
    .filter((side) => goaliesBySide[side])
    .map((side) => ({ side, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, radius: GOALIE.radius, aimY: 0, reactTimer: 0, wasIncoming: false, lastShotAngle: null }))
  const puck: Puck = {
    x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0,
    radius: PUCK.radius, carrierId: null, lastTouchId: null, lastTouchSide: null, comboShot: false, spin: 0,
  }
  const w: World = {
    surface: cfg.surface ?? "madera",
    puckKind: cfg.puckKind ?? "normal",
    time: 0, steps: 0, clock: duration, phase: "play", phaseTimer: 0,
    score: [0, 0], skaters, goalies, puck, events: [],
    hasGoalies, teamSize, duration,
    bench: [], fouls: [0, 0],
    restBench, subsUsed: [0, 0],
    attackCombo: null, defCombo: null,
    suddenDeath: false,
    nextKickoffSide: null,
    penaltyActive: false,
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
  let sp = clamp(speed, 0, SKATER.kickMaxSpeed * PUCK_KINDS[w.puckKind].maxSpeedMul)
  let superShot = false

  // Combo de ataque armado (3 toques) + este tiro va con fuerza real: es el golazo, no gasta energía.
  const comboGoal = w.attackCombo?.side === s.side && w.attackCombo.touches >= 3 && sp >= STAMINA.superShotMinSpeed * 0.7
  if (comboGoal) {
    p.comboShot = true
    w.attackCombo = null
  } else if (sp >= STAMINA.superShotMinSpeed) {
    // Super tiro en solitario: cuesta la mitad del tanque. Sin energía, se limita (no hay super).
    if (s.stamina >= SUPER_SHOT_COST) {
      s.stamina = clamp(s.stamina - SUPER_SHOT_COST, 0, STAMINA.max)
      superShot = true
    } else {
      sp = Math.min(sp, STAMINA.superShotCappedSpeed)
    }
  }

  const cx = Math.cos(angle)
  const cy = Math.sin(angle)
  const off = s.radius + p.radius + SKATER.stickReach
  // La pelota NO sale del centro del cuerpo: en hockey de verdad se juega a un costado (el palo gira
  // para pegarle, no empuja de frente — investigado antes de tocar esto). Mismo lado que ya usa el
  // seguimiento visual del palo después del golpe (misma cuenta), para que las dos cosas concuerden.
  const side = Math.sin(s.heading - angle) >= 0 ? 1 : -1
  const perpX = -cy * side * SKATER.shotSideOffset
  const perpY = cx * side * SKATER.shotSideOffset
  p.x = s.x + cx * off + perpX
  p.y = s.y + cy * off + perpY
  const bc = boardContact(p.x, p.y, p.radius)
  if (bc) { p.x += bc.nx * bc.pen; p.y += bc.ny * bc.pen }
  p.vx = cx * sp + s.vx * SKATER.kickInherit
  p.vy = cy * sp + s.vy * SKATER.kickInherit
  // Efecto: un tiro (no un pase, no el golazo de combo) tomado moviéndose de costado sale con
  // curvatura, como un latigazo real. El golazo de combo sale siempre recto: ya costó armarlo.
  if (!comboGoal && sp >= CURVE.minShotSpeed) {
    const lateral = s.vx * -cy + s.vy * cx // velocidad del patinador perpendicular al tiro
    p.spin = clamp(lateral * CURVE.spinPerLateralSpeed, -CURVE.maxSpin, CURVE.maxSpin)
  } else {
    p.spin = 0
  }
  s.stickAngle = angle
  p.carrierId = null
  p.lastTouchId = s.id
  p.lastTouchSide = s.side
  s.pickupCooldown = SKATER.kickCooldown
  emit(w, { type: "kick", id: s.id, speed: sp, superShot })
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

  if (w.phase === "timeOn") {
    w.time += dt
    w.phaseTimer -= dt
    simulateTick(w, dt)
    // updatePuck puede haber marcado gol (w.phase pasa a "goal"): no lo pisamos.
    if (w.phase === "timeOn" && w.phaseTimer <= 0) {
      w.phase = "ended"
      emit(w, { type: "end" })
    }
    return
  }

  w.time += dt
  w.clock -= dt
  simulateTick(w, dt)

  if (w.phase === "play" && w.clock <= 0) {
    w.clock = 0
    if (w.puck.carrierId === null) {
      // El puck está suelto o en el aire: se concede un breve tiempo de gracia para que la
      // jugada en curso pueda terminar (p. ej. un tiro ya lanzado) en vez de cortarla en seco.
      w.phase = "timeOn"
      w.phaseTimer = MATCH.timeOnGrace
    } else {
      // Alguien lo lleva pegado al palo: no hay jugada "en el aire" que salvar, corta ahí.
      w.phase = "ended"
      emit(w, { type: "end" })
    }
  }
}

/** Un paso de física/reglas, compartido entre la fase normal de juego y el tiempo de gracia. */
function simulateTick(w: World, dt: number) {
  updateBench(w, dt)
  updateRest(w, dt)
  updateSkaters(w, dt)
  updateGoalies(w, dt)
  collideBodies(w)
  applyFouls(w)
  resolveBodiesVsStatics(w)
  updatePuck(w, dt)
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
    if (w.fouls[off.side] % RULES.foulsPerPenalty === 0) {
      awardPenalty(w, off.side === 0 ? 1 : 0)
    }
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

// ---------- suplentes por cansancio (banca; NO es la tarjeta azul) ----------
function updateRest(w: World, dt: number) {
  for (const b of w.restBench) b.skater.stamina = clamp(b.skater.stamina + STAMINA.restRegenPerSecond * dt, 0, STAMINA.max)
}

/**
 * Intenta el cambio por cansancio de `side`: saca al más cansado que esté por debajo del umbral
 * (nunca al que lleva el puck, y nunca al que el humano tiene agarrado en ese instante — si no, el
 * control saltaba de abajo de los dedos sin avisar) y mete al primer suplente fresco. Tope:
 * RULES.maxFatigueSubs por equipo por partido. Devuelve true si el cambio se hizo.
 */
export function trySub(w: World, side: Side, excludeId: string | null = null): boolean {
  if (w.subsUsed[side] >= RULES.maxFatigueSubs) return false
  const restIdx = w.restBench.findIndex((b) => b.side === side)
  if (restIdx < 0) return false
  let tired: Skater | null = null
  for (const s of w.skaters) {
    if (s.side !== side || s.id === w.puck.carrierId || s.id === excludeId) continue
    if (s.stamina < STAMINA.subThresholdPct && (!tired || s.stamina < tired.stamina)) tired = s
  }
  if (!tired) return false
  const fresh = w.restBench[restIdx].skater
  fresh.x = tired.x; fresh.y = tired.y; fresh.px = fresh.x; fresh.py = fresh.y
  fresh.vx = 0; fresh.vy = 0
  fresh.heading = tired.heading; fresh.stickAngle = tired.heading
  fresh.pickupCooldown = 0; fresh.controlGrace = 0
  fresh.inputX = 0; fresh.inputY = 0
  const idx = w.skaters.indexOf(tired)
  w.skaters[idx] = fresh
  tired.x = side === 0 ? 6 : RINK.length - 6
  tired.y = RINK.width / 2 + 2.4
  tired.px = tired.x; tired.py = tired.y
  tired.vx = 0; tired.vy = 0; tired.inputX = 0; tired.inputY = 0
  w.restBench[restIdx] = { skater: tired, side }
  w.subsUsed[side]++
  emit(w, { type: "sub", side, outId: tired.id, inId: fresh.id })
  return true
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

    // Energía: solo se gasta mientras todavía está ganando velocidad (acelerando de verdad).
    // Patinar ya a velocidad de crucero, o deslizar sin input, no cansa; incluso recupera un poco.
    const accelerating = inMag > 0.3 && speed < maxV * 0.97
    if (accelerating) s.stamina = clamp(s.stamina - STAMINA.drainPerSecond * dt, 0, STAMINA.max)
    else s.stamina = clamp(s.stamina + STAMINA.iceRegenPerSecond * dt, 0, STAMINA.max)

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

    // Profundidad: por defecto vive a `standoff` de la línea, pero sale a cerrar el ángulo
    // (como un portero de verdad) cuando el atacante se acerca, hasta `advanceMax` de más.
    // EXCEPTO en un penal: ahí tiene que quedarse parado en la línea, como en el reglamento real
    // (si no, esto mismo lo saca de la línea al toque siguiente, aunque `awardPenalty` ya lo haya
    // puesto ahí — es la causa real de por qué los penales no entraban nunca).
    const distToLine = Math.abs(geom.lineX - p.x)
    const closeness = clamp(1 - distToLine / GOALIE.advanceRange, 0, 1)
    const targetStandoff = w.penaltyActive ? GOALIE.radius : GOALIE.standoff + closeness * GOALIE.advanceMax
    const targetX = geom.lineX - geom.dir * targetStandoff
    const maxAdvStep = GOALIE.advanceSpeed * dt
    g.x += clamp(targetX - g.x, -maxAdvStep, maxAdvStep)

    // Por defecto NO sigue solo la Y del puck: se para sobre la línea imaginaria puck→centro
    // de la portería evaluada en su propia X. Es la técnica real de "tapar el ángulo": así el
    // arco se ve más chico desde donde está parado el atacante, no solo cuando tira de frente.
    const denom = geom.lineX - p.x
    let seenY = Math.abs(denom) > 1e-6 ? p.y + (geom.cy - p.y) * clamp((g.x - p.x) / denom, 0, 1) : geom.cy
    // ...y cuando sale un disparo tarda un instante en reaccionar
    const incoming = p.vx * geom.dir > GOALIE.shotSpeed && !p.carrierId
    if (incoming && !g.wasIncoming) {
      g.reactTimer = GOALIE.reactionDelay
    } else if (incoming && g.wasIncoming && g.lastShotAngle !== null) {
      // Desvío de golpe (poste, patinador) con el arquero YA alerta: no vuelve a reaccionar desde
      // cero (eso sería el mismo retardo largo de un tiro nuevo), pero sí tarda un instante corto
      // en volver a girar hacia la nueva trayectoria — antes esto no se detectaba, seguía apuntando
      // adonde iba la bocha ANTES del desvío y por eso se colaba sin que el arquero llegara a girar.
      const newAngle = Math.atan2(p.vy, p.vx)
      if (Math.abs(angleDiff(g.lastShotAngle, newAngle)) > GOALIE.deflectionAngle) {
        g.reactTimer = Math.max(g.reactTimer, GOALIE.deflectionDelay)
      }
    }
    g.wasIncoming = incoming
    g.lastShotAngle = incoming ? Math.atan2(p.vy, p.vx) : null
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
      collectContacts(s.x, s.y, s.radius, true, _contacts, true)
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
/**
 * Actualiza las cadenas de combo cuando cambia quién controla el puck.
 * Mismo equipo que el último toque = pase completado (suma ataque, corta la defensa rival armada).
 * Equipo distinto = robo/intercepción (corta el ataque rival, suma defensa de quien la recupera).
 */
function trackTouchChain(w: World, newOwner: Skater, prevSide: Side | null) {
  if (prevSide === null) return // saque inicial: no hay cadena previa
  if (prevSide === newOwner.side) {
    const c = w.attackCombo
    const touches = c && c.side === newOwner.side ? Math.min(3, c.touches + 1) : 1
    w.attackCombo = { side: newOwner.side, touches }
    if (touches === 3) emit(w, { type: "combo", side: newOwner.side, touches, kind: "attack" })
    if (w.defCombo && w.defCombo.side !== newOwner.side) w.defCombo = null
  } else {
    w.attackCombo = null
    const c = w.defCombo
    const touches = c && c.side === newOwner.side ? Math.min(3, c.touches + 1) : 1
    w.defCombo = { side: newOwner.side, touches }
    if (touches === 3) emit(w, { type: "combo", side: newOwner.side, touches, kind: "defense" })
  }
}

function giveTo(w: World, s: Skater) {
  const p = w.puck
  trackTouchChain(w, s, p.lastTouchSide)
  p.carrierId = s.id
  p.lastTouchId = s.id
  p.lastTouchSide = s.side
  p.comboShot = false
  p.spin = 0
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
  const combo = w.puck.comboShot
  w.score[scorer]++
  w.phase = "goal"
  w.phaseTimer = MATCH.goalPause
  w.puck.carrierId = null
  w.puck.comboShot = false
  w.puck.spin = 0
  w.attackCombo = null
  w.defCombo = null
  w.nextKickoffSide = defendingSide // al que le hicieron el gol, sale con la pelota
  // Muerte súbita: ese gol ya define el partido, no sigue jugándose el resto del período.
  if (w.suddenDeath) w.clock = 0
  emit(w, { type: "goal", side: scorer, combo })
}

/**
 * Arranca (o repite) un período de muerte súbita: `seconds` de gol de oro — el primero que
 * entra termina el partido ahí mismo. Pensado para el desempate de Copa: si sigue empatado al
 * cabo del período, se puede llamar de nuevo para otro. No toca el marcador (sigue igualado).
 */
export function startSuddenDeath(w: World, seconds: number): void {
  w.suddenDeath = true
  w.clock = seconds
  w.duration = seconds
  kickoff(w)
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

/**
 * ¿El centro del puck YA está dentro de la boca de una portería (más allá de la línea,
 * dentro del ancho de los postes y de la profundidad de la red)?
 * Cubre los casos en los que el puck no "cruza" la línea en este frame porque fue
 * colocado directamente ahí (p. ej. el palo lo empuja al llevarlo, o un rebote lo deja
 * ya del otro lado de la línea).
 */
function pointInGoal(x: number, y: number): Side | null {
  for (const g of GOALS) {
    const past = (x - g.lineX) * g.dir >= 0
    // Nota: el límite trasero es GOAL.depth exacto (sin margen extra) para no invadir la
    // zona que la valla del fondo de la red ya bloquea físicamente (ver geometry.ts).
    const withinDepth = Math.abs(x - g.lineX) <= GOAL.depth
    if (past && withinDepth && y > g.yMin && y < g.yMax) return g.side
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
      const carriedGoal = pointInGoal(p.x, p.y)
      if (carriedGoal !== null) { scoreGoal(w, carriedGoal); return }
      if (carrier.controlGrace <= 0) {
        for (const o of w.skaters) {
          if (o.side === carrier.side || o.pickupCooldown > 0) continue
          const d = Math.hypot(p.x - o.x, p.y - o.y)
          if (d <= o.radius + p.radius + SKATER.stealReach) {
            // Robo con cono explícito: solo desde donde mira el portador (el cuerpo protege el
            // puck por la espalda). No es un efecto emergente de la geometría.
            const angToThief = Math.atan2(o.y - carrier.y, o.x - carrier.x)
            if (Math.abs(angleDiff(carrier.heading, angToThief)) > SKATER.stealConeHalfAngle) continue
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
  const pk = PUCK_KINDS[w.puckKind]
  let speed = Math.hypot(p.vx, p.vy)
  if (speed > 0) {
    const ns = Math.max(0, speed - (surf.puckDecel + surf.puckDrag * speed) * pk.decelMul * dt)
    const k = ns / speed
    p.vx *= k; p.vy *= k
    speed = ns
  }
  if (speed > PUCK.maxSpeed * pk.maxSpeedMul) {
    const k = (PUCK.maxSpeed * pk.maxSpeedMul) / speed
    p.vx *= k; p.vy *= k
    speed = PUCK.maxSpeed * pk.maxSpeedMul
  }
  // Efecto: curva la DIRECCIÓN del vuelo (no la velocidad), y se apaga con el tiempo — un tiro
  // largo termina enderezándose, no da una vuelta imposible.
  if (p.spin !== 0 && speed > 0) {
    const ang = Math.atan2(p.vy, p.vx) + p.spin * dt
    p.vx = Math.cos(ang) * speed
    p.vy = Math.sin(ang) * speed
    p.spin *= Math.max(0, 1 - CURVE.spinDecay * dt)
  }

  // 3) sub-pasos: el puck nunca avanza más de maxSubstep por iteración => no atraviesa postes ni líneas
  const n = Math.max(1, Math.ceil((speed * dt) / PUCK.maxSubstep))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    const ox = p.x
    const oy = p.y
    p.x += p.vx * h
    p.y += p.vy * h

    const scored = checkGoalCrossing(ox, oy, p.x, p.y) ?? pointInGoal(p.x, p.y)
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
          const e = Math.min(0.95, (c.kind === "board" ? PUCK.boardRestitution : PUCK.postRestitution) * pk.restitutionMul)
          p.vx -= (1 + e) * vn * c.nx
          p.vy -= (1 + e) * vn * c.ny
          if (-vn > 2) emit(w, { type: c.kind === "board" ? "board" : "post", speed: -vn })
        }
      }
    }

    // porteros
    for (const g of w.goalies) {
      const geom = GOALS[g.side]
      const min = g.radius + p.radius
      const dx = p.x - g.x
      const dy = p.y - g.y
      const d = Math.hypot(dx, dy)
      if (d >= min) continue
      // Golazo de combo: ya armó 3 toques y tira con fuerza — el arquero no lo frena en todo este vuelo
      // (se limpia en la próxima recogida, gol o saque, no en el primer roce: a esta velocidad el puck
      // puede tocar el radio del arquero en más de un sub-paso).
      if (p.comboShot) { continue }
      const nx = d > 1e-9 ? dx / d : 1
      const ny = d > 1e-9 ? dy / d : 0
      p.x = g.x + nx * (min + 1e-4)
      p.y = g.y + ny * (min + 1e-4)
      const rvx = p.vx - g.vx
      const rvy = p.vy - g.vy
      const vn = rvx * nx + rvy * ny
      if (vn < 0) {
        // Defensa con 3 toques armados: la próxima llegada a este arquero es atajada garantizada
        // (transmisión), no una resolución normal de física.
        const comboSave = w.defCombo?.side === g.side && w.defCombo.touches >= 3
        if (comboSave) {
          p.vx = g.vx
          p.vy = g.vy
          w.defCombo = null
          emit(w, { type: "save", speed: -vn, combo: true })
        } else {
          const e = Math.min(0.95, PUCK.goalieRestitution * pk.restitutionMul)
          p.vx = g.vx + rvx - (1 + e) * vn * nx
          p.vy = g.vy + rvy - (1 + e) * vn * ny
          // Despeje con el palo: un arquero de verdad no deja la bocha picando "a lo que caiga"
          // contra el cuerpo — la saca de encima hacia el costado (nunca al medio, que sería
          // regalarla de nuevo) y hacia afuera de su propio arco. Se suma al rebote elástico de
          // arriba, con más fuerza cuanto más fuerte llegó el tiro.
          if (-vn > 3) {
            const clearSide = g.y >= geom.cy ? 1 : -1
            const clearStrength = clamp(-vn / 14, 0.35, 1)
            p.vx += -geom.dir * GOALIE.clearSpeed * 0.6 * clearStrength
            p.vy += clearSide * GOALIE.clearSpeed * clearStrength
            emit(w, { type: "save", speed: -vn })
          }
        }
      }
    }

    // patinadores: recoger (el más cercano que pueda) o rebotar
    let bestPicker: Skater | null = null
    let bestDist = Infinity
    for (const s of w.skaters) {
      const dx = p.x - s.x
      const dy = p.y - s.y
      const d = Math.hypot(dx, dy)
      const reach = s.radius + p.radius + SKATER.pickupReach
      if (d > reach) continue
      const rvx = p.vx - s.vx
      const rvy = p.vy - s.vy
      const rel = Math.hypot(rvx, rvy)
      if (s.pickupCooldown <= 0 && rel <= SKATER.trapMaxRelSpeed && d < bestDist) {
        bestPicker = s
        bestDist = d
      }
    }
    if (bestPicker) {
      giveTo(w, bestPicker)
      emit(w, { type: "pickup", id: bestPicker.id })
      placeCarried(w, bestPicker)
      return
    }
    for (const s of w.skaters) {
      const dx = p.x - s.x
      const dy = p.y - s.y
      const d = Math.hypot(dx, dy)
      const min = s.radius + p.radius
      if (d < min) {
        const rvx = p.vx - s.vx
        const rvy = p.vy - s.vy
        const nx = d > 1e-9 ? dx / d : 1
        const ny = d > 1e-9 ? dy / d : 0
        p.x = s.x + nx * (min + 1e-4)
        p.y = s.y + ny * (min + 1e-4)
        const vn = rvx * nx + rvy * ny
        if (vn < 0) {
          const e = Math.min(0.95, PUCK.skaterRestitution * pk.restitutionMul)
          p.vx = s.vx + rvx - (1 + e) * vn * nx
          p.vy = s.vy + rvy - (1 + e) * vn * ny
          p.lastTouchId = s.id
          p.lastTouchSide = s.side
          if (-vn > 3) {
            emit(w, { type: "deflect", id: s.id, speed: -vn })
            s.pickupCooldown = Math.max(s.pickupCooldown, SKATER.deflectCooldown)
          }
        }
      }
    }
  }
}
