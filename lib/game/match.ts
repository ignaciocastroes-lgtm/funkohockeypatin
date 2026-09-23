import {
  Camera,
  FixedStepper,
  GOALS,
  TeamAI,
  assistAim,
  bestPassTarget,
  createWorld,
  drainEvents,
  findSkater,
  kick,
  passSpeedFor,
  powerFromFlick,
  selectControlled,
  setInput,
  stepWorld,
} from "../engine"
import type { ActionEvent } from "./input"
import type { SkaterKind, Side, Surface, World } from "../engine"
import { drawHud, drawScene } from "./draw"
import { Confetti, ReplayBuffer, drawFlash, replayFrameAt, replayWorld } from "./effects"
import type { Flash, GoalReplay } from "./effects"
import { TouchInput } from "./input"
import { Sfx } from "./sfx"

export type Nivel = "facil" | "normal" | "dificil"
export const NIVEL_SKILL: Record<Nivel, number> = { facil: 0.3, normal: 0.6, dificil: 0.9 }

export interface MatchTeam {
  name: string
  color: string
  kinds: SkaterKind[]
  names: string[]
}

export interface MatchOptions {
  /** [local (humano), visita (IA)] */
  teams: [MatchTeam, MatchTeam]
  /** Pista: la del equipo local (localía). */
  surface: Surface
  nivel: Nivel
  /** Segundos. */
  duration: number
  leftHanded?: boolean
  sound?: boolean
  debug?: boolean
  /** Semilla de la IA (por defecto aleatoria). */
  seed?: number
  /** Se llama una vez cuando suena el final. */
  onEnd?: (r: MatchResult) => void
  /** La pestaña se ocultó: el partido se pausó solo. */
  onAutoPause?: () => void
}

export interface MatchResult {
  score: [number, number]
  fouls: [number, number]
  steals: [number, number]
  passes: [number, number]
  shots: [number, number]
}

export interface MatchHandle {
  destroy(): void
  pause(): void
  resume(): void
  setSound(on: boolean): void
  readonly paused: boolean
  readonly ended: boolean
  readonly world: World
  readonly input: TouchInput
  /** Solo para pruebas automáticas. */
  readonly stats: { frames: number; steps: number; controlledId: string | null }
}

const FONT = "var(--font-orbitron), system-ui, -apple-system, 'Segoe UI', sans-serif"
const sideOf = (id: string): Side => (id[0] === "L" ? 0 : 1)

