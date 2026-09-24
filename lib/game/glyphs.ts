/**
 * Letras y dígitos del marcador dibujados a trazo (vectores), no con `ctx.font`.
 *
 * Por qué: el canvas no entiende `var(--font-orbitron)`, así que todo el texto del HUD caía en
 * `10px sans-serif` sin importar el tamaño pedido — flaco y diminuto. Estos glifos tienen el grosor
 * de una placa de transmisión (como la de ardisport.cl), escalan con la altura y no dependen de
 * ninguna fuente cargada.
 *
 * Cada glifo vive en una caja de ancho ~0.6 y alto 1, con el trazo (grosor `stroke`, en unidades de
 * alto) centrado sobre el camino. Las coordenadas ya están recogidas hacia adentro para que el
 * trazo grueso no se salga de la caja.
 */

type Ctx = Pick<CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "arc" | "ellipse" | "quadraticCurveTo" | "stroke" | "fill" |
  "save" | "restore" | "translate" | "scale" | "rotate" | "lineCap" | "lineJoin" | "lineWidth" | "strokeStyle" | "fillStyle"
>

const PI = Math.PI
// caja útil (recogida): x en [L, R], y en [T, B]
const L = 0.1, R = 0.5, T = 0.1, B = 0.9, CX = 0.3

interface Glyph {
  /** Ancho de avance (sin la separación entre letras). */
  adv: number
  draw: (c: Ctx) => void
  /** true: se rellena (puntos) en vez de trazarse. */
  fill?: boolean
}

const ring = (c: Ctx, cx: number, cy: number, rx: number, ry: number) => {
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, PI * 2); c.stroke()
}
const six = (c: Ctx) => {
  c.beginPath(); c.ellipse(CX, 0.66, 0.2, 0.24, 0, 0, PI * 2); c.stroke()
  c.beginPath(); c.moveTo(0.47, T); c.quadraticCurveTo(L, 0.14, L, 0.66); c.stroke()
}

