import { GOAL, GOALS, RINK } from "../engine"
import type { Camera, Skater, Surface, World } from "../engine"

export interface DrawOptions {
  controlledId: string | null
  colors: [string, string]
  names: [string, string]
  /** 0..1: interpolación entre el paso anterior y el actual. */
  alpha: number
  fontFamily: string
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const FLOOR: Record<Surface, { base: string; line: string }> = {
  madera: { base: "#3a2a1a", line: "rgba(0,0,0,0.22)" },
  cemento: { base: "#2b2d33", line: "rgba(255,255,255,0.06)" },
  sintetico: { base: "#173a5a", line: "rgba(255,255,255,0.07)" },
}

function roundedRinkPath(ctx: CanvasRenderingContext2D) {
  const L = RINK.length, W = RINK.width, R = RINK.cornerRadius
  ctx.beginPath()
  ctx.moveTo(R, 0)
  ctx.lineTo(L - R, 0)
  ctx.arc(L - R, R, R, -Math.PI / 2, 0)
  ctx.lineTo(L, W - R)
  ctx.arc(L - R, W - R, R, 0, Math.PI / 2)
  ctx.lineTo(R, W)
  ctx.arc(R, W - R, R, Math.PI / 2, Math.PI)
  ctx.lineTo(0, R)
  ctx.arc(R, R, R, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function drawFloor(ctx: CanvasRenderingContext2D, surface: Surface, cam: Camera) {
  const f = FLOOR[surface]
  roundedRinkPath(ctx)
  ctx.fillStyle = f.base
  ctx.fill()
  ctx.save()
  ctx.clip()
  const x0 = Math.max(0, Math.floor(cam.cx - cam.width / 2) - 1)
  const x1 = Math.min(RINK.length, Math.ceil(cam.cx + cam.width / 2) + 1)
  const y0 = Math.max(0, Math.floor(cam.cy - cam.height / 2) - 1)
  const y1 = Math.min(RINK.width, Math.ceil(cam.cy + cam.height / 2) + 1)
  ctx.strokeStyle = f.line
  ctx.lineWidth = 0.04
  ctx.beginPath()
  if (surface === "madera") {
    for (let y = Math.ceil(y0 / 0.8) * 0.8; y <= y1; y += 0.8) { ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
  } else if (surface === "cemento") {
    for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) { ctx.moveTo(x, y0); ctx.lineTo(x, y1) }
    for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) { ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
  } else {
    for (let x = Math.ceil(x0); x <= x1; x += 1) { ctx.moveTo(x, y0); ctx.lineTo(x, y1) }
    for (let y = Math.ceil(y0); y <= y1; y += 1) { ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
  }
  ctx.stroke()
  ctx.restore()
}

function drawMarkings(ctx: CanvasRenderingContext2D) {
  const L = RINK.length, W = RINK.width
  ctx.strokeStyle = "rgba(0,212,255,0.75)"
  ctx.lineWidth = 0.08
  ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2, W); ctx.stroke()
  ctx.beginPath(); ctx.arc(L / 2, W / 2, 3, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = "#ff6b35"
  ctx.beginPath(); ctx.arc(L / 2, W / 2, 0.15, 0, Math.PI * 2); ctx.fill()
  for (const g of GOALS) {
    ctx.strokeStyle = "rgba(255,204,0,0.6)"
    ctx.lineWidth = 0.07
    ctx.beginPath()
    const a0 = g.dir === -1 ? -Math.PI / 2 : Math.PI / 2
    ctx.arc(g.lineX, g.cy, 3.4, a0 + Math.PI * (g.dir === -1 ? 0 : 0), a0 + Math.PI, g.dir === -1 ? false : false)
    ctx.stroke()
  }
}

function drawBoards(ctx: CanvasRenderingContext2D) {
  roundedRinkPath(ctx)
  ctx.strokeStyle = "#0b1220"
  ctx.lineWidth = 0.5
  ctx.stroke()
  ctx.strokeStyle = "#00d4ff"
  ctx.lineWidth = 0.1
  ctx.stroke()
}

function drawGoals(ctx: CanvasRenderingContext2D) {
  for (const g of GOALS) {
    const x = Math.min(g.lineX, g.backX)
    ctx.fillStyle = "rgba(255,255,255,0.13)"
    ctx.fillRect(x, g.yMin, GOAL.depth, GOAL.mouth)
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = 0.06
    ctx.strokeRect(x, g.yMin, GOAL.depth, GOAL.mouth)
    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 0.1
    ctx.beginPath(); ctx.moveTo(g.lineX, g.yMin); ctx.lineTo(g.lineX, g.yMax); ctx.stroke()
    ctx.fillStyle = "#ffffff"
    for (const py of [g.yMin, g.yMax]) { ctx.beginPath(); ctx.arc(g.lineX, py, 0.11, 0, Math.PI * 2); ctx.fill() }
  }
}

function drawSkater(ctx: CanvasRenderingContext2D, s: Skater, color: string, alpha: number, controlled: boolean) {
  const x = lerp(s.px, s.x, alpha)
  const y = lerp(s.py, s.y, alpha)
  const r = s.radius
  ctx.save()
  ctx.translate(x, y)
  // sombra
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.beginPath(); ctx.ellipse(0.05, 0.12, r * 1.05, r * 0.9, 0, 0, Math.PI * 2); ctx.fill()
  // palo
  ctx.strokeStyle = "#8b5a2b"
  ctx.lineWidth = 0.1
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(Math.cos(s.stickAngle) * r * 0.5, Math.sin(s.stickAngle) * r * 0.5)
  ctx.lineTo(Math.cos(s.stickAngle) * (r + 0.42), Math.sin(s.stickAngle) * (r + 0.42))
  ctx.stroke()
  // cuerpo
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = "rgba(0,0,0,0.55)"
  ctx.lineWidth = 0.06
  ctx.stroke()
  // cabeza estilo Funko: cara y "casco" del color del equipo, mirando hacia donde va
  ctx.rotate(s.heading)
  const hr = r * 0.74
  ctx.fillStyle = "#ffdfc4"
  ctx.beginPath(); ctx.arc(r * 0.08, 0, hr, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(-r * 0.05, 0, hr * 0.9, Math.PI * 0.55, Math.PI * 1.45); ctx.fill()
  ctx.fillStyle = "#000"
  ctx.beginPath()
  ctx.arc(r * 0.42, -r * 0.24, r * 0.1, 0, Math.PI * 2)
  ctx.arc(r * 0.42, r * 0.24, r * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(-s.heading)
  if (s.isCaptain) {
    ctx.fillStyle = "#fbbf24"
    ctx.font = `${r * 0.9}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("★", 0, -r * 0.05)
  }
  if (controlled) {
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 0.08
    ctx.setLineDash([0.25, 0.18])
    ctx.beginPath(); ctx.arc(0, 0, r + 0.22, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.moveTo(0, -r - 0.42); ctx.lineTo(-0.26, -r - 0.86); ctx.lineTo(0.26, -r - 0.86); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

export function drawScene(ctx: CanvasRenderingContext2D, w: World, cam: Camera, o: DrawOptions) {
  const { alpha } = o
  ctx.fillStyle = "#050914"
  ctx.fillRect(0, 0, cam.vw, cam.vh)

  ctx.save()
  ctx.translate(cam.vw / 2, cam.vh / 2)
  ctx.scale(cam.ppm, cam.ppm)
  ctx.translate(-cam.cx, -cam.cy)

  drawFloor(ctx, w.surface, cam)
  drawMarkings(ctx)
  drawGoals(ctx)
  drawBoards(ctx)

  // puck (con radio visual mínimo para que se vea en pantallas chicas)
  const p = w.puck
  const pxp = lerp(p.px, p.x, alpha)
  const pyp = lerp(p.py, p.y, alpha)
  const pr = Math.max(p.radius, 6 / cam.ppm)
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.beginPath(); ctx.ellipse(pxp + 0.04, pyp + 0.08, pr * 1.05, pr * 0.85, 0, 0, Math.PI * 2); ctx.fill()

  // porteros
  for (const g of w.goalies) {
    const gx = lerp(g.px, g.x, alpha)
    const gy = lerp(g.py, g.y, alpha)
    const c = o.colors[g.side]
    ctx.fillStyle = "rgba(0,0,0,0.35)"
    ctx.beginPath(); ctx.ellipse(gx + 0.05, gy + 0.1, g.radius * 1.05, g.radius * 0.9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(gx, gy, g.radius, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#e5e7eb"
    ctx.fillRect(gx - g.radius * 0.85, gy - g.radius * 0.28, g.radius * 1.7, g.radius * 0.56)
    ctx.strokeStyle = "rgba(0,0,0,0.6)"
    ctx.lineWidth = 0.06
    ctx.beginPath(); ctx.arc(gx, gy, g.radius, 0, Math.PI * 2); ctx.stroke()
  }

  for (const s of w.skaters) drawSkater(ctx, s, o.colors[s.side], alpha, s.id === o.controlledId)

  ctx.fillStyle = "#ffffff"
  ctx.beginPath(); ctx.arc(pxp, pyp, pr, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = "#000"
  ctx.lineWidth = pr * 0.35
  ctx.beginPath(); ctx.arc(pxp, pyp, pr * 0.95, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = "#111"
  ctx.beginPath(); ctx.arc(pxp, pyp, pr * 0.4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
}

/** Marcador compacto y SIEMPRE visible (arriba al centro), más mensajes de gol / fin. */
export function drawHud(ctx: CanvasRenderingContext2D, w: World, cam: Camera, o: DrawOptions) {
  const vw = cam.vw
  const vh = cam.vh
  const fs = Math.max(14, Math.min(28, vh * 0.055))
  const padX = fs * 0.7
  const h = fs * 1.9
  const wBox = fs * 11
  const x = vw / 2 - wBox / 2
  const y = Math.max(6, vh * 0.02)
  ctx.save()
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  ctx.roundRect ? ctx.roundRect(x, y, wBox, h, h / 2) : ctx.rect(x, y, wBox, h)
  ctx.fill()
  ctx.textBaseline = "middle"
  const cy = y + h / 2
  ctx.font = `bold ${fs}px ${o.fontFamily}`
  ctx.textAlign = "left"
  ctx.fillStyle = o.colors[0]
  ctx.beginPath(); ctx.arc(x + padX, cy, fs * 0.28, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "#fff"
  ctx.fillText(String(w.score[0]), x + padX + fs * 0.6, cy)
  ctx.textAlign = "right"
  ctx.fillText(String(w.score[1]), x + wBox - padX - fs * 0.6, cy)
  ctx.fillStyle = o.colors[1]
  ctx.beginPath(); ctx.arc(x + wBox - padX, cy, fs * 0.28, 0, Math.PI * 2); ctx.fill()
  ctx.textAlign = "center"
  ctx.fillStyle = w.clock <= 10 ? "#f87171" : "#fde047"
  ctx.fillText(fmtClock(w.clock), vw / 2, cy)

  // expulsados (tarjeta azul): chips con la cuenta atrás, debajo del marcador, del lado de su equipo
  const chipH = fs * 1.15
  const chipW = fs * 3.1
  const counters = [0, 0]
  for (const b of w.bench) {
    const k = counters[b.side]++
    const cx0 = b.side === 0 ? x + k * (chipW + 4) : x + wBox - chipW - k * (chipW + 4)
    const cy0 = y + h + 6
    ctx.fillStyle = "rgba(0,0,0,0.6)"
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(cx0, cy0, chipW, chipH, chipH / 2) : ctx.rect(cx0, cy0, chipW, chipH)
    ctx.fill()
    ctx.fillStyle = "#3b82f6"
    ctx.fillRect(cx0 + chipH * 0.3, cy0 + chipH * 0.22, chipH * 0.34, chipH * 0.56)
    ctx.fillStyle = o.colors[b.side]
    ctx.beginPath(); ctx.arc(cx0 + chipH * 0.95, cy0 + chipH / 2, chipH * 0.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#fff"
    ctx.font = `bold ${fs * 0.72}px ${o.fontFamily}`
    ctx.textAlign = "left"
    ctx.fillText(`${Math.ceil(b.timer)}s`, cx0 + chipH * 1.3, cy0 + chipH / 2)
  }
  ctx.restore()

  if (w.phase === "goal" || w.phase === "ended") {
    const scorer = w.phase === "goal" ? (w.puck.lastTouchSide ?? 0) : null
    ctx.save()
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `bold ${Math.min(vh * 0.16, 80)}px ${o.fontFamily}`
    ctx.lineWidth = 6
    ctx.strokeStyle = "rgba(0,0,0,0.7)"
    const text = w.phase === "goal" ? "¡GOOOL!" : "FIN"
    ctx.strokeText(text, vw / 2, vh / 2)
    ctx.fillStyle = scorer === null ? "#fff" : "#fff"
    ctx.fillText(text, vw / 2, vh / 2)
    if (w.phase === "ended") {
      ctx.font = `bold ${Math.min(vh * 0.08, 40)}px ${o.fontFamily}`
      ctx.fillText(`${w.score[0]} - ${w.score[1]}`, vw / 2, vh / 2 + Math.min(vh * 0.14, 70))
    }
    ctx.restore()
  }
}
