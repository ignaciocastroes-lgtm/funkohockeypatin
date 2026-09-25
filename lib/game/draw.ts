import { CREASE_RADIUS, GOAL, GOALS, MATCH, RINK, bestPassTarget } from "../engine"
import type { Camera, Side, Skater, Surface, World } from "../engine"
import { drawGlyphs } from "./glyphs"
import { FLOOR_BASE, PLATE_BRAND_H, auraColor, goalieStickAngle, edgeAnchor, hudAvoidRects, pickCueColor, plateSize, rgb, slideOffRects } from "./cues"

export interface DrawOptions {
  controlledId: string | null
  /** Lado del equipo humano (0), o null si no hay humano (demo): activa el aura de "mi equipo". */
  humanSide?: Side | null
  colors: [string, string]
  names: [string, string]
  crests: [string, string]
  /** true mientras se muestra el festejo de un gol de combo (para el marcador: "¡GOLAZO!"). */
  comboGoal?: boolean
  /** true hasta que el equipo humano hace su primera acción (pase o tiro): hint chico abajo. */
  showHint?: boolean
  /** true en modo demo (IA vs IA): muestra el cartel "TOCÁ PARA JUGAR" pulsando. */
  demo?: boolean
  /** 0..1: interpolación entre el paso anterior y el actual. */
  /** 0..1: entusiasmo actual del público (`crowd.info.excitement`), para que las gradas reboten un
   *  poco más en los momentos de tensión. Sin público (entrenamiento), se usa un valor tranquilo fijo. */
  crowdExcitement?: number
  alpha: number
  fontFamily: string
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Aclara (amt>0) u oscurece (amt<0) un color hex, para gradientes — nada de bloques planos. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const clamp255 = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp255(((n >> 16) & 255) + amt)
  const g = clamp255(((n >> 8) & 255) + amt)
  const b = clamp255((n & 255) + amt)
  return `rgb(${r},${g},${b})`
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** Cómo se dibuja un patinador según su relación con el humano. Lo decide drawScene, no drawSkater. */
interface Look {
  /** Es de mi equipo (y no soy yo): lleva aura de equipo. */
  mine: boolean
  /** Color del aura (el del equipo, aclarado si se pierde contra el piso). */
  aura: string
  /** Color del marcador de "lo controlás" (amarillo, o blanco si el equipo es amarillo/naranja). */
  cue: string
  /** Es el compañero al que iría el pase automático (toque suelto). */
  passTarget: boolean
  /** Píxeles por metro de la cámara: los trazos finos no bajan de ~1.6 px aunque se aleje el zoom. */
  ppm: number
}
const NO_LOOK: Look = { mine: false, aura: "#ffffff", cue: "#facc15", passTarget: false, ppm: 20 }
const PASS_GREEN = "#4ade80"

const FLOOR: Record<Surface, { base: string; line: string }> = {
  madera: { base: FLOOR_BASE.madera, line: "rgba(0,0,0,0.22)" },
  cemento: { base: FLOOR_BASE.cemento, line: "rgba(255,255,255,0.06)" },
  sintetico: { base: FLOOR_BASE.sintetico, line: "rgba(255,255,255,0.07)" },
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

/** Hash determinístico 2D (0..1) — para que cada tabla/losa/baldosa tenga un tono propio, no un
 *  color plano repetido: lee más a material real, menos a paleta RGB de prototipo. */
function matHash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 1000) / 1000
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
  if (surface === "madera") {
    // cada tabla con su propio tono (vetas): +-9 sobre el color base, ancho fijo de 0.8m
    const cell = 0.8
    for (let y = Math.floor(y0 / cell) * cell; y < y1; y += cell) {
      const i = Math.round(y / cell)
      ctx.fillStyle = shade(f.base, (matHash(i, 0) - 0.5) * 18)
      ctx.fillRect(x0, y, x1 - x0, cell)
    }
  } else if (surface === "cemento") {
    // cada losa de 5x5 con su propia mancha/desgaste: +-12
    const cell = 5
    for (let cx = Math.floor(x0 / cell); cx * cell < x1; cx++) {
      for (let cy = Math.floor(y0 / cell); cy * cell < y1; cy++) {
        ctx.fillStyle = shade(f.base, (matHash(cx, cy) - 0.5) * 24)
        ctx.fillRect(cx * cell, cy * cell, cell, cell)
      }
    }
  } else {
    // baldosa de goma de 1x1, variación más chica y pareja: +-5
    const cell = 1
    for (let cx = Math.floor(x0 / cell); cx * cell < x1; cx++) {
      for (let cy = Math.floor(y0 / cell); cy * cell < y1; cy++) {
        ctx.fillStyle = shade(f.base, (matHash(cx, cy) - 0.5) * 10)
        ctx.fillRect(cx * cell, cy * cell, cell, cell)
      }
    }
  }
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
    ctx.arc(g.lineX, g.cy, CREASE_RADIUS, a0 + Math.PI * (g.dir === -1 ? 0 : 0), a0 + Math.PI, g.dir === -1 ? false : false)
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

const HAIR_PALETTE = ["#2b1a12", "#4a2f1d", "#0f0f0f", "#6b4423", "#caa472", "#3d2314", "#1c1712", "#8a5a2b", "#9a3f1f", "#5a3a26"]
function hairColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HAIR_PALETTE[h % HAIR_PALETTE.length]
}

/** 4 estilos, elegidos por id (consistente por jugador): la cámara cenital muestra sobre todo el
 *  pelo, así que la variedad de textura/forma importa más que la cara. */
export function hairStyle(id: string): 0 | 1 | 2 | 3 {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i) * 7) >>> 0
  return (h % 4) as 0 | 1 | 2 | 3
}

