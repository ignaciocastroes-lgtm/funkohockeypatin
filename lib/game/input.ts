/**
 * Entrada de dos dedos. Lógica PURA (sin DOM) para poder probarla con tests.
 *
 *  - Dedo de MOVIMIENTO (mitad izquierda): joystick flotante. Nace donde tocas.
 *  - Dedo de ACCIÓN (mitad derecha): estilo Angry Birds — tocás y ESTIRÁS hacia atrás (lejos de
 *    donde querés tirar), soltás y sale para el lado contrario, como una honda.
 *      · La dirección del tiro es la opuesta a hacia dónde estiraste.
 *      · Cuánto estiraste es la potencia (poco = pase, bien estirado = tiro fuerte).
 *      · Un toque sin estirar = pase automático al mejor compañero.
 *  - PASE DE UN DEDO: un toque rápido (corto, sin arrastrar) con CUALQUIER dedo, incluido el de
 *    movimiento, es un `tap` con su posición en pantalla. Si cae sobre un compañero (o sobre su flecha
 *    de borde), el pase va a ese compañero. El toque del dedo de movimiento es `strict`: si no cae
 *    sobre un compañero no hace nada (así un toquecito para arrancar no regala la pelota).
 *
 * Los roles se asignan por zona; si la zona de un rol está ocupada por otro dedo,
 * el dedo toma el rol que esté libre (así funciona también con una sola mano).
 */

export type ActionEvent =
  | { kind: "flick"; angle: number; vhPerSec: number }
  | {
      kind: "tap"
      /** Dónde tocó (px de pantalla). Ausente si viene del teclado (Espacio). */
      x?: number
      y?: number
      /** true = vino del dedo de movimiento: solo vale si cae sobre un compañero. */
      strict?: boolean
    }
  | {
      /** Esquema "botones": pase o tiro por botón, con medidor de potencia (0..1) en vez de gesto. */
      kind: "button"
      action: "pase" | "tiro"
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
  /** true = joystick a la derecha, acción a la izquierda. */
  leftHanded?: boolean
  /** Esquema "botones": no hay zona de acción — toda la pantalla es el stick de movimiento (el
   *  pase y el tiro salen de botones aparte, no de un gesto acá). */
  buttonsMode?: boolean
}

/** Un toque: recorre menos de esta fracción de la altura y dura menos de TAP_MAX_TIME.
 *  Un pulgar real nunca queda tan quieto como un test automatizado — 0.05/0.3 salían bien en los
 *  tests (que tocan con precisión de píxel) pero en la mano el pase de un toque fallaba seguido
 *  porque el pulgar se corre un poco al levantar. Más ancho acá, sin tocar FLICK_MIN_DIST. */
const TAP_MAX_DIST = 0.065
const TAP_MAX_TIME = 0.35
/** Recorrido mínimo (fracción de la altura) para que cuente como un estirón (si no, es un toque). */
export const FLICK_MIN_DIST = 0.05
/** Estirón que ya da la potencia máxima (fracción de la altura) — de ahí no sigue creciendo. */
export const FLICK_MAX_DIST = 0.32
/** Radio del joystick (fracción del lado corto de la pantalla). */
const STICK_RADIUS = 0.17
const DEADZONE = 0.12

type Role = "move" | "action"

export class TouchInput {
  width: number
  height: number
  leftHanded: boolean
  buttonsMode: boolean

  /** Vector de movimiento, magnitud <= 1. */
  moveX = 0
  moveY = 0

  /** Estado visible para dibujar el joystick. */
  stick: { ox: number; oy: number; cx: number; cy: number; radius: number } | null = null
  /** Estado visible para dibujar la línea de apuntado mientras el dedo de acción está abajo. */
  aim: { sx: number; sy: number; cx: number; cy: number } | null = null

  private roles = new Map<number, Role>()
  private startT = 0
  private startX = 0
  private startY = 0
  // seguimiento del dedo de movimiento, para reconocer un toque rápido (pase de un dedo)
  private mvT = 0
  private mvX = 0
  private mvY = 0
  private mvMaxDist = 0

  constructor(o: TouchInputOptions) {
    this.width = o.width
    this.height = o.height
    this.leftHanded = !!o.leftHanded
    this.buttonsMode = !!o.buttonsMode
  }

