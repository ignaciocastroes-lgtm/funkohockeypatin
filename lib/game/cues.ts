/**
 * Señales visuales para "quién es de mi equipo". Todo acá es puro (sin canvas ni DOM) para poder
 * testearlo: draw.ts solo dibuja lo que este módulo decide.
 *
 * Por qué existe: el color de equipo era el ÚNICO canal (un aro fino alrededor de la cabeza), y
 * fallaba en tres casos medidos sobre las 12 selecciones de fábrica:
 *  - Brasil (#ffdf00) y Angola (#f9a01b) se confundían con el amarillo/naranja de los marcadores
 *    de "lo controlás" y "lleva la bocha".
 *  - Equipos oscuros (Francia, EE.UU., México, Portugal) casi no se separan del piso (EE.UU. sobre
 *    sintético: distancia 29 de ~765).
 *  - Con la cámara que sigue la jugada, los compañeros fuera de cuadro no se ven de ninguna forma.
 */

import type { Surface } from "../engine"

/** Color base de cada pista (fuente única: draw.ts pinta el piso con estos y los tests los recorren). */
export const FLOOR_BASE: Record<Surface, string> = {
  madera: "#3a2a1a",
  cemento: "#2b2d33",
  sintetico: "#173a5a",
}

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Distancia perceptual aproximada entre dos colores (0..~765). Fórmula "redmean". */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const rm = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

function mixWhite(hex: string, t: number): string {
  const [r, g, b] = rgb(hex)
  const m = (v: number) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")
  return `#${m(r)}${m(g)}${m(b)}`
}

/** Colores candidatos para el marcador de "lo controlás", en orden de preferencia. */
export const CUE_CANDIDATES = ["#facc15", "#ffffff", "#22d3ee", "#f472b6"] as const
export const CUE_MIN_DISTANCE = 250

/**
 * Color del marcador de "lo controlás": el primero de la lista que se separa bien del color del
 * equipo. Amarillo por defecto; blanco si el equipo es amarillo/naranja (Brasil, Angola).
 */
export function pickCueColor(teamColor: string): string {
  let best: string = CUE_CANDIDATES[0]
  let bestD = -1
  for (const c of CUE_CANDIDATES) {
    const d = colorDistance(teamColor, c)
    if (d >= CUE_MIN_DISTANCE) return c
    if (d > bestD) { best = c; bestD = d }
  }
  return best
}

export const AURA_MIN_CONTRAST = 200

/**
 * Color del aura de un compañero: el del equipo, aclarado hacia blanco solo lo necesario para que se
 * separe del piso. Un azul marino sobre una pista azul no se ve; el mismo azul aclarado sí.
 */
