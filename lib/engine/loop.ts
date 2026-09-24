import { FIXED_DT, MAX_FRAME_TIME } from "./constants"

/**
 * Acumulador de paso fijo. Convierte tiempo real (frames de duración variable)
 * en pasos de simulación de duración constante => misma física a 30, 60 o 144 Hz.
 */
export class FixedStepper {
  private acc = 0
  constructor(
    readonly dt: number = FIXED_DT,
    readonly maxFrame: number = MAX_FRAME_TIME,
  ) {}

  /** Avanza `frameDt` segundos reales. Devuelve alpha (0..1) para interpolar el render. */
  advance(frameDt: number, step: (dt: number) => void): number {
    if (!(frameDt > 0)) return this.acc / this.dt
    this.acc += Math.min(frameDt, this.maxFrame)
    // épsilon: evita perder un paso por error de coma flotante al sumar frames
    while (this.acc >= this.dt - 1e-9) {
      step(this.dt)
      this.acc -= this.dt
    }
    if (this.acc < 0) this.acc = 0
    return this.acc / this.dt
  }

  reset() { this.acc = 0 }
}