export function mountMatch(container: HTMLElement, o: MatchOptions): MatchHandle {
  const canvas = document.createElement("canvas")
  canvas.setAttribute("role", "img")
  canvas.setAttribute("aria-label", "Cancha de hockey sobre patines")
  canvas.style.cssText = "position:absolute;inset:0;display:block;touch-action:none;width:100%;height:100%"
  container.appendChild(canvas)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D no disponible")

  const colors: [string, string] = [o.teams[0].color, o.teams[1].color]
  const names: [string, string] = [o.teams[0].name, o.teams[1].name]
  const world = createWorld({
    surface: o.surface,
    duration: o.duration,
    kinds: [o.teams[0].kinds, o.teams[1].kinds],
    names: [o.teams[0].names, o.teams[1].names],
  })
  const ai = new TeamAI({ skill: [0.7, NIVEL_SKILL[o.nivel]], seed: o.seed ?? ((Math.random() * 1e9) | 0) })
  const stepper = new FixedStepper()
  const cam = new Camera()
  const input = new TouchInput({ width: 1, height: 1, leftHanded: o.leftHanded })
  const sfx = new Sfx()
  sfx.muted = o.sound === false
  const confetti = new Confetti()
  const replayBuf = new ReplayBuffer(2.4)
  let flash: Flash | null = null
  let goalReplay: GoalReplay | null = null
  const stats = { frames: 0, steps: 0, controlledId: null as string | null }
  const result: MatchResult = { score: [0, 0], fouls: [0, 0], steals: [0, 0], passes: [0, 0], shots: [0, 0] }

  let controlledId: string | null = selectControlled(world, 0, null)
  let cssW = 1
  let cssH = 1
  let dpr = 1
  let paused = false
  let ended = false
  let destroyed = false
  let banner: { text: string; until: number } | null = null
  let lastKick: { id: string } | null = null
  const pending: ActionEvent[] = []

  const resize = () => {
    cssW = Math.max(1, container.clientWidth)
    cssH = Math.max(1, container.clientHeight)
    dpr = Math.min(2.5, window.devicePixelRatio || 1)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    input.resize(cssW, cssH)
  }
  resize()
  window.addEventListener("resize", resize)
  window.visualViewport?.addEventListener("resize", resize)
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(resize); ro.observe(container) }

  // ---------- entrada ----------
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    sfx.unlock()
    try { canvas.setPointerCapture(e.pointerId) } catch { /* ok */ }
    if (paused || ended) return
    const p = pos(e)
    input.down(e.pointerId, p.x, p.y, e.timeStamp / 1000)
  }
  const onMove = (e: PointerEvent) => {
    e.preventDefault()
    if (paused || ended) return
    const p = pos(e)
    input.move(e.pointerId, p.x, p.y, e.timeStamp / 1000)
  }
  const onUp = (e: PointerEvent) => {
    e.preventDefault()
    sfx.unlock()
    const p = pos(e)
    const ev = input.up(e.pointerId, p.x, p.y, e.timeStamp / 1000)
    if (ev && !paused && !ended) pending.push(ev)
  }
  const onCancel = (e: PointerEvent) => input.cancel(e.pointerId)
  const noMenu = (e: Event) => e.preventDefault()
  canvas.addEventListener("pointerdown", onDown, { passive: false })
  canvas.addEventListener("pointermove", onMove, { passive: false })
  canvas.addEventListener("pointerup", onUp, { passive: false })
  canvas.addEventListener("pointercancel", onCancel)
  canvas.addEventListener("contextmenu", noMenu)

  const onVisibility = () => {
    if (document.hidden && !paused && !ended) { pause(); o.onAutoPause?.() }
  }
  document.addEventListener("visibilitychange", onVisibility)

  function releaseFingers() {
    // suelta cualquier dedo apoyado para que al reanudar no quede el joystick "pegado"
    for (const id of [1, 2, 3, 4, 5]) input.cancel(id)
    input.moveX = 0
    input.moveY = 0
    pending.length = 0
  }

  function pause() {
    if (paused || ended) return
    paused = true
    releaseFingers()
  }
  function resume() {
    if (!paused) return
    paused = false
    stepper.reset()
    last = 0
    sfx.unlock()
  }

  /** Convierte un gesto en patada. Solo el portador del equipo humano puede patear. */
  function applyAction(ev: ActionEvent) {
    const cid = world.puck.carrierId
    const s = cid ? findSkater(world, cid) : undefined
    if (!s || s.side !== 0) return
    if (ev.kind === "flick") {
      const speed = powerFromFlick(ev.vhPerSec)
      const r = assistAim(world, s.id, ev.angle, speed)
      if (kick(world, s.id, r.angle, r.speed) && r.target === "teammate" && r.targetId) controlledId = r.targetId
    } else {
      const tid = bestPassTarget(world, s.id)
      const t = tid ? findSkater(world, tid) : undefined
      if (!t) return
      const d = Math.hypot(t.x - s.x, t.y - s.y)
      const r = assistAim(world, s.id, Math.atan2(t.y - s.y, t.x - s.x), passSpeedFor(d))
      // el control salta ya al receptor: sigues con el mismo dedo mientras el pase viaja
      if (kick(world, s.id, r.angle, r.speed)) controlledId = r.targetId ?? t.id
    }
  }

  function countEvent(ev: ReturnType<typeof drainEvents>[number]) {
    if (ev.type === "kick") {
      const s = findSkater(world, ev.id)
      if (s) {
        const g = GOALS[s.side === 0 ? 1 : 0]
        const u = s.side === 0 ? 1 : -1
        const toGoal = Math.atan2(g.cy - s.y, g.lineX - s.x)
        const dir = Math.atan2(world.puck.vy, world.puck.vx)
        let diff = Math.abs(dir - toGoal)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        if (ev.speed >= 16 && (g.lineX - s.x) * u > 0 && Math.abs(g.lineX - s.x) < 18 && diff < 0.5) result.shots[s.side]++
      }
      lastKick = { id: ev.id }
    } else if (ev.type === "pickup") {
      if (lastKick && lastKick.id !== ev.id && sideOf(lastKick.id) === sideOf(ev.id)) result.passes[sideOf(ev.id)]++
      lastKick = null
    } else if (ev.type === "steal") {
      result.steals[sideOf(ev.id)]++
      lastKick = null
    }
  }

  // ---------- bucle ----------
  let raf = 0
  let last = 0
  let fpsSmooth = 60
  let stepsThisFrame = 0

  const frame = (now: number) => {
    if (destroyed) return
    raf = requestAnimationFrame(frame)
    if (!last) last = now
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    stats.frames++
    if (dt > 0) fpsSmooth += (1 / dt - fpsSmooth) * 0.05

    const portrait = cssH > cssW * 1.05
    stepsThisFrame = 0
    let alpha = 1
    if (!paused && !portrait) {
      alpha = stepper.advance(dt, (fixed) => {
        controlledId = selectControlled(world, 0, controlledId)
        ai.update(world, controlledId, fixed)
        if (controlledId) setInput(world, controlledId, input.moveX, input.moveY)
        while (pending.length) applyAction(pending.shift() as ActionEvent)
        stepWorld(world, fixed)
        stepsThisFrame++
        stats.steps++
        if (world.phase === "play" || world.phase === "timeOn") replayBuf.push(world)
        if (world.events.length) {
          for (const ev of drainEvents(world)) {
            countEvent(ev)
            sfx.play(ev)
            if (ev.type === "foul") {
              banner = { text: `¡FALTA! Tarjeta azul ${names[ev.side]} #${ev.id.slice(1)}`, until: now + 1900 }
              navigator.vibrate?.(60)
            } else if (ev.type === "goal") {
              navigator.vibrate?.(120)
              flash = { color: colors[ev.side], startedAt: now, durationMs: 220 }
              const conceded = GOALS[ev.side === 0 ? 1 : 0]
              const scr = cam.toScreen(conceded.lineX, conceded.cy)
              confetti.spawn(scr.x, scr.y, [colors[ev.side], "#ffd23f", "#ffffff"], 110)
              goalReplay = { frames: replayBuf.freeze(), scorerSide: ev.side, startedAt: now, speed: 0.55 }
            } else if (ev.type === "end" && !ended) {
              ended = true
              releaseFingers()
              result.score = [world.score[0], world.score[1]]
              result.fouls = [world.fouls[0], world.fouls[1]]
              o.onEnd?.({ ...result })
            }
          }
        }
      })
    }
    stats.controlledId = controlledId

    cam.update(dt, world, controlledId, cssW, cssH)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Gol: mientras dura la pausa de festejo, se reproduce en cámara lenta lo que pasó
    // justo antes (en vez de la escena congelada). Si ya salimos de esa fase, se corta.
    let sceneWorld: World = world
    let sceneAlpha = alpha
    if (goalReplay && world.phase === "goal") {
      const rf = replayFrameAt(goalReplay, now)
      if (rf) { sceneWorld = replayWorld(world, rf.prev, rf.curr); sceneAlpha = rf.alpha }
    } else if (goalReplay) {
      goalReplay = null
    }
    const opts = { controlledId, colors, names, alpha: sceneAlpha, fontFamily: FONT }
    drawScene(ctx, sceneWorld, cam, opts)
    if (flash) {
      drawFlash(ctx, flash, now, cssW, cssH)
      if (now - flash.startedAt > flash.durationMs) flash = null
    }
    confetti.update(dt)
    confetti.draw(ctx, cssW, cssH)
    drawHud(ctx, world, cam, { ...opts, alpha })
    drawTouchOverlay(ctx, world, cam, input, controlledId)
    if (banner && now < banner.until) drawBanner(ctx, banner.text, cssW, cssH)
    if (portrait) drawRotateHint(ctx, cssW, cssH)
    if (o.debug) drawDebug(ctx, fpsSmooth, stepsThisFrame, world)
  }
  raf = requestAnimationFrame(frame)

  return {
    get world() { return world },
    get paused() { return paused },
    get ended() { return ended },
    input,
    stats,
    pause,
    resume,
    setSound(on: boolean) { sfx.muted = !on },
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.visualViewport?.removeEventListener("resize", resize)
      ro?.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onCancel)
      canvas.removeEventListener("contextmenu", noMenu)
      sfx.close()
      canvas.remove()
    },
  }
}

