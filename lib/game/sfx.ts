import type { GameEvent } from "../engine"

/**
 * Sonidos sintetizados mínimos.
 * - El AudioContext se crea en el primer gesto y se reanuda en CADA gesto (iOS lo exige en touchend/click).
 * - `close()` libera el contexto al salir del partido (Safari limita cuántos puede haber abiertos).
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private last: Record<string, number> = {}
  muted = false

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AC) this.ctx = new AC()
      }
      if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume()
    } catch { /* sin audio, el juego sigue */ }
  }

  close() {
    try { void this.ctx?.close() } catch { /* ok */ }
    this.ctx = null
  }

  private tone(kind: string, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, minGap = 0.04) {
    const c = this.ctx
    if (this.muted || !c || c.state !== "running") return
    const now = c.currentTime
    if (now - (this.last[kind] ?? -1) < minGap) return
    this.last[kind] = now
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, now)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur)
    g.gain.setValueAtTime(vol, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    o.connect(g)
    g.connect(c.destination)
    o.start(now)
    o.stop(now + dur + 0.02)
  }

  play(ev: GameEvent) {
    switch (ev.type) {
      case "kick": this.tone("kick", "square", 260 + ev.speed * 8, 90, 0.09, 0.16); break
      case "board": if (ev.speed > 3) this.tone("board", "triangle", 140, 60, 0.08, Math.min(0.25, 0.05 + ev.speed * 0.008)); break
      case "post": this.tone("post", "sine", 1400, 900, 0.18, 0.2); break
      case "save": this.tone("save", "square", 200, 70, 0.1, 0.2); break
      case "deflect": this.tone("deflect", "triangle", 180, 80, 0.07, 0.14); break
      case "hit": this.tone("hit", "sawtooth", 110, 50, 0.1, Math.min(0.28, 0.06 + ev.impact * 0.02)); break
      case "foul": this.tone("foul", "sine", 1250, 1150, 0.35, 0.22, 0.3); break
      case "steal": this.tone("steal", "square", 420, 300, 0.08, 0.14); break
      case "goal": this.tone("goal", "sawtooth", 300, 700, 0.7, 0.22, 0.5); break
      case "end": this.tone("end", "sawtooth", 110, 90, 1.2, 0.25, 1); break
      default: break
    }
  }
}