/** Generador pseudoaleatorio con semilla (mulberry32): el pelo de cada jugador es siempre el mismo. */
function seeded(id: string): () => number {
  let a = 2166136261
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 16777619)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`
}

/**
 * Pelo visto desde arriba, dibujado con hachurado de trazos (como las fotos de referencia) en vez de
 * un color liso: cada estilo tiene su "material" — hebras cortas con remolino, rulos, cabello rapado
 * con diseño y pelo largo con raya. Coordenadas locales de la cabeza, +x = hacia donde mira. Los trazos
 * salen de una semilla por jugador (estables) y se agrupan por tono para dibujarlos en pocas pasadas.
 */
function drawHair(ctx: CanvasRenderingContext2D, style: 0 | 1 | 2 | 3, hc: string, hr: number, r: number, id: string, ppm: number) {
  const rnd = seeded(id)
  const lw = Math.max(hr * 0.06, 1.1 / ppm) // los trazos no bajan de ~1 px aunque se aleje el zoom
  const skin = "#ffdfc4"
  const dark = shade(hc, -28)
  const mid = hc
  const light = shade(hc, 48)
  const hairX = hr * (style === 2 ? 0.55 : 0.42) // la línea de nacimiento del pelo: adelante queda la frente

  ctx.save()
  ctx.translate(r * 0.08, 0)
  // recorte: todo el pelo queda atrás de la línea de nacimiento (curva suave, no un tajo recto)
  ctx.beginPath()
  ctx.moveTo(-hr * 2.4, -hr * 2.4)
  ctx.lineTo(hairX, -hr * 2.4)
  ctx.lineTo(hairX, -hr * 0.95)
  ctx.quadraticCurveTo(hairX - hr * 0.14, 0, hairX, hr * 0.95)
  ctx.lineTo(hairX, hr * 2.4)
  ctx.lineTo(-hr * 2.4, hr * 2.4)
  ctx.closePath()
  ctx.clip()

  const batch: Record<string, Array<[number, number, number, number]>> = {}
  const add = (color: string, x0: number, y0: number, x1: number, y1: number) => {
    ;(batch[color] ??= []).push([x0, y0, x1, y1])
  }
  const flush = (alpha: number, width: number) => {
    ctx.globalAlpha = alpha
    ctx.lineWidth = width
    ctx.lineCap = "round"
    for (const [color, segs] of Object.entries(batch)) {
      ctx.strokeStyle = color
      ctx.beginPath()
      for (const [x0, y0, x1, y1] of segs) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1) }
      ctx.stroke()
      delete batch[color]
    }
    ctx.globalAlpha = 1
  }
  const pick = () => { const u = rnd(); return u < 0.34 ? dark : u < 0.72 ? mid : light }

  if (style === 0) {
    // corto y texturado: hebras cortas que salen de un remolino en la coronilla, con puntas sueltas al borde
    ctx.fillStyle = shade(hc, -14)
    ctx.beginPath(); ctx.arc(0, 0, hr * 1.0, 0, Math.PI * 2); ctx.fill()
    const wx = -hr * 0.42, wy = hr * 0.06
    for (let i = 0; i < 70; i++) {
      const rr = Math.sqrt(rnd()) * hr * 0.98
      const a = rnd() * Math.PI * 2
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr
      const ang = Math.atan2(y - wy, x - wx) + 0.9 + (rnd() - 0.5) * 0.7 // giro del remolino
      const len = hr * (0.16 + rnd() * 0.16)
      add(pick(), x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    }
    flush(0.85, lw)
    for (let i = 0; i < 16; i++) { // puntas sueltas que asoman en el contorno
      const a = Math.PI * (0.55 + rnd() * 0.9)
      const x = Math.cos(a) * hr * 0.9, y = Math.sin(a) * hr * 0.9
      add(mid, x, y, Math.cos(a) * hr * (1.08 + rnd() * 0.1), Math.sin(a) * hr * (1.08 + rnd() * 0.1))
    }
    flush(1, lw * 1.05)
  } else if (style === 1) {
    // rulos apretados: volumen redondo hecho de anillitos, más grande que la cabeza
    ctx.fillStyle = shade(hc, -12)
    ctx.beginPath(); ctx.arc(-hr * 0.04, 0, hr * 1.1, 0, Math.PI * 2); ctx.fill()
    const N = 96
    const q = hr * 0.105
    for (let i = 0; i < N; i++) {
      const rr = Math.sqrt((i + 0.5) / N) * hr * 1.02
      const a = i * 2.39996
      const x = Math.cos(a) * rr - hr * 0.04, y = Math.sin(a) * rr
      ctx.fillStyle = dark
      ctx.beginPath(); ctx.arc(x, y, q * 0.62, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 0.42
      ctx.strokeStyle = i % 4 === 0 ? light : mid
      ctx.lineWidth = Math.max(q * 0.42, lw * 0.8)
      ctx.beginPath(); ctx.arc(x, y, q * 0.8, rnd() * 6, rnd() * 6 + 4.2); ctx.stroke()
      ctx.globalAlpha = 1
    }
  } else if (style === 2) {
    // rapado: cuero cabelludo a la vista con sombra de pelo y un diseño rasurado más claro
    ctx.fillStyle = mixHex(hc, skin, 0.5)
    ctx.beginPath(); ctx.arc(0, 0, hr * 0.98, 0, Math.PI * 2); ctx.fill()
    const wx = -hr * 0.4, wy = hr * 0.08
    for (let i = 0; i < 130; i++) {
      const rr = Math.sqrt(rnd()) * hr * 0.96
      const a = rnd() * Math.PI * 2
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr
      const ang = Math.atan2(y - wy, x - wx) + 0.7 + (rnd() - 0.5) * 0.5
      const len = hr * (0.06 + rnd() * 0.08)
      add(rnd() < 0.7 ? dark : mid, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    }
    flush(0.55, Math.max(hr * 0.035, 0.8 / ppm))
    // diseño rasurado: 3 curvas claras que se enroscan atrás
    ctx.strokeStyle = skin
    ctx.globalAlpha = 0.8
    ctx.lineWidth = Math.max(hr * 0.06, 1 / ppm)
    ctx.lineCap = "round"
    for (let k = 0; k < 3; k++) {
      const a0 = Math.PI * (0.62 + k * 0.26)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a0) * hr * 0.28, Math.sin(a0) * hr * 0.28)
      ctx.quadraticCurveTo(Math.cos(a0 + 0.9) * hr * 0.75, Math.sin(a0 + 0.9) * hr * 0.75, Math.cos(a0 + 0.35) * hr * 0.9, Math.sin(a0 + 0.35) * hr * 0.9)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  } else {
    // largo con raya al medio: hebras que salen de la raya, se abren a los lados y caen atrás
    ctx.fillStyle = shade(hc, -18)
    ctx.beginPath(); ctx.arc(-hr * 0.06, 0, hr * 1.08, 0, Math.PI * 2); ctx.fill()
    const N = 30
    for (let k = 0; k < N; k++) {
      const x0 = hairX - hr * 0.02 - ((hairX + hr * 0.95) * k) / (N - 1)
      for (const sd of [-1, 1]) {
        const x1 = x0 - hr * (0.26 + rnd() * 0.14)
        const yEnd = sd * Math.sqrt(Math.max(0.04, (hr * 1.06) ** 2 - x1 * x1))
        ctx.strokeStyle = pick()
        ctx.globalAlpha = 0.8
        ctx.lineWidth = lw
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(x0, sd * hr * 0.04)
        ctx.quadraticCurveTo(x0 - hr * 0.06, sd * hr * (0.5 + rnd() * 0.15), x1, yEnd)
        ctx.stroke()
      }
    }
    // brillo: hebras claras a los lados de la raya
    for (let i = 0; i < 12; i++) {
      const x0 = hairX - hr * (0.15 + rnd() * 0.9)
      for (const sd of [-1, 1]) {
        add(light, x0, sd * hr * (0.3 + rnd() * 0.25), x0 - hr * 0.22, sd * hr * (0.5 + rnd() * 0.2))
      }
    }
    flush(0.5, lw * 0.9)
    // la raya: cuero cabelludo claro, más ancho adelante y afinándose hacia atrás
    ctx.strokeStyle = skin
    ctx.globalAlpha = 0.9
    ctx.lineCap = "round"
    ctx.lineWidth = hr * 0.08
    ctx.beginPath(); ctx.moveTo(hairX, 0); ctx.lineTo(-hr * 0.35, 0); ctx.stroke()
    ctx.lineWidth = hr * 0.04
    ctx.beginPath(); ctx.moveTo(-hr * 0.35, 0); ctx.lineTo(-hr * 0.9, 0); ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

export function drawSkater(ctx: CanvasRenderingContext2D, s: Skater, color: string, alpha: number, controlled: boolean, carrying: boolean, comboTouches: number, look: Look = NO_LOOK) {
  const x = lerp(s.px, s.x, alpha)
  const y = lerp(s.py, s.y, alpha)
  const r = s.radius
  const speed = Math.hypot(s.vx, s.vy)

  // Rastro de rueda (no de cuchilla de hielo): un par de trazos cortos y punteados detrás del que
  // lleva la bocha, en la dirección opuesta a su marcha. Se dibuja ANTES del cuerpo, en coordenadas
  // de mundo (no rotado con el jugador), para que se lea como marca dejada en el piso.
  if (carrying && speed > 0.3) {
    const bx = -s.vx / speed
    const by = -s.vy / speed
    const px2 = by, py2 = -bx
    const len = Math.min(0.9, 0.25 + speed * 0.07)
    ctx.save()
    ctx.globalAlpha = Math.min(0.5, 0.15 + speed * 0.03)
    ctx.strokeStyle = "#d4d4d8"
    ctx.lineWidth = 0.045
    ctx.lineCap = "round"
    ctx.setLineDash([0.05, 0.09])
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(x + px2 * r * 0.55 * side, y + py2 * r * 0.55 * side)
      ctx.lineTo(x + px2 * r * 0.55 * side + bx * len, y + py2 * r * 0.55 * side + by * len)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.save()
  ctx.translate(x, y)

  if (controlled) {
    // Marcador de piso: un beacon pulsante DEBAJO del jugador. Amarillo por defecto; si el equipo
    // es amarillo/naranja (Brasil, Angola) pasa a blanco (`pickCueColor`), para que no se pierda
    // contra el propio cuerpo ni contra los aros de "lleva la bocha" y combo.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320)
    ctx.save()
    ctx.globalAlpha = 0.85
    const beaconR = r * (1.55 + pulse * 0.25)
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, beaconR)
    g.addColorStop(0, rgba(look.cue, 0.55))
    g.addColorStop(0.7, rgba(look.cue, 0.22))
    g.addColorStop(1, rgba(look.cue, 0))
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(0, 0, beaconR, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  if (look.mine) {
    // Aura de compañero: un resplandor ESTÁTICO del color del equipo alrededor del cuerpo. El aro
    // fino de color no alcanzaba: esto agrega superficie (se lee de lejos) y, con el anillo claro
    // de más abajo, un canal que no depende del tono. Estático a propósito: "yo" es el que pulsa.
    const gr = r * 2.15
    const glow = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, gr)
    glow.addColorStop(0, rgba(look.aura, 0.72))
    glow.addColorStop(0.55, rgba(look.aura, 0.32))
    glow.addColorStop(1, rgba(look.aura, 0))
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill()
  }
  // sombra
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.beginPath(); ctx.ellipse(0.05, 0.12, r * 1.05, r * 0.9, 0, 0, Math.PI * 2); ctx.fill()
  // palo
  ctx.strokeStyle = "#8b5a2b"
  ctx.lineWidth = 0.1
  ctx.lineCap = "round"
  ctx.beginPath()
  // palo: un poco más largo que antes (un palo real anda por 1.02 m), le da más alcance visual
  ctx.moveTo(Math.cos(s.stickAngle) * r * 0.5, Math.sin(s.stickAngle) * r * 0.5)
  ctx.lineTo(Math.cos(s.stickAngle) * (r + 0.62), Math.sin(s.stickAngle) * (r + 0.62))
  ctx.stroke()
  // cuerpo — se apaga (menos saturado, más gris) a medida que se cansa: la energía SE VE, no
  // solo se lee en una rayita del HUD. Con el tanque lleno no cambia nada.
  const fatigue = Math.max(0, Math.min(1, (100 - s.stamina) / 100))
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  if (fatigue > 0.15) {
    ctx.fillStyle = "#52525b"
    ctx.globalAlpha = fatigue * 0.5
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.strokeStyle = "rgba(0,0,0,0.55)"
  ctx.lineWidth = 0.06
  ctx.stroke()
  // cabeza estilo Funko: en patines NO se usa casco (solo el arquero), así que se ve la
  // cara y, en la parte de atrás de la cabeza, el pelo (visto desde arriba).
  ctx.rotate(s.heading)
  const hr = r * 0.74
  // orejas (se ven en las fotos de referencia): van debajo; el pelo largo y los rulos las tapan
  ctx.fillStyle = "#f2c9a8"
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(r * 0.04, side * hr * 1.0, hr * 0.15, hr * 0.23, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = "#ffdfc4"
  ctx.beginPath(); ctx.arc(r * 0.08, 0, hr, 0, Math.PI * 2); ctx.fill()
  drawHair(ctx, hairStyle(s.id), hairColor(s.id), hr, r, s.id, look.ppm)
  // Sin ojos: como en las fotos de referencia es la coronilla vista desde arriba. Lo que marca hacia
  // dónde mira es la frente y la nariz al frente (sirve para leer la dirección del jugador).
  ctx.fillStyle = "#f2c9a8"
  ctx.beginPath(); ctx.ellipse(r * 0.08 + hr * 1.0, 0, hr * 0.17, hr * 0.21, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = "rgba(120,60,30,0.35)"
  ctx.lineWidth = 0.03
  ctx.beginPath(); ctx.ellipse(r * 0.08 + hr * 1.0, 0, hr * 0.17, hr * 0.21, 0, -1.2, 1.2); ctx.stroke()
  ctx.rotate(-s.heading)
  // dorsal: el número lo da la posición en la plantilla (L3/V5 -> "3"/"5"), abajo del cuerpo
  // para no pelearse con la cara; el capitán además suma la estrella arriba.
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.font = `700 ${r * 0.72}px ${"system-ui"}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineWidth = r * 0.14
  ctx.strokeStyle = "rgba(0,0,0,0.55)"
  const num = s.id.slice(1)
  ctx.strokeText(num, 0, r * 0.55)
  ctx.fillText(num, 0, r * 0.55)
  if (s.isCaptain) {
    ctx.fillStyle = "#fbbf24"
    ctx.font = `${r * 0.9}px sans-serif`
    ctx.fillText("★", 0, -r * 0.05)
  }
  if (look.mine) {
    // Anillo claro y fino, sólido (el de "lo controlás" es grueso, punteado y late): con el
    // resplandor de abajo forma el aura. Es claro para que no dependa del tono del equipo.
    ctx.strokeStyle = "rgba(255,255,255,0.92)"
    ctx.lineWidth = Math.max(0.055, 1.6 / look.ppm)
    ctx.beginPath(); ctx.arc(0, 0, r + 0.13, 0, Math.PI * 2); ctx.stroke()
  }
  if (look.passTarget) {
    // Mira de pase: 4 arcos verdes que giran despacio alrededor del compañero al que iría el toque
    // suelto. Verde = pase, igual que la línea de puntería. Forma distinta a todos los aros.
    const t = performance.now() / 1000
    const pulse = 0.5 + 0.5 * Math.sin(t * 6)
    const R = r + 0.44 + pulse * 0.07
    ctx.save()
    ctx.strokeStyle = PASS_GREEN
    ctx.lineWidth = Math.max(0.1, 2.2 / look.ppm)
    ctx.lineCap = "round"
    ctx.shadowColor = PASS_GREEN
    ctx.shadowBlur = 6
    for (let k = 0; k < 4; k++) {
      const a = t * 1.4 + Math.PI / 4 + (k * Math.PI) / 2
      ctx.beginPath(); ctx.arc(0, 0, R, a - 0.38, a + 0.38); ctx.stroke()
    }
    ctx.restore()
  }
  if (controlled) {
    const bounce = Math.abs(Math.sin(performance.now() / 320)) * 0.08
    ctx.strokeStyle = look.cue
    ctx.lineWidth = 0.1
    ctx.setLineDash([0.22, 0.16])
    ctx.beginPath(); ctx.arc(0, 0, r + 0.24, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = look.cue
    ctx.strokeStyle = "rgba(0,0,0,0.5)"
    ctx.lineWidth = 0.03
    const ty = -r - 0.5 - bounce
    ctx.beginPath()
    ctx.moveTo(0, ty); ctx.lineTo(-0.3, ty - 0.44); ctx.lineTo(0.3, ty - 0.44); ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  if (carrying) {
    // Anillo sólido color bocha: distinto del punteado blanco de "controlado" (pueden coexistir).
    ctx.strokeStyle = "#fb923c"
    ctx.lineWidth = 0.07
    ctx.beginPath(); ctx.arc(0, 0, r + 0.1, 0, Math.PI * 2); ctx.stroke()
  }
  if (comboTouches > 0) {
    // Combo armándose: aro que crece y late con los toques — a 3/3 (armado) el latido es notorio.
    // Esto es lo que hace que el combo se SIENTA en el jugador, no solo se lea en el HUD.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (260 - comboTouches * 40))
    ctx.save()
    ctx.globalAlpha = 0.55 + 0.35 * pulse
    ctx.strokeStyle = color
    ctx.lineWidth = 0.05 + comboTouches * 0.03 + pulse * 0.03
    ctx.beginPath(); ctx.arc(0, 0, r + 0.32 + comboTouches * 0.07, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

/**
 * Público visual: una tribuna de puntitos de colores más allá de las vallas, todo alrededor de la
 * pista. Cada "hincha" tiene su posición fija (grilla + jitter determinístico por hash, nada de
 * estado que guardar) pero rebota un poco con un seno — más alto cuanto más entusiasmo hay
 * (`crowdExcitement`, ver `Crowd.info` en crowd.ts), así la tribuna "se prende" en los momentos
 * de tensión igual que el público de audio. Solo se dibujan los que entran en cuadro.
 */
const STANDS_DEPTH = 2.0
const FAN_SPACING = 0.55
const FAN_PALETTE = ["#f97316", "#22d3ee", "#facc15", "#a855f7", "#ef4444", "#4ade80", "#e2e8f0", "#38bdf8"]
function fanHash(i: number, j: number): number {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return h - Math.floor(h)
}
function drawCrowdStands(ctx: CanvasRenderingContext2D, cam: Camera, excitement: number, now: number) {
  const x0 = cam.cx - cam.width / 2, x1 = cam.cx + cam.width / 2
  const y0 = cam.cy - cam.height / 2, y1 = cam.cy + cam.height / 2
  const bands = [
    { bx0: -STANDS_DEPTH, bx1: RINK.length + STANDS_DEPTH, by0: -STANDS_DEPTH, by1: 0 }, // arriba
    { bx0: -STANDS_DEPTH, bx1: RINK.length + STANDS_DEPTH, by0: RINK.width, by1: RINK.width + STANDS_DEPTH }, // abajo
    { bx0: -STANDS_DEPTH, bx1: 0, by0: 0, by1: RINK.width }, // izquierda
    { bx0: RINK.length, bx1: RINK.length + STANDS_DEPTH, by0: 0, by1: RINK.width }, // derecha
  ]
  const bob = 0.05 + 0.18 * Math.max(0, Math.min(1, excitement))
  ctx.save()
  for (const b of bands) {
    const cx0 = Math.max(b.bx0, x0 - FAN_SPACING), cx1 = Math.min(b.bx1, x1 + FAN_SPACING)
    const cy0 = Math.max(b.by0, y0 - FAN_SPACING), cy1 = Math.min(b.by1, y1 + FAN_SPACING)
    if (cx1 <= cx0 || cy1 <= cy0) continue
    const i0 = Math.floor(cx0 / FAN_SPACING), i1 = Math.ceil(cx1 / FAN_SPACING)
    const j0 = Math.floor(cy0 / FAN_SPACING), j1 = Math.ceil(cy1 / FAN_SPACING)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const h = fanHash(i, j)
        const fx = i * FAN_SPACING + (h - 0.5) * 0.2
        const fy = j * FAN_SPACING + (fanHash(j, i) - 0.5) * 0.2
        if (fx < b.bx0 || fx > b.bx1 || fy < b.by0 || fy > b.by1) continue
        const phase = h * Math.PI * 2
        const yy = fy - Math.abs(Math.sin(now * 3.1 + phase)) * bob * (0.5 + 0.5 * fanHash(j, i))
        ctx.globalAlpha = 0.5 + 0.28 * fanHash(i + 1, j + 1)
        ctx.fillStyle = FAN_PALETTE[Math.floor(h * FAN_PALETTE.length) % FAN_PALETTE.length]
        ctx.beginPath()
        ctx.arc(fx, yy, 0.15, 0, Math.PI * 2)
        ctx.fill()
      }
    }
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

  drawCrowdStands(ctx, cam, o.crowdExcitement ?? 0.15, performance.now() / 1000)
  drawFloor(ctx, w.surface, cam)
  drawMarkings(ctx)
  drawGoals(ctx)
  drawBoards(ctx)

  // puck (con radio visual mínimo para que se vea en pantallas chicas)
  const p = w.puck
  const pxp = lerp(p.px, p.x, alpha)
  const pyp = lerp(p.py, p.y, alpha)
  const pr = Math.max(p.radius, 4 / cam.ppm)
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.beginPath(); ctx.ellipse(pxp + 0.03, pyp + 0.05, pr * 0.62 * 1.05, pr * 0.62 * 0.85, 0, 0, Math.PI * 2); ctx.fill()

  // porteros: el ÚNICO que usa casco y protecciones en hockey sobre patines
  for (const g of w.goalies) {
    const gx = lerp(g.px, g.x, alpha)
    const gy = lerp(g.py, g.y, alpha)
    const c = o.colors[g.side]
    const facing = g.side === 0 ? 0 : Math.PI // side 0 mira hacia +x (su red queda a la izquierda), side 1 hacia -x
    ctx.save()
    ctx.translate(gx, gy)
    // sombra
    ctx.fillStyle = "rgba(0,0,0,0.35)"
    ctx.beginPath(); ctx.ellipse(0.05, 0.1, g.radius * 1.05, g.radius * 0.9, 0, 0, Math.PI * 2); ctx.fill()
    // palo: el arquero de hockey patín también juega con stick, y es el MISMO reglamentario que el de los
    // jugadores (Art. 16.6 del Reglamento Técnico de World Skate: de 90 a 115 cm, madera o plástico, base
    // plana, debe pasar por un aro de 5 cm — nada de la paleta ancha del hockey hielo). Se dibuja con el
    // mismo largo que el de un patinador (~0.9 m desde la mano) y sigue a la pelota, apoyado en el piso.
    // Solo dibujo: no cambia la física del arquero.
    const sa = goalieStickAngle(facing, 0, 0, pxp - gx, pyp - gy)
    ctx.strokeStyle = "#8b5a2b"
    ctx.lineWidth = 0.1
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(Math.cos(sa) * g.radius * 0.5, Math.sin(sa) * g.radius * 0.5)
    ctx.lineTo(Math.cos(sa) * (g.radius + 0.62), Math.sin(sa) * (g.radius + 0.62))
    ctx.stroke()
    // peto/cuerpo (color de equipo, más voluminoso que un patinador: ya lo transmite el radio)
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(0, 0, g.radius, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = "rgba(0,0,0,0.6)"
    ctx.lineWidth = 0.06
    ctx.beginPath(); ctx.arc(0, 0, g.radius, 0, Math.PI * 2); ctx.stroke()
    // hombreras: dos almohadillas claras a los lados, para que se lea "equipado"
    ctx.fillStyle = "rgba(230,233,238,0.95)"
    ctx.beginPath(); ctx.ellipse(0, -g.radius * 0.8, g.radius * 0.36, g.radius * 0.24, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(0, g.radius * 0.8, g.radius * 0.36, g.radius * 0.24, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = "rgba(0,0,0,0.35)"
    ctx.lineWidth = 0.03
    ctx.stroke()
    // casco: cúpula rígida que cubre toda la cabeza, con rejilla/máscara al frente
    ctx.rotate(facing)
    const hr = g.radius * 0.62
    ctx.fillStyle = "#e7eaef"
    ctx.beginPath(); ctx.arc(g.radius * 0.08, 0, hr, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = "rgba(0,0,0,0.55)"
    ctx.lineWidth = 0.045
    ctx.stroke()
    // banda de color del equipo en el casco
    ctx.strokeStyle = c
    ctx.lineWidth = hr * 0.28
    ctx.beginPath(); ctx.arc(g.radius * 0.08, 0, hr * 0.78, Math.PI * 0.82, Math.PI * 1.18); ctx.stroke()
    // rejilla de la máscara sobre la cara
    ctx.strokeStyle = "rgba(20,20,20,0.7)"
    ctx.lineWidth = 0.035
    for (const t of [-0.5, 0, 0.5]) {
      ctx.beginPath()
      ctx.moveTo(g.radius * 0.08 + hr * 0.1, hr * t)
      ctx.lineTo(g.radius * 0.08 + hr * 0.98, hr * t)
      ctx.stroke()
    }
    ctx.rotate(-facing)
    if (w.defCombo && w.defCombo.side === g.side && w.defCombo.touches > 0) {
      // Defensa armándose (la atajada garantizada): el arquero es quien la cobra, el aro late en él.
      const t = w.defCombo.touches
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (260 - t * 40))
      ctx.save()
      ctx.globalAlpha = 0.55 + 0.35 * pulse
      ctx.strokeStyle = c
      ctx.lineWidth = 0.06 + t * 0.03 + pulse * 0.03
      ctx.beginPath(); ctx.arc(0, 0, g.radius + 0.32 + t * 0.07, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }

  // Aura de equipo: solo si hay un humano (no en el demo IA vs IA).
  const hs = o.humanSide ?? null
  const live = w.phase === "play" || w.phase === "timeOn"
  const aura = hs === null ? "#ffffff" : auraColor(o.colors[hs], FLOOR[w.surface].base)
  const cue = hs === null ? "#facc15" : pickCueColor(o.colors[hs])
  const humanCarrier = hs !== null && live && w.puck.carrierId && w.puck.carrierId === o.controlledId
    ? w.skaters.find((k) => k.id === w.puck.carrierId && k.side === hs)
    : undefined
  // A quién iría el toque suelto (pase automático): solo mientras yo llevo la bocha.
  const passId = humanCarrier ? bestPassTarget(w, humanCarrier.id) : null
  const passTo = passId ? w.skaters.find((k) => k.id === passId) : undefined
  if (humanCarrier && passTo) {
    // hilo tenue del portador al receptor: se ve el carril del pase
    ctx.save()
    ctx.strokeStyle = PASS_GREEN
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 0.07
    ctx.lineCap = "round"
    ctx.setLineDash([0.12, 0.22])
    ctx.beginPath()
    ctx.moveTo(lerp(humanCarrier.px, humanCarrier.x, alpha), lerp(humanCarrier.py, humanCarrier.y, alpha))
    ctx.lineTo(lerp(passTo.px, passTo.x, alpha), lerp(passTo.py, passTo.y, alpha))
    ctx.stroke()
    ctx.restore()
  }

  for (const s of w.skaters) {
    const comboTouches = s.id === w.puck.carrierId && w.attackCombo?.side === s.side ? w.attackCombo.touches : 0
    const controlled = s.id === o.controlledId
    const look: Look = {
      mine: hs !== null && s.side === hs && !controlled,
      aura,
      cue,
      passTarget: s.id === passId,
      ppm: cam.ppm,
    }
    drawSkater(ctx, s, o.colors[s.side], alpha, controlled, s.id === w.puck.carrierId, comboTouches, look)
  }

  // bocha (no disco de NHL, y NO una pelota de básquet): esfera chica y dura, sin el borde negro
  // grueso que la hace leer como básquetbol — un brillo angosto y compacto, nomás.
  const bpr = pr * 0.62
  ctx.fillStyle = "#9a3412"
  ctx.beginPath(); ctx.arc(pxp, pyp, bpr, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "#ea580c"
  ctx.beginPath(); ctx.arc(pxp, pyp, bpr * 0.92, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "rgba(255,255,255,0.65)"
  ctx.beginPath(); ctx.ellipse(pxp - bpr * 0.3, pyp - bpr * 0.3, bpr * 0.22, bpr * 0.14, -0.6, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = "rgba(0,0,0,0.28)"
  ctx.lineWidth = bpr * 0.1
  ctx.beginPath(); ctx.arc(pxp, pyp, bpr * 0.97, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  if (hs !== null && live) drawTeammateEdges(ctx, w, cam, o, o.controlledId, o.colors[hs], passId, alpha)
}

export interface EdgeChip { id: string; x: number; y: number; angle: number }

/**
 * Dónde va la flecha de cada compañero que queda FUERA de cuadro (siempre, con o sin la bocha).
 * Lo comparten el dibujo y el toque: tocar una flecha le pasa a ese compañero.
 */
export function teammateEdgeChips(w: World, cam: Camera, humanSide: Side, controlledId: string | null, alpha: number): EdgeChip[] {
  const vw = cam.vw
  const vh = cam.vh
  const margin = 24
  const rects = hudAvoidRects(vw, vh)
  const out: EdgeChip[] = []
  for (const t of w.skaters) {
    if (t.side !== humanSide || t.id === controlledId) continue
    const sp = cam.toScreen(lerp(t.px, t.x, alpha), lerp(t.py, t.y, alpha))
    // se ve mientras asome al menos ~la mitad de su radio; recién ahí lo reemplaza la flecha
    const raw = edgeAnchor(sp.x, sp.y, vw, vh, margin, t.radius * cam.ppm * 0.5)
    if (!raw) continue
    const a = slideOffRects(raw, rects, vw, vh, margin, 16)
    out.push({ id: t.id, x: a.x, y: a.y, angle: a.angle })
  }
  return out
}

/** Radio (px) del chip de la flecha de borde. */
export const EDGE_CHIP_R = 11

/**
 * Flechas de borde para los compañeros que quedan FUERA de cuadro (siempre, con o sin la bocha): la
 * cámara que sigue la jugada muestra 4-5 jugadores y, sin esto, el resto no se puede ubicar. Cada
 * flecha es un chip del COLOR DEL EQUIPO con el dorsal, apuntando hacia el compañero; con el aro
 * claro se lee aunque el equipo sea oscuro. Si llevo la bocha, la del pase automático lleva aro
 * verde. Se corre para no tapar la placa ni los botones. Tocar una flecha pasa a ese compañero.
 */
function drawTeammateEdges(ctx: CanvasRenderingContext2D, w: World, cam: Camera, o: DrawOptions, controlledId: string | null, fill: string, passId: string | null, alpha: number) {
  const hs = o.humanSide ?? 0
  ctx.save()
  for (const a of teammateEdgeChips(w, cam, hs, controlledId, alpha)) {
    const R = EDGE_CHIP_R
    const isPass = a.id === passId
    ctx.save()
    ctx.translate(a.x, a.y)
    // punta que apunta hacia el compañero
    ctx.rotate(a.angle)
    ctx.fillStyle = isPass ? PASS_GREEN : "rgba(255,255,255,0.92)"
    ctx.beginPath(); ctx.moveTo(R + 8, 0); ctx.lineTo(R - 1, -6); ctx.lineTo(R - 1, 6); ctx.closePath(); ctx.fill()
    ctx.rotate(-a.angle)
    // chip con el dorsal
    ctx.fillStyle = fill
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = isPass ? 3 : 2
    ctx.strokeStyle = isPass ? PASS_GREEN : "rgba(255,255,255,0.92)"
    ctx.stroke()
    ctx.font = `800 ${R * 1.05}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.lineWidth = 3
    ctx.strokeStyle = "rgba(0,0,0,0.7)"
    const num = a.id.slice(1)
    ctx.strokeText(num, 0, 1)
    ctx.fillStyle = "#fff"
    ctx.fillText(num, 0, 1)
    ctx.restore()
  }
  ctx.restore()
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
}

/**
 * Mini tarjeta azul con cuenta regresiva, pegada al escudo de cada equipo en el marcador, por cada
 * jugador expulsado (`world.bench`) que le falta volver. `outward` es -1 (equipo 0, escudo a la
 * izquierda: la tarjeta cuelga hacia afuera, a la izquierda) o 1 (equipo 1, cuelga a la derecha) —
 * así nunca tapa el reloj del centro. Con dos expulsados del mismo equipo (tope de la regla), se
 * apilan una arriba de la otra, más chicas.
 */
function drawPenaltyBadges(
  ctx: CanvasRenderingContext2D, w: World, side: Side,
  crestCx: number, crestCy: number, crestFs: number, outward: 1 | -1, fontFamily: string,
) {
  const list = w.bench.filter((b) => b.side === side)
  if (list.length === 0) return
  const shown = list.slice(0, 2)
  // Más grande que la primera versión: a ese tamaño se perdía contra el resto del marcador y
  // costaba notar que había una expulsión en curso — con brillo azul propio para que salte a la vista.
  const cw = crestFs * (shown.length > 1 ? 0.62 : 0.74)
  const ch = cw * 1.3
  const cx = crestCx + outward * (crestFs * 0.5 + cw * 0.48)
  ctx.save()
  shown.forEach((b, i) => {
    const cy = crestCy - (shown.length - 1) * ch * 0.42 + i * ch * 0.84
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(outward * 0.16) // leve inclinación, como una tarjeta real cayendo
    ctx.shadowColor = "#3b82f6"
    ctx.shadowBlur = cw * 0.5
    ctx.fillStyle = "#1d4ed8"
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = Math.max(1.2, cw * 0.09)
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(-cw / 2, -ch / 2, cw, ch, cw * 0.16); else ctx.rect(-cw / 2, -ch / 2, cw, ch)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.stroke()
    ctx.fillStyle = "#fff"
    ctx.font = `800 ${ch * 0.58}px ${fontFamily}, system-ui`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.lineWidth = Math.max(1, ch * 0.06)
    ctx.strokeStyle = "rgba(0,0,0,0.6)"
    const label = String(Math.max(0, Math.ceil(b.timer)))
    ctx.strokeText(label, 0, ch * 0.03)
    ctx.fillText(label, 0, ch * 0.03)
    ctx.restore()
  })
  ctx.restore()
}

const SB_GREEN = "#a6e19f" // verde de los dígitos de la placa de ardisport.cl
const SB_PANEL = "#020402"
const SB_EDGE = "#2b372b"
const SB_BOX = "#050805"
const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',system-ui,sans-serif"

/**
 * Marcador chico en la esquina, con el look de la placa de transmisión de ardisport.cl: fondo negro,
 * cajas de dos cifras y dígitos verdes GRUESOS. Los números y letras se DIBUJAN a trazo
 * (`drawGlyphs`), no se escriben con `ctx.font`: así no dependen de ninguna fuente y no salen flacos.
 * Arriba: escudo, reloj, escudo. Abajo: puntos, faltas, faltas, puntos. La franja de color de cada
 * caja de puntos es el color del equipo en la cancha. El combo son lámparas debajo; la energía, una
 * rayita al pie.
 */
export function drawHud(ctx: CanvasRenderingContext2D, w: World, o: DrawOptions, hudW: number, hudH: number) {
  const vw = hudW
  const vh = hudH
  const { boxW, boxH: fullH } = plateSize(vw, vh)
  const boxH = fullH - PLATE_BRAND_H // alto del marcador en sí (sin la tira de marca de arriba)
  const bx = 8
  const by0 = 8 // borde de arriba de la placa
  const by = by0 + PLATE_BRAND_H // donde empieza el marcador, debajo de la tira de marca
  const radius = 10
  const pad = Math.max(4, boxH * 0.07)
  const gap = Math.max(3, boxW * 0.022)
  const topH = boxH * 0.34
  const botH = boxH * 0.46
  const topY = by + pad
  const botY = by + boxH - pad - botH - Math.max(2, boxH * 0.03)
  const scoreW = boxW * 0.27
  const faltaW = boxW * 0.17

  const sc = [bx + pad, bx + boxW - pad - scoreW] // x de las cajas de puntos
  const fl = [sc[0] + scoreW + gap, sc[1] - gap - faltaW] // x de las cajas de faltas
  const clockX = sc[0] + scoreW + gap
  const clockW = sc[1] - gap - clockX

  const box = (x: number, y: number, bw: number, bh: number, edge = SB_EDGE) => {
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, Math.min(8, bh * 0.22)); else ctx.rect(x, y, bw, bh)
    ctx.fillStyle = SB_BOX
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = edge
    ctx.stroke()
  }

  ctx.save()
  // panel
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(bx, by0, boxW, fullH, radius); else ctx.rect(bx, by0, boxW, fullH)
  ctx.fillStyle = SB_PANEL
  ctx.globalAlpha = 0.94
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 1
  ctx.strokeStyle = "rgba(255,255,255,0.14)"
  ctx.stroke()
  ctx.save()
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(bx, by0, boxW, fullH, radius); else ctx.rect(bx, by0, boxW, fullH)
  ctx.clip()

  // ---- tira de marca arriba: ARDISPORT.CL (el marcador es el de ardisport.cl) ----
  const bh = PLATE_BRAND_H - 3.5
  drawGlyphs(ctx, "ARDISPORT.CL", bx + boxW / 2, by0 + 2.6, bh, { color: "rgba(166,225,159,0.8)", align: "center", stroke: 0.19 })

  // ---- fila de arriba: escudo · RELOJ · escudo ----
  const crestFs = topH * 0.86
  ctx.font = `${crestFs}px ${EMOJI_FONT}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillStyle = "#fff"
  const live = w.phase === "goal" || w.phase === "ended"
  ctx.fillText(o.crests[0], sc[0] + scoreW / 2, topY + topH / 2 + 1)
  ctx.fillText(o.crests[1], sc[1] + scoreW / 2, topY + topH / 2 + 1)
  drawPenaltyBadges(ctx, w, 0, sc[0] + scoreW / 2, topY + topH / 2 + 1, crestFs, -1, o.fontFamily)
  drawPenaltyBadges(ctx, w, 1, sc[1] + scoreW / 2, topY + topH / 2 + 1, crestFs, 1, o.fontFamily)

  const blink = w.clock <= 10 && Math.floor(performance.now() / 350) % 2 === 0
  box(clockX, topY, clockW, topH, w.clock <= 10 && !live ? "#7f1d1d" : "#3a1212")
  const dh = topH * 0.66
  const dy = topY + (topH - dh) / 2
  if (live) {
    const label = w.phase === "ended" ? "FIN" : o.comboGoal ? "GOLAZO" : "GOL"
    drawGlyphs(ctx, label, clockX + clockW / 2, dy, dh, { color: w.phase === "ended" ? "#e5e7eb" : "#fde047", align: "center", stroke: 0.2 })
  } else {
    const color = blink ? "#7f1d1d" : w.clock <= 10 ? "#f87171" : SB_GREEN
    drawGlyphs(ctx, fmtClock(w.clock), clockX + clockW / 2, dy, dh, { color, align: "center", stroke: 0.2 })
  }

  // ---- fila de abajo: PUNTOS · FALTAS ... FALTAS · PUNTOS ----
  const goalPop = goalBumpScale(w)
  const two = (n: number) => String(Math.min(99, n)).padStart(2, "0")
  for (const side of [0, 1] as const) {
    const x = sc[side]
    const scoring = w.phase === "goal" && (w.puck.lastTouchSide ?? 0) === side
    ctx.save()
    if (scoring) {
      ctx.translate(x + scoreW / 2, botY + botH / 2)
      ctx.scale(goalPop, goalPop)
      ctx.translate(-(x + scoreW / 2), -(botY + botH / 2))
    }
    box(x, botY, scoreW, botH)
    // franja del color del equipo en la cancha: une la caja con sus jugadores
    ctx.fillStyle = o.colors[side]
    ctx.fillRect(x + 4, botY + 2, scoreW - 8, Math.max(2, botH * 0.07))
    const sh = botH * 0.62
    drawGlyphs(ctx, two(w.score[side]), x + scoreW / 2, botY + botH * 0.2 + (botH * 0.72 - sh) / 2, sh, { color: SB_GREEN, align: "center", stroke: 0.21 })
    ctx.restore()
  }
  const showLabel = botH >= 34
  for (const side of [0, 1] as const) {
    const x = fl[side]
    box(x, botY, faltaW, botH)
    const lh = botH * 0.17
    const nh = showLabel ? botH * 0.42 : botH * 0.56
    if (showLabel) drawGlyphs(ctx, "FALTA", x + faltaW / 2, botY + botH * 0.1, lh, { color: "rgba(255,255,255,0.85)", align: "center", stroke: 0.17 })
    drawGlyphs(ctx, two(w.fouls[side]), x + faltaW / 2, showLabel ? botY + botH * 0.42 : botY + (botH - nh) / 2, nh, { color: SB_GREEN, align: "center", stroke: 0.2 })
  }

  // destello de quien acaba de anotar (dentro de su caja de puntos)
  if (w.phase === "goal") {
    const scorer = w.puck.lastTouchSide ?? 0
    const flashT = 1 - Math.min(1, (MATCH.goalPause - w.phaseTimer) / 0.5)
    if (flashT > 0) {
      ctx.globalAlpha = flashT * 0.4
      ctx.fillStyle = o.colors[scorer]
      ctx.fillRect(sc[scorer], botY, scoreW, botH)
      ctx.globalAlpha = 1
    }
  }

  // energía: raya al pie de la placa, del lado del equipo humano únicamente. Antes era una línea de
  // 3-4px casi del color del fondo — se notaba menos que el cuerpo apagado del jugador cansado. Ahora
  // es más gruesa, con una pista de fondo visible y parpadea en rojo cuando queda crítica.
  const controlled = w.skaters.find((k) => k.id === o.controlledId)
  if (controlled) {
    const side = controlled.side
    const pct = Math.max(0, Math.min(1, controlled.stamina / 100))
    const half = boxW / 2
    const ex = side === 0 ? bx : bx + half
    const eh = Math.max(6, boxH * 0.09)
    const ey = by + boxH - eh
    const critical = pct < 0.25 && Math.floor(performance.now() / 300) % 2 === 0
    ctx.fillStyle = "rgba(255,255,255,0.16)"
    ctx.fillRect(ex, ey, half, eh)
    ctx.fillStyle = critical ? "#ef4444" : pct < 0.25 ? "#f87171" : pct < 0.5 ? "#fbbf24" : "#4ade80"
    ctx.fillRect(ex, ey, Math.max(0, half * pct), eh)
    ctx.strokeStyle = "rgba(255,255,255,0.4)"
    ctx.lineWidth = 1
    ctx.strokeRect(ex + 0.5, ey + 0.5, half - 1, eh - 1)
  }

  ctx.restore() // clip
  ctx.restore() // save principal

  drawComboLamps(ctx, w, o, bx + boxW / 2, by + boxH + 8)

  if (o.showHint) drawActionHint(ctx, o, vw, vh)
  if (o.demo) drawDemoCaption(ctx, o, vw, vh)
}

/** 1 -> 1.35 -> 1 en los primeros ~0.4s del festejo de gol, derivado del propio phaseTimer del
 *  mundo (sin estado nuevo en match.ts). Fuera de la fase de gol, siempre 1. */
function goalBumpScale(w: World): number {
  if (w.phase !== "goal") return 1
  const elapsed = MATCH.goalPause - w.phaseTimer
  const dur = 0.4
  if (elapsed >= dur) return 1
  const t = elapsed / dur
  // sube rápido a 1.35 y vuelve a 1: dos mitades de una curva simple
  return t < 0.4 ? 1 + (0.35 * t) / 0.4 : 1.35 - (0.35 * (t - 0.4)) / 0.6
}

/** Combo = cuatro lámparas bajo la caja del reloj (ataque: ○○○★, defensa: ○○○🧤). Sin combo
 *  armado (touches 0), no se dibuja nada — nunca una oración tipo "TOQUE · TOQUE · TOQUE". */
/** Lámparas de combo, centradas en `cx` (coordenada absoluta, no un ancho a partir en dos). */
function drawComboLamps(ctx: CanvasRenderingContext2D, w: World, o: DrawOptions, cx: number, topY: number) {
  const combo = (w.attackCombo && w.attackCombo.touches > 0 && w.attackCombo) || (w.defCombo && w.defCombo.touches > 0 && w.defCombo)
  if (!combo) return
  const isAttack = w.attackCombo === combo
  const r = 9
  const gap = r * 2.6
  const y = topY + r
  const total = gap * 3
  const x0 = cx - total / 2
  ctx.save()
  for (let i = 0; i < 4; i++) {
    const cx = x0 + gap * i
    const lit = i < combo.touches
    ctx.beginPath()
    ctx.arc(cx, y, r, 0, Math.PI * 2)
    ctx.fillStyle = lit ? o.colors[combo.side] : "rgba(255,255,255,0.12)"
    ctx.fill()
    if (lit) {
      ctx.save()
      ctx.shadowColor = o.colors[combo.side]
      ctx.shadowBlur = r * 1.6
      ctx.fill()
      ctx.restore()
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)"
    ctx.lineWidth = Math.max(1, r * 0.14)
    ctx.stroke()
    if (i === 3) {
      ctx.font = `${r * 1.5}px ${o.fontFamily}, system-ui`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = lit ? "#0b0f16" : "rgba(255,255,255,0.5)"
      ctx.fillText(isAttack ? "★" : "🧤", cx, y + r * 0.05)
    }
  }
  ctx.restore()
}

/** Hint chico abajo, solo hasta la primera acción del equipo humano (pase o tiro). */
function drawActionHint(ctx: CanvasRenderingContext2D, o: DrawOptions, vw: number, vh: number) {
  const fs = Math.max(10, Math.min(14, vh * 0.03))
  ctx.save()
  ctx.font = `600 ${fs}px ${o.fontFamily}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const y = vh - fs * 1.6
  let text = "Tocá a un compañero = pase · deslizá a la derecha = pasar/tirar"
  if (ctx.measureText(text).width + fs * 1.4 > vw - 16) text = "Tocá compañero = pase · Deslizá = tiro"
  const tw = ctx.measureText(text).width + fs * 1.4
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  const bx = vw / 2 - tw / 2
  const bh = fs * 1.7
  ctx.roundRect ? ctx.roundRect(bx, y - bh / 2, tw, bh, bh / 2) : ctx.rect(bx, y - bh / 2, tw, bh)
  ctx.fill()
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.fillText(text, vw / 2, y)
  ctx.restore()
}

/** "TOCÁ PARA JUGAR" pulsando abajo, mientras el demo (IA vs IA) corre solo. */
function drawDemoCaption(ctx: CanvasRenderingContext2D, o: DrawOptions, vw: number, vh: number) {
  const fs = Math.max(12, Math.min(18, vh * 0.038))
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260)
  const text = "TOCÁ PARA JUGAR"
  ctx.save()
  ctx.font = `bold ${fs}px ${o.fontFamily}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const y = vh - fs * 1.8
  const tw = ctx.measureText(text).width + fs * 1.6
  const bh = fs * 1.9
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  const bx = vw / 2 - tw / 2
  ctx.roundRect ? ctx.roundRect(bx, y - bh / 2, tw, bh, bh / 2) : ctx.rect(bx, y - bh / 2, tw, bh)
  ctx.fill()
  ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`
  ctx.fillText(text, vw / 2, y)
  ctx.restore()
}