const GLYPHS: Record<string, Glyph> = {
  "0": { adv: 0.6, draw: (c) => ring(c, CX, 0.5, 0.2, 0.4) },
  "1": { adv: 0.5, draw: (c) => { c.beginPath(); c.moveTo(0.12, 0.3); c.lineTo(0.34, T); c.lineTo(0.34, B); c.stroke() } },
  "2": { adv: 0.6, draw: (c) => { c.beginPath(); c.arc(CX, 0.3, 0.2, PI, 0, false); c.lineTo(L, B); c.lineTo(R, B); c.stroke() } },
  "3": { adv: 0.6, draw: (c) => { c.beginPath(); c.arc(0.29, 0.3, 0.19, -PI * 0.9, PI * 0.5, false); c.arc(0.29, 0.7, 0.2, -PI * 0.5, PI * 0.9, false); c.stroke() } },
  "4": { adv: 0.6, draw: (c) => { c.beginPath(); c.moveTo(0.38, B); c.lineTo(0.38, T); c.lineTo(L, 0.66); c.lineTo(R + 0.02, 0.66); c.stroke() } },
  "5": { adv: 0.6, draw: (c) => { c.beginPath(); c.moveTo(R - 0.02, T); c.lineTo(L + 0.03, T); c.lineTo(L + 0.02, 0.46); c.arc(0.29, 0.68, 0.21, -PI * 0.75, PI * 0.8, false); c.stroke() } },
  "6": { adv: 0.6, draw: six },
  "7": { adv: 0.6, draw: (c) => { c.beginPath(); c.moveTo(L, T); c.lineTo(R, T); c.lineTo(0.24, B); c.stroke() } },
  "8": { adv: 0.6, draw: (c) => { ring(c, CX, 0.29, 0.17, 0.19); ring(c, CX, 0.69, 0.2, 0.21) } },
  "9": { adv: 0.6, draw: (c) => { c.save(); c.translate(CX, 0.5); c.rotate(PI); c.translate(-CX, -0.5); six(c); c.restore() } },
  ":": { adv: 0.32, fill: true, draw: (c) => { for (const y of [0.3, 0.7]) { c.beginPath(); c.arc(0.16, y, 0.1, 0, PI * 2); c.fill() } } },
  " ": { adv: 0.35, draw: () => {} },
  // letras que usa la placa: FALTA, GOL, GOLAZO, FIN
  F: { adv: 0.55, draw: (c) => { c.beginPath(); c.moveTo(R, T); c.lineTo(L, T); c.lineTo(L, B); c.moveTo(L, 0.5); c.lineTo(0.42, 0.5); c.stroke() } },
  A: { adv: 0.66, draw: (c) => { c.beginPath(); c.moveTo(L, B); c.lineTo(CX + 0.03, T); c.lineTo(R + 0.06, B); c.moveTo(0.19, 0.64); c.lineTo(0.47, 0.64); c.stroke() } },
  L: { adv: 0.55, draw: (c) => { c.beginPath(); c.moveTo(L, T); c.lineTo(L, B); c.lineTo(R, B); c.stroke() } },
  T: { adv: 0.6, draw: (c) => { c.beginPath(); c.moveTo(L - 0.02, T); c.lineTo(R + 0.02, T); c.moveTo(CX, T); c.lineTo(CX, B); c.stroke() } },
  G: { adv: 0.62, draw: (c) => { c.beginPath(); c.ellipse(CX, 0.5, 0.2, 0.4, 0, -PI * 0.28, 0, true); c.lineTo(R, 0.54); c.lineTo(0.31, 0.54); c.stroke() } },
  O: { adv: 0.6, draw: (c) => ring(c, CX, 0.5, 0.2, 0.4) },
  Z: { adv: 0.6, draw: (c) => { c.beginPath(); c.moveTo(L, T); c.lineTo(R, T); c.lineTo(L, B); c.lineTo(R, B); c.stroke() } },
  I: { adv: 0.3, draw: (c) => { c.beginPath(); c.moveTo(0.15, T); c.lineTo(0.15, B); c.stroke() } },
  N: { adv: 0.62, draw: (c) => { c.beginPath(); c.moveTo(L, B); c.lineTo(L, T); c.lineTo(R, B); c.lineTo(R, T); c.stroke() } },
  // letras y punto de la marca "ARDISPORT.CL" (A, R, D, I, S, P, O, R, T, ., C, L)
  R: { adv: 0.62, draw: (c) => { c.beginPath(); c.moveTo(L, B); c.lineTo(L, T); c.lineTo(0.34, T); c.arc(0.34, 0.3, 0.2, -PI / 2, PI / 2, false); c.lineTo(L, 0.5); c.moveTo(0.3, 0.5); c.lineTo(R + 0.03, B); c.stroke() } },
  D: { adv: 0.62, draw: (c) => { c.beginPath(); c.moveTo(L, T); c.lineTo(0.28, T); c.ellipse(0.28, 0.5, 0.22, 0.4, 0, -PI / 2, PI / 2, false); c.lineTo(L, B); c.lineTo(L, T); c.stroke() } },
  S: { adv: 0.6, draw: (c) => { c.beginPath(); c.arc(CX, 0.29, 0.19, -PI * 0.2, PI * 0.5, true); c.arc(CX, 0.69, 0.2, -PI * 0.5, PI * 0.8, false); c.stroke() } },
  P: { adv: 0.6, draw: (c) => { c.beginPath(); c.moveTo(L, B); c.lineTo(L, T); c.lineTo(0.34, T); c.arc(0.34, 0.3, 0.2, -PI / 2, PI / 2, false); c.lineTo(L, 0.5); c.stroke() } },
  C: { adv: 0.6, draw: (c) => { c.beginPath(); c.ellipse(CX, 0.5, 0.2, 0.4, 0, -PI * 0.25, PI * 0.25, true); c.stroke() } },
  ".": { adv: 0.3, fill: true, draw: (c) => { c.beginPath(); c.arc(0.15, 0.82, 0.1, 0, PI * 2); c.fill() } },
}

/** Caracteres que se pueden dibujar (el resto se ignora, no rompe). */
export const GLYPH_CHARS = Object.keys(GLYPHS).join("")

const GAP = 0.09

/** Ancho en píxeles de `text` a altura `h` (lo que ocupa, sin el margen del último trazo). */
export function glyphWidth(text: string, h: number): number {
  let w = 0
  let n = 0
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch]
    if (!g) continue
    w += g.adv
    n++
  }
  return n === 0 ? 0 : (w + GAP * (n - 1)) * h
}

export interface GlyphStyle {
  color: string
  /** Grosor del trazo en unidades de alto (0.2 = grueso de marcador; 0.15 = para letras chicas). */
  stroke?: number
  align?: "left" | "center" | "right"
}

/**
 * Dibuja `text` con su borde superior en `y` y altura `h`. Devuelve el ancho dibujado.
 * `x` es el punto de anclaje según `align` (izquierda por defecto).
 */
export function drawGlyphs(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, style: GlyphStyle): number {
  const total = glyphWidth(text, h)
  const align = style.align ?? "left"
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x
  const stroke = style.stroke ?? 0.2
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.strokeStyle = style.color
  ctx.fillStyle = style.color
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch]
    if (!g) continue
    ctx.save()
    ctx.translate(cx, y)
    ctx.scale(h, h)
    ctx.lineWidth = stroke
    g.draw(ctx)
    ctx.restore()
    cx += (g.adv + GAP) * h
  }
  ctx.restore()
  return total
}