// ---------- superposiciones de pantalla ----------
function drawTouchOverlay(ctx: CanvasRenderingContext2D, w: World, cam: Camera, input: TouchInput, controlledId: string | null) {
  ctx.save()
  const st = input.stick
  if (st) {
    ctx.lineWidth = 3
    ctx.strokeStyle = "rgba(255,255,255,0.35)"
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    ctx.beginPath(); ctx.arc(st.ox, st.oy, st.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    const kx = st.ox + Math.max(-1, Math.min(1, (st.cx - st.ox) / st.radius)) * st.radius
    const ky = st.oy + Math.max(-1, Math.min(1, (st.cy - st.oy) / st.radius)) * st.radius
    ctx.fillStyle = "rgba(255,255,255,0.55)"
    ctx.beginPath(); ctx.arc(kx, ky, st.radius * 0.36, 0, Math.PI * 2); ctx.fill()
  }
  const aim = input.aim
  const carrier = w.puck.carrierId ? findSkater(w, w.puck.carrierId) : undefined
  if (aim && carrier && carrier.side === 0 && controlledId === carrier.id) {
    const dx = aim.cx - aim.sx
    const dy = aim.cy - aim.sy
    if (Math.hypot(dx, dy) > 10) {
      const r = assistAim(w, carrier.id, Math.atan2(dy, dx), 14)
      const from = cam.toScreen(carrier.x, carrier.y)
      const len = 9 * cam.ppm
      ctx.strokeStyle = r.target === "teammate" ? "#4ade80" : r.target === "goal" ? "#fde047" : "rgba(255,255,255,0.85)"
      ctx.lineWidth = 4
      ctx.lineCap = "round"
      ctx.setLineDash([2, 10])
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(from.x + Math.cos(r.angle) * len, from.y + Math.sin(r.angle) * len)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawBanner(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  ctx.save()
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const fs = Math.max(14, Math.min(26, H * 0.055))
  ctx.font = `700 ${fs}px ${FONT}`
  const tw = ctx.measureText(text).width + fs * 1.6
  const bx = W / 2 - tw / 2
  const by = H * 0.22
  ctx.fillStyle = "rgba(0,0,0,0.7)"
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(bx, by, tw, fs * 2, fs); else ctx.rect(bx, by, tw, fs * 2)
  ctx.fill()
  ctx.fillStyle = "#93c5fd"
  ctx.fillText(text, W / 2, by + fs)
  ctx.restore()
}

function drawRotateHint(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save()
  ctx.fillStyle = "rgba(5,9,20,0.94)"
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 ${Math.min(W * 0.075, 34)}px ${FONT}`
  ctx.fillText("Gira el teléfono", W / 2, H / 2 - 14)
  ctx.font = `500 ${Math.min(W * 0.045, 18)}px ${FONT}`
  ctx.fillStyle = "rgba(255,255,255,0.7)"
  ctx.fillText("La pista es horizontal", W / 2, H / 2 + 20)
  ctx.restore()
}

function drawDebug(ctx: CanvasRenderingContext2D, fps: number, steps: number, w: World) {
  ctx.save()
  ctx.font = "12px ui-monospace, monospace"
  ctx.textAlign = "left"
  ctx.fillStyle = "rgba(0,0,0,0.6)"
  ctx.fillRect(6, 6, 200, 50)
  ctx.fillStyle = "#a7f3d0"
  ctx.fillText(`pantalla ${fps.toFixed(0)} Hz · ${steps} pasos/frame`, 12, 24)
  ctx.fillText(`sim 120 Hz · t=${w.time.toFixed(1)}s · puck ${Math.hypot(w.puck.vx, w.puck.vy).toFixed(1)} m/s`, 12, 42)
  ctx.restore()
}