  resize(w: number, h: number) { this.width = w; this.height = h }

  private roleOf(role: Role): number | null {
    for (const [id, r] of this.roles) if (r === role) return id
    return null
  }

  get radius(): number { return Math.min(this.width, this.height) * STICK_RADIUS }

  down(id: number, x: number, y: number, t: number) {
    if (this.roles.has(id)) return
    if (this.buttonsMode) {
      // Sin zona de acción: cualquier dedo es el stick (solo importa el primero; un segundo dedo
      // no hace nada acá — el pase y el tiro son los botones aparte).
      if (this.roleOf("move") !== null) return
      this.roles.set(id, "move")
      this.stick = { ox: x, oy: y, cx: x, cy: y, radius: this.radius }
      this.moveX = 0
      this.moveY = 0
      return
    }
    const inLeft = x < this.width / 2
    const wantsMove = this.leftHanded ? !inLeft : inLeft
    let role: Role = wantsMove ? "move" : "action"
    if (this.roleOf(role) !== null) role = role === "move" ? "action" : "move"
    if (this.roleOf(role) !== null) return // ya hay dos dedos
    this.roles.set(id, role)
    if (role === "move") {
      this.stick = { ox: x, oy: y, cx: x, cy: y, radius: this.radius }
      this.moveX = 0
      this.moveY = 0
      this.mvT = t; this.mvX = x; this.mvY = y; this.mvMaxDist = 0
    } else {
      this.startT = t
      this.startX = x
      this.startY = y
      this.aim = { sx: x, sy: y, cx: x, cy: y }
    }
  }

  move(id: number, x: number, y: number, t: number) {
    const role = this.roles.get(id)
    if (role === "move" && this.stick) {
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
    } else if (role === "action" && this.aim) {
      this.aim.cx = x
      this.aim.cy = y
    }
  }

  /** Suelta un dedo. Si era el de acción, devuelve el pase/tiro resultante. */
  up(id: number, x: number, y: number, t: number): ActionEvent | null {
    const role = this.roles.get(id)
    if (!role) return null
    this.roles.delete(id)
    if (role === "move") {
      this.stick = null
      this.moveX = 0
      this.moveY = 0
      // Toque rápido: nunca se alejó del punto de apoyo y duró poco = "tocar al compañero" (pase de un dedo)
      const h = Math.max(1, this.height)
      const dist = Math.max(this.mvMaxDist, Math.hypot(x - this.mvX, y - this.mvY))
      if (dist < TAP_MAX_DIST * h && t - this.mvT <= TAP_MAX_TIME) return { kind: "tap", x, y, strict: true }
      return null
    }
    const ev = this.resolveAction(x, y, t)
    this.aim = null
    return ev
  }

  cancel(id: number) {
    const role = this.roles.get(id)
    if (!role) return
    this.roles.delete(id)
    if (role === "move") { this.stick = null; this.moveX = 0; this.moveY = 0 } else { this.aim = null }
  }

  /** Estilo Angry Birds: `(x,y)` es dónde soltaste, lejos del punto donde tocaste (`startX/Y`) — la
   *  honda tira para el lado CONTRARIO a como la estiraste. Cuanto más la estiraste, más potencia,
   *  hasta `FLICK_MAX_DIST` (de ahí no sigue creciendo). Nada de velocidad: solo cuánto y hacia dónde. */
  private resolveAction(x: number, y: number, t: number): ActionEvent | null {
    const h = Math.max(1, this.height)
    const total = Math.hypot(x - this.startX, y - this.startY)
    const dur = t - this.startT
    if (total < TAP_MAX_DIST * h) {
      return dur <= TAP_MAX_TIME ? { kind: "tap", x, y } : null
    }
    if (total < FLICK_MIN_DIST * h) return null

    const angle = Math.atan2(this.startY - y, this.startX - x) // opuesto al estirón, como una honda
    const pull01 = Math.min(1, (total - FLICK_MIN_DIST * h) / ((FLICK_MAX_DIST - FLICK_MIN_DIST) * h))
    const vhPerSec = 1.2 + pull01 * (6 - 1.2) // mismo rango que ya esperaba powerFromFlick()
    return { kind: "flick", angle, vhPerSec }
  }
}
