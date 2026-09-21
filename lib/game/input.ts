/**
 * Entrada de dos dedos. Lógica PURA (sin DOM) para poder probarla con tests.
 *
 *  - Dedo de MOVIMIENTO (mitad izquierda): joystick flotante. Nace donde tocas.
 *  - Dedo de ACCIÓN (mitad derecha): un deslizamiento (flick) = pase o tiro.
 *      · La dirección del deslizamiento es la dirección del pase/tiro.
 *      · La velocidad del deslizamiento es la potencia (suave = pase, latigazo = tiro).
 *      · Un toque sin deslizar = pase automático al mejor compañero.
 *
 * Los roles se asignan por zona; si la zona de un rol está ocupada por otro dedo,
 * el dedo toma el rol que esté libre (así funciona también con una sola mano).
 */

export type ActionEvent =
  | { kind: "flick"; angle: number; vhPerSec: number }
  | { kind: "tap" }

export interface TouchInputOptions {
  width: number
  height: number
  /** true = joystick a la derecha, acción a la izquierda. */
  leftHanded?: boolean
}

interface Sample { t: number; x: number; y: number }

/** Ventana (s) sobre la que se mide la velocidad de salida del dedo. */
const FLICK_WINDOW = 0.09
/** Un toque: recorre menos de esta fracción de la altura y dura menos de TAP_MAX_TIME. */
const TAP_MAX_DIST = 0.05
const TAP_MAX_TIME = 0.3
/** Recorrido mínimo (fracción de la altura) para considerarlo deslizamiento. */
const FLICK_MIN_DIST = 0.05
/** Radio del joystick (fracción del lado corto de la pantalla). */
const STICK_RADIUS = 0.17
const DEADZONE = 0.12

type Role = "move" | "action"

export class TouchInput {
  width: number
  height: number
  leftHanded: boolean

  /** Vector de movimiento, magnitud <= 1. */
  moveX = 0
  moveY = 0

  /** Estado visible para dibujar el joystick. */
  stick: { ox: number; oy: number; cx: number; cy: number; radius: number } | null = null
  /** Estado visible para dibujar la línea de apuntado mientras el dedo de acción está abajo. */
  aim: { sx: number; sy: number; cx: number; cy: number } | null = null

  private roles = new Map<number, Role>()
  private samples: Sample[] = []
  private startT = 0
  private startX = 0
  private startY = 0

  constructor(o: TouchInputOptions) {
    this.width = o.width
    this.height = o.height
    this.leftHanded = !!o.leftHanded
  }

  resize(w: number, h: number) { this.width = w; this.height = h }

  private roleOf(role: Role): number | null {
    for (const [id, r] of this.roles) if (r === role) return id
    return null
  }

  get radius(): number { return Math.min(this.width, this.height) * STICK_RADIUS }

  down(id: number, x: number, y: number, t: number) {
    if (this.roles.has(id)) return
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
    } else {
      this.startT = t
      this.startX = x
      this.startY = y
      this.samples = [{ t, x, y }]
      this.aim = { sx: x, sy: y, cx: x, cy: y }
    }
  }

  move(id: number, x: number, y: number, t: number) {
    const role = this.roles.get(id)
    if (role === "move" && this.stick) {
      const s = this.stick
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
      this.samples.push({ t, x, y })
      if (this.samples.length > 32) this.samples.shift()
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
      return null
    }
    this.samples.push({ t, x, y })
    const ev = this.resolveAction(x, y, t)
    this.aim = null
    this.samples = []
    return ev
  }

  cancel(id: number) {
    const role = this.roles.get(id)
    if (!role) return
    this.roles.delete(id)
    if (role === "move") { this.stick = null; this.moveX = 0; this.moveY = 0 } else { this.aim = null; this.samples = [] }
  }

  private resolveAction(x: number, y: number, t: number): ActionEvent | null {
    const h = Math.max(1, this.height)
    const total = Math.hypot(x - this.startX, y - this.startY)
    const dur = t - this.startT
    if (total < TAP_MAX_DIST * h) {
      return dur <= TAP_MAX_TIME ? { kind: "tap" } : null
    }
    if (total < FLICK_MIN_DIST * h) return null

    // velocidad de salida: primer sample dentro de la ventana final -> último
    const last = this.samples[this.samples.length - 1]
    let first = last
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (last.t - this.samples[i].t <= FLICK_WINDOW) first = this.samples[i]
      else break
    }
    const dt = last.t - first.t
    const dist = Math.hypot(last.x - first.x, last.y - first.y)
    let angle: number
    let pxPerSec: number
    if (dt > 0.008 && dist > 0.012 * h) {
      angle = Math.atan2(last.y - first.y, last.x - first.x)
      pxPerSec = dist / dt
    } else {
      // el dedo frenó antes de soltar: usa el recorrido completo (deslizamiento lento = pase suave)
      angle = Math.atan2(y - this.startY, x - this.startX)
      pxPerSec = total / Math.max(dur, 0.05)
    }
    return { kind: "flick", angle, vhPerSec: pxPerSec / h }
  }
}