export function auraColor(teamColor: string, floorBase: string): string {
  let c = teamColor
  for (const t of [0, 0.3, 0.5, 0.7, 0.85]) {
    c = t === 0 ? teamColor : mixWhite(teamColor, t)
    if (colorDistance(c, floorBase) >= AURA_MIN_CONTRAST) return c
  }
  return c
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Tamaño de la placa del marcador (compartido con drawHud para que ambos coincidan). */
/** Alto (px) de la tira de marca "ARDISPORT.CL" arriba de la placa. Se suma al alto del marcador. */
export const PLATE_BRAND_H = 10

export function plateSize(vw: number, vh: number): { boxW: number; boxH: number } {
  return {
    boxW: Math.max(184, Math.min(vw * 0.46, 260)),
    // el marcador en sí (56..86) más la tira de marca arriba
    boxH: Math.max(56, Math.min(vh * 0.22, 86)) + PLATE_BRAND_H,
  }
}

/**
 * Zonas de pantalla ocupadas por la interfaz fija: la placa del marcador (con sus lámparas de combo,
 * arriba a la izquierda) y los 4 botones de pausa/vista/pantalla/sonido (arriba a la derecha: abajo a
 * la izquierda tapaban jugadores y quedaban justo bajo el pulgar del joystick).
 */
export function hudAvoidRects(vw: number, vh: number): Rect[] {
  const { boxW, boxH } = plateSize(vw, vh)
  const buttonsW = 8 + 5 * 46 + 4 * 8 // hasta 5 botones de 46 px con 8 px de separación (pausa/vista/pantalla/sonido/música)
  return [
    { x0: 0, y0: 0, x1: 8 + boxW, y1: 8 + boxH + 34 },
    { x0: vw - buttonsW, y0: 0, x1: vw, y1: 8 + 46 + 6 },
  ]
}

export interface EdgeAnchor { x: number; y: number; angle: number }

/**
 * Si el punto de pantalla (sx, sy) queda fuera del cuadro, devuelve dónde dibujar su flecha: sobre el
 * borde (a `margin` px hacia adentro), en la línea que va del centro de la pantalla hacia el punto.
 * Devuelve null si el punto se ve (no hace falta flecha).
 *
 * `visiblePad` separa "se ve" de "dónde dibujo": el punto cuenta como visible mientras esté dentro
 * de la pantalla agrandada `visiblePad` px por cada lado (por defecto, achicada `margin`, o sea el
 * mismo rectángulo donde se dibuja). Pasando el radio del jugador en píxeles, un compañero que asoma
 * a medias por el borde NO recibe flecha (se lo ve), y uno que ya casi no se ve, sí.
 */
export function edgeAnchor(sx: number, sy: number, vw: number, vh: number, margin: number, visiblePad = -margin): EdgeAnchor | null {
  if (sx >= -visiblePad && sx <= vw + visiblePad && sy >= -visiblePad && sy <= vh + visiblePad) return null
  const cx = vw / 2
  const cy = vh / 2
  const dx = sx - cx
  const dy = sy - cy
  const kx = dx === 0 ? Infinity : (vw / 2 - margin) / Math.abs(dx)
  const ky = dy === 0 ? Infinity : (vh / 2 - margin) / Math.abs(dy)
  const k = Math.min(kx, ky)
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) }
}

/**
 * Si la flecha cae sobre la interfaz fija, la corre a lo largo del borde, alejándose de ella, hasta
 * dejarla libre. (Sobre el borde de arriba/abajo se mueve en x; sobre los de los costados, en y.)
 */
export function slideOffRects(a: EdgeAnchor, rects: Rect[], vw: number, vh: number, margin: number, pad: number): EdgeAnchor {
  let { x, y } = a
  const onHorizontalEdge = Math.abs(y - margin) < 1 || Math.abs(y - (vh - margin)) < 1
  for (const r of rects) {
    if (x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad) {
      if (onHorizontalEdge) x = (r.x0 + r.x1) / 2 < vw / 2 ? r.x1 + pad : r.x0 - pad
      else y = (r.y0 + r.y1) / 2 < vh / 2 ? r.y1 + pad : r.y0 - pad
    }
  }
  x = Math.max(margin, Math.min(vw - margin, x))
  y = Math.max(margin, Math.min(vh - margin, y))
  return { x, y, angle: a.angle }
}

const FONT_FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif"

/**
 * Familia de fuente VÁLIDA para `ctx.font`. El canvas no resuelve `var(--font-orbitron)`: con una
 * variable CSS la asignación entera se ignora y el texto sale en `10px sans-serif`. Por eso se lee
 * el valor real de la variable (`getComputedStyle(el).getPropertyValue("--font-orbitron")`) y se
 * arma la lista acá; si la variable no existe (build standalone) queda solo la de sistema.
 */
export function canvasFontFamily(cssVarValue: string | null | undefined): string {
  const v = (cssVarValue ?? "").trim()
  if (!v || /var\(/.test(v)) return FONT_FALLBACK
  return `${v}, ${FONT_FALLBACK}`
}

/** Máximo giro (rad) del palo del arquero respecto a hacia dónde mira: ~66°. No lo cruza por detrás del cuerpo. */
export const GOALIE_STICK_MAX_TURN = 1.15

/**
 * Hacia dónde apunta el palo del arquero: sigue a la pelota (como lo hace un arquero, con el palo
 * apoyado en el piso cerrando el ángulo) pero sin girar más de ~66° de hacia donde mira.
 */
export function goalieStickAngle(facing: number, gx: number, gy: number, puckX: number, puckY: number): number {
  const to = Math.atan2(puckY - gy, puckX - gx)
  const d = Math.atan2(Math.sin(to - facing), Math.cos(to - facing)) // diferencia con signo en (-π, π]
  return facing + Math.max(-GOALIE_STICK_MAX_TURN, Math.min(GOALIE_STICK_MAX_TURN, d))
}
