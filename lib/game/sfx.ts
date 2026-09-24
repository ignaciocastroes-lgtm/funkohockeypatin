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

  /** El AudioContext (null hasta el primer gesto). Lo comparte el público (`crowd.ts`). */
  get context(): AudioContext | null { return this.ctx }

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

  /** Ruido blanco filtrado: golpes, madera, cuerpo a cuerpo — texturado, no un tono puro. */
  private noise(kind: string, dur: number, vol: number, freq: number, q: number, minGap = 0.04) {
    const c = this.ctx
    if (this.muted || !c || c.state !== "running") return
    const now = c.currentTime
    if (now - (this.last[kind] ?? -1) < minGap) return
    this.last[kind] = now
    const n = Math.max(1, Math.floor(dur * c.sampleRate))
    const buf = c.createBuffer(1, n, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    const filt = c.createBiquadFilter()
    filt.type = "bandpass"
    filt.frequency.value = freq
    filt.Q.value = q
    const g = c.createGain()
    g.gain.setValueAtTime(vol, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    src.connect(filt)
    filt.connect(g)
    g.connect(c.destination)
    src.start(now)
    src.stop(now + dur + 0.02)
  }

  /** Silbato: ataque bien rápido y un trino agudo, no un simple barrido de tono. */
  private whistle(kind: string, dur: number, vol: number, minGap = 0.5) {
    const c = this.ctx
    if (this.muted || !c || c.state !== "running") return
    const now = c.currentTime
    if (now - (this.last[kind] ?? -1) < minGap) return
    this.last[kind] = now
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = "square"
    const f0 = 2700
    const steps = 7
    for (let i = 0; i < steps; i++) {
      o.frequency.setValueAtTime(f0 + (i % 2 === 0 ? 70 : -45), now + (dur * i) / steps)
    }
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(vol, now + 0.008)
    g.gain.setValueAtTime(vol, now + dur * 0.72)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    o.connect(g)
    g.connect(c.destination)
    o.start(now)
    o.stop(now + dur + 0.02)
  }

  play(ev: GameEvent) {
    switch (ev.type) {
      case "kick":
        if (ev.superShot) { this.noise("kick", 0.09, 0.32, 900, 3.5); this.tone("kickTone", "sawtooth", 380, 120, 0.14, 0.14) }
        else this.noise("kick", 0.045, Math.min(0.3, 0.14 + ev.speed * 0.006), 1900 + ev.speed * 35, 5.5)
        break
      case "board": if (ev.speed > 3) this.noise("board", 0.13, Math.min(0.3, 0.08 + ev.speed * 0.009), 380, 1.6); break
      case "post": this.tone("post", "triangle", 1500, 950, 0.2, 0.22); break
      case "save":
        if (ev.combo) this.tone("save", "square", 320, 60, 0.22, 0.26)
        else this.tone("save", "square", 200, 70, 0.1, 0.2)
        break
      case "combo": this.tone("combo", "sine", 700 + ev.touches * 120, 700 + ev.touches * 120, 0.12, 0.15, 0.15); break
      case "sub": this.tone("sub", "sine", 500, 650, 0.12, 0.1); break
      case "deflect": this.noise("deflect", 0.05, 0.16, 1400, 2.5); break
      case "hit": this.noise("hit", 0.09, Math.min(0.3, 0.1 + ev.impact * 0.018), 260, 1.3); break
      case "foul": this.whistle("foul", 0.45, 0.22, 1.0); break
      case "penalty": this.whistle("penalty", 0.6, 0.26, 1.0); break
      case "kickoff": this.whistle("kickoff", 0.22, 0.16, 0.3); break
      case "steal": this.tone("steal", "square", 420, 300, 0.08, 0.14); break
      case "goal": this.tone("goal", "sawtooth", 300, 700, 0.7, 0.22, 0.5); break
      case "end": this.whistle("end", 0.75, 0.24, 1.5); break
      default: break
    }
  }
}
