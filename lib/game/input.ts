/**
 * Entrada táctil. Lógica PURA (sin DOM) para poder probarla con tests.
 *
 * Un solo esquema (estilo consola): TODA la pantalla es el stick de movimiento (joystick flotante,
 * nace donde apoyás el primer dedo) y el pase/tiro/quitar salen de los 4 botones en rombo, que son
 * DOM aparte (ver `match.ts`). El stick además es la DIRECCIÓN del tiro y apunta el pase.
 *  - PASE DE UN DEDO: un toque rápido (corto, sin arrastrar) es un `tap` con su posición en pantalla.
 *    Si cae sobre un compañero (o sobre su flecha de borde), el pase va a ese compañero. Es `strict`:
 *    si no cae sobre un compañero no hace nada (un toquecito para arrancar no regala la pelota).
 *  - Solo el primer dedo cuenta como stick; un segundo dedo en pantalla no hace nada.
 */

export type ActionEvent =
  | {
      kind: "tap"
      /** Dónde tocó (px de pantalla). Ausente si viene del teclado (Espacio). */
      x?: number
      y?: number
      /** true = vino del dedo de movimiento: solo vale si cae sobre un compañero. */
      strict?: boolean
    }
  | {
      /** Botones en rombo. CON la pelota: pase, pase fuerte, tiro, tiro fuerte (súper con estrella).
       *  SIN ella: quitar, quitar fuerte, jugador a la izquierda, jugador a la derecha. `power` es
       *  una constante por botón (sin medidor: apretar = patear ya). */
      kind: "button"
      action: "pase" | "pase-fuerte" | "tiro" | "tiro-fuerte"
      power: number
    }

/** Teclas de movimiento en escritorio: WASD y flechas, cualquiera de las dos funciona. */
const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}

/** Vector de movimiento (normalizado) a partir del set de `KeyboardEvent.code` apretados ahora mismo. */
export function keyboardVector(pressed: ReadonlySet<string>): { x: number; y: number } {
  let x = 0
  let y = 0
  for (const code of pressed) {
    const v = MOVE_KEYS[code]
    if (v) { x += v[0]; y += v[1] }
  }
  const m = Math.hypot(x, y)
  return m > 1 ? { x: x / m, y: y / m } : { x, y }
}

/** Espacio = tiro/pase automático (el "toque" de un dedo), para tirar sin mouse. */
export const isShootKey = (code: string): boolean => code === "Space"

/**
 * Dígito de una tecla física (fila de números o teclado numérico), o null si no es un dígito.
 * Se lee de `e.code`, NO de `e.key`: con Shift apretado `e.key` trae el símbolo ("!" en vez de "1"),
 * y el atajo secreto del entrenamiento (Shift + 0-1-7-8-9) usa justamente Shift.
 */
export function digitFromCode(code: string): string | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  return m ? m[1] : null
}

export interface TouchInputOptions {
  width: number
  height: number
  /** Solo cambia de qué lado se dibuja el pad fantasma (los botones los voltea `match.ts`). */
  leftHanded?: boolean
}

/** Un toque: recorre menos de esta fracción de la altura y dura menos de TAP_MAX_TIME.
 *  Un pulgar real nunca queda tan quieto como un test automatizado — en la mano el pase de un toque
 *  fallaba seguido porque el pulgar se corre un poco al levantar. Por eso el margen es ancho. */
const TAP_MAX_DIST = 0.065
const TAP_MAX_TIME = 0.35
/** Radio del joystick (fracción del lado corto de la pantalla). */
const STICK_RADIUS = 0.17
const DEADZONE = 0.12

export class TouchInput {
  width: number
  height: number
  leftHanded: boolean

  /** Vector de movimiento, magnitud <= 1. */
  moveX = 0
  moveY = 0

  /** Estado visible para dibujar el joystick. */
  stick: { ox: number; oy: number; cx: number; cy: number; radius: number } | null = null

  private fingerId: number | null = null
  // seguimiento del dedo, para reconocer un toque rápido (pase de un dedo)
  private mvT = 0
  private mvX = 0
  private mvY = 0
  private mvMaxDist = 0

  constructor(o: TouchInputOptions) {
    this.width = o.width
    this.height = o.height
    this.leftHanded = !!o.leftHanded
  }

  resize(w: number, h: number) { this.width = w; this.height = h }

  get radius(): number { return Math.min(this.width, this.height) * STICK_RADIUS }

  down(id: number, x: number, y: number, t: number) {
    if (this.fingerId !== null) return // solo el primer dedo es el stick
    this.fingerId = id
    this.stick = { ox: x, oy: y, cx: x, cy: y, radius: this.radius }
    this.moveX = 0
    this.moveY = 0
    this.mvT = t; this.mvX = x; this.mvY = y; this.mvMaxDist = 0
  }

  move(id: number, x: number, y: number, _t: number) {
    if (id !== this.fingerId || !this.stick) return
    const s = this.stick
    this.mvMaxDist = Math.max(this.mvMaxDist, Math.hypot(x - this.mvX, y - this.mvY))
    s.cx = x
    s.cy = y
    let dx = x - s.ox
    let dy = y - s.oy
    const d = Math.hypot(dx, dy)
    // joystick flotante: si te pasas del radio, la base te sigue
    if (d > s.radius) {
      const k = (d - s.radius) / d
      s.ox += dx * k
      s.oy += dy * k
      dx = x - s.ox
      dy = y - s.oy
    }
    const m = Math.min(1, Math.hypot(dx, dy) / s.radius)
    if (m < DEADZONE) { this.moveX = 0; this.moveY = 0; return }
    const n = (m - DEADZONE) / (1 - DEADZONE)
    const ang = Math.atan2(dy, dx)
    this.moveX = Math.cos(ang) * n
    this.moveY = Math.sin(ang) * n
  }

  /** Suelta un dedo. Si fue un toque rápido, devuelve el `tap` (pase de un dedo). */
  up(id: number, x: number, y: number, t: number): ActionEvent | null {
    if (id !== this.fingerId) return null
    this.fingerId = null
    this.stick = null
    this.moveX = 0
    this.moveY = 0
    // Toque rápido: nunca se alejó del punto de apoyo y duró poco = "tocar al compañero"
    const h = Math.max(1, this.height)
    const dist = Math.max(this.mvMaxDist, Math.hypot(x - this.mvX, y - this.mvY))
    if (dist < TAP_MAX_DIST * h && t - this.mvT <= TAP_MAX_TIME) return { kind: "tap", x, y, strict: true }
    return null
  }

  cancel(id: number) {
    if (id !== this.fingerId) return
    this.fingerId = null
    this.stick = null
    this.moveX = 0
    this.moveY = 0
  }
}
