import { CAMERA, RINK } from "./constants"
import type { World } from "./types"

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Cámara de seguimiento. Vive en la capa de render (usa dt real del frame, no el paso fijo).
 * - Sigue al jugador controlado y al puck, adelantándose un poco en la dirección de la jugada.
 * - Se aleja sola cuando el puck y el jugador quedan lejos (pases largos).
 * - Nunca muestra mucho más allá de las vallas.
 */
export class Camera {
  cx: number = RINK.length / 2
  cy: number = RINK.width / 2
  /** Ancho visible en metros. */
  width: number = CAMERA.baseWidth
  vw = 1
  vh = 1
  private ready = false

  get ppm(): number { return this.vw / this.width }
  get height(): number { return this.width * (this.vh / this.vw) }

  reset() { this.ready = false }

  update(dt: number, w: World, controlledId: string | null, vw: number, vh: number) {
    this.vw = Math.max(1, vw)
    this.vh = Math.max(1, vh)
    const aspect = this.vw / this.vh
    const p = w.puck
    let c = controlledId ? w.skaters.find((s) => s.id === controlledId) : undefined
    if (!c && p.carrierId) c = w.skaters.find((s) => s.id === p.carrierId)

    let fx = p.x
    let fy = p.y
    let vx = p.vx
    let vy = p.vy
    let span = { dx: 0, dy: 0 }
    if (c) {
      fx = (p.x + c.x) / 2
      fy = (p.y + c.y) / 2
      vx = (p.vx + c.vx) / 2
      vy = (p.vy + c.vy) / 2
      span = { dx: Math.abs(p.x - c.x), dy: Math.abs(p.y - c.y) }
    }
    // adelanto acotado a 4 m
    let lx = vx * CAMERA.lookAhead
    let ly = vy * CAMERA.lookAhead
    const lm = Math.hypot(lx, ly)
    if (lm > 4) { lx = (lx / lm) * 4; ly = (ly / lm) * 4 }
    const tx = fx + lx
    const ty = fy + ly

    const maxByRink = (RINK.width + CAMERA.edgeMargin * 2) * aspect
    const needW = Math.min(
      CAMERA.maxWidth,
      maxByRink,
      Math.max(CAMERA.baseWidth, span.dx + CAMERA.fitMargin * 2, (span.dy + CAMERA.fitMargin * 2) * aspect),
    )

    if (!this.ready) {
      this.cx = tx; this.cy = ty; this.width = needW
      this.ready = true
    } else {
      const kp = 1 - Math.exp(-CAMERA.posRate * dt)
      const kz = 1 - Math.exp(-CAMERA.zoomRate * dt)
      this.cx += (tx - this.cx) * kp
      this.cy += (ty - this.cy) * kp
      this.width += (needW - this.width) * kz
    }
    this.clampToRink()
  }

  private clampToRink() {
    const halfW = this.width / 2
    const halfH = this.height / 2
    const e = CAMERA.edgeMargin
    const minX = halfW - e
    const maxX = RINK.length - halfW + e
    const minY = halfH - e
    const maxY = RINK.width - halfH + e
    this.cx = minX > maxX ? RINK.length / 2 : clamp(this.cx, minX, maxX)
    this.cy = minY > maxY ? RINK.width / 2 : clamp(this.cy, minY, maxY)
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.ppm
    return { x: this.vw / 2 + (wx - this.cx) * s, y: this.vh / 2 + (wy - this.cy) * s }
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.ppm
    return { x: this.cx + (sx - this.vw / 2) / s, y: this.cy + (sy - this.vh / 2) / s }
  }
}
