import type { GameEvent } from "../engine"

declare global {
  interface Window {
    /** En el build de un solo archivo (juego.html) los audios van incrustados como data: URI. */
    __FP_AUDIO__?: Record<string, string>
  }
}

/** Dónde está un audio: incrustado (juego.html) o en /audio/ (build de Next). Lo usa también `crowd.ts`. */
export function audioUrl(file: string): string {
  const inline = typeof window !== "undefined" ? window.__FP_AUDIO__?.[file] : undefined
  return inline ?? `/audio/${file}`
}

/**
 * Trae los bytes de un audio, sin pasar por `fetch()` cuando es una URI incrustada (`data:...`).
 * En el build de un solo archivo (juego.html) el audio va embebido en base64 — `fetch()` sobre una
 * `data:` URI no es 100% confiable en todos los navegadores/WebViews móviles (es la causa real, más
 * probable, de por qué la música y el silbato real nunca cargaban en el celular mientras los sonidos
 * sintetizados sí se escuchaban: esos no necesitan traer nada, son puro oscilador). Para el build de
 * Next (rutas `/audio/...` reales), sigue usando `fetch()` normal.
 */
export async function fetchAudioBytes(url: string): Promise<ArrayBuffer> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",")
    const meta = url.slice(5, comma) // ej: "audio/mpeg;base64"
    const payload = url.slice(comma + 1)
    if (!meta.includes("base64")) throw new Error("data: URI de audio sin base64")
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`no se pudo cargar ${url}`)
  return res.arrayBuffer()
}

export const SFX_FILES = {
  whistle: "ref-whistle.mp3",
} as const

/**
 * Sonidos sintetizados mínimos, más el silbato real (grabación, no síntesis — se carga una vez y
 * cae de nuevo al silbato sintetizado si todavía no cargó o falló, el juego nunca espera por esto).
 * - El AudioContext se crea en el primer gesto y se reanuda en CADA gesto (iOS lo exige en touchend/click).
 * - `close()` libera el contexto al salir del partido (Safari limita cuántos puede haber abiertos).
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private last: Record<string, number> = {}
  private whistleBuf: AudioBuffer | null = null
  private whistleLoading = false
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
      if (this.ctx && !this.whistleBuf && !this.whistleLoading) this.loadWhistle(this.ctx)
    } catch { /* sin audio, el juego sigue */ }
  }

  private loadWhistle(ctx: AudioContext) {
    this.whistleLoading = true
    fetchAudioBytes(audioUrl(SFX_FILES.whistle))
      .then((data) => new Promise<AudioBuffer>((resolve, reject) => {
        const p = ctx.decodeAudioData(data, resolve, reject)
        if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject)
      }))
      .then((buf) => { this.whistleBuf = buf })
      .catch(() => { /* sin silbato real: se queda con el sintetizado, el juego sigue igual */ })
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

  /** Silbato: grabación real si ya cargó (`ref-whistle.mp3`); si no, el sintetizado de siempre
   *  (ataque bien rápido y un trino agudo, no un simple barrido de tono). */
  private whistle(kind: string, dur: number, vol: number, minGap = 0.5) {
    const c = this.ctx
    if (this.muted || !c || c.state !== "running") return
    const now = c.currentTime
    if (now - (this.last[kind] ?? -1) < minGap) return
    this.last[kind] = now
    if (this.whistleBuf) {
      const src = c.createBufferSource()
      src.buffer = this.whistleBuf
      const g = c.createGain()
      g.gain.value = Math.min(1, vol * 1.6) // la grabación ya viene nivelada, no necesita el mismo vol que el sintetizado
      src.connect(g)
      g.connect(c.destination)
      src.start(now)
      src.onended = () => { try { src.disconnect(); g.disconnect() } catch { /* ya soltado */ } }
      return
    }
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
