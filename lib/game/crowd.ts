import { GOALS } from "../engine"
import type { GameEvent, Side, World } from "../engine"
import {
  CROWD, bedGain, energyGain, equalPowerCurve, nextLoopStart, panFor, pickVariant, pressure, reactionFor, smoothExcitement,
} from "./crowd-mix"
import type { Sfx } from "./sfx"

/**
 * Público de las gradas: murmullo de fondo, entusiasmo que sube con la jugada, ovaciones de gol y
 * reacciones cortas — todo a partir de grabaciones reales de estadio (ver scripts/build-crowd-audio.py).
 * Comparte el AudioContext de `Sfx` (que ya resuelve el desbloqueo en iOS, el silencio y el cierre).
 */

export const CROWD_FILES = {
  bedA: "crowd-bed-a.mp3",
  bedC: "crowd-bed-c.mp3",
  energy: "crowd-energy.mp3",
  roar1: "crowd-roar-1.mp3",
  roar2: "crowd-roar-2.mp3",
  react: "crowd-react.mp3",
} as const
type Key = keyof typeof CROWD_FILES

declare global {
  interface Window {
    /** En el build de un solo archivo (juego.html) los audios van incrustados como data: URI. */
    __FP_AUDIO__?: Record<string, string>
  }
}

/** Dónde está un audio: incrustado (juego.html) o en /audio/ (build de Next). */
export function audioUrl(file: string): string {
  const inline = typeof window !== "undefined" ? window.__FP_AUDIO__?.[file] : undefined
  return inline ?? `/audio/${file}`
}

export type CrowdStatus = "idle" | "loading" | "ready" | "error"

interface Layer {
  key: "bedA" | "bedC" | "energy"
  buf: AudioBuffer
  gain: GainNode
  /** Momento (reloj de audio) en que debe arrancar la próxima vuelta. */
  nextStart: number
  started: boolean
}

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Safari viejo solo entiende la forma con callbacks; los demás devuelven promesa: se cubren las dos.
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject)
    if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject)
  })
}

export class Crowd {
  status: CrowdStatus = "idle"
  private buffers: Partial<Record<Key, AudioBuffer>> = {}
  private master: GainNode | null = null
  private layers: Layer[] = []
  private excitement: number = CROWD.base
  private bump = 0
  private duckUntil = 0
  private duckAmount = 0
  private paused = false
  private stopped = false
  private lastRoar = -1
  private roar: { gain: GainNode; endsAt: number } | null = null
  private lastReactAt = -10

  constructor(private sfx: Sfx, private humanSide: Side | null = 0) {}

  /** Para la depuración y el e2e. */
  get info() {
    return { status: this.status, excitement: this.excitement, layers: this.layers.length, master: this.master?.gain.value ?? 0 }
  }

  setPaused(p: boolean) { this.paused = p }

  private ctx(): AudioContext | null {
    const c = this.sfx.context
    return c && c.state === "running" ? c : null
  }

  private async load(ctx: AudioContext) {
    this.status = "loading"
    try {
      const entries = await Promise.all((Object.keys(CROWD_FILES) as Key[]).map(async (k) => {
        const res = await fetch(audioUrl(CROWD_FILES[k]))
        if (!res.ok) throw new Error(`no se pudo cargar ${CROWD_FILES[k]}`)
        return [k, await decode(ctx, await res.arrayBuffer())] as const
      }))
      if (this.stopped) return
      for (const [k, b] of entries) this.buffers[k] = b
      this.build(ctx)
      this.status = "ready"
    } catch {
      this.status = "error" // sin público, el juego sigue igual
    }
  }

  private build(ctx: AudioContext) {
    const master = ctx.createGain()
    master.gain.value = 0
    // un compresor suave: las capas + una ovación no deben saturar la salida ni tapar los efectos
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -20
    comp.ratio.value = 3
    comp.attack.value = 0.02
    comp.release.value = 0.3
    master.connect(comp)
    comp.connect(ctx.destination)
    this.master = master
    for (const key of ["bedA", "bedC", "energy"] as const) {
      const buf = this.buffers[key]
      if (!buf) continue
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.connect(master)
      this.layers.push({ key, buf, gain, nextStart: ctx.currentTime + 0.05, started: false })
    }
  }

  /** Arranca una vuelta de un bucle en `when`, con fundido de entrada y de salida (empalme en cruz). */
  private startVoice(ctx: AudioContext, layer: Layer, when: number) {
    const dur = layer.buf.duration
    const x = Math.min(CROWD.loopCrossfade, dur / 3)
    // la primera vuelta arranca en un punto al azar (los murmullos no arrancan sincronizados)
    const offset = layer.started ? 0 : Math.random() * Math.max(0, dur - 3 * x)
    const len = dur - offset
    const src = ctx.createBufferSource()
    src.buffer = layer.buf
    const g = ctx.createGain()
    src.connect(g)
    g.connect(layer.gain)
    const fadeIn = layer.started ? x : 0.5
    // OJO: en WebAudio no se puede agendar un valor DENTRO de una curva (ni justo en su inicio): el
    // valor inicial se pone en la propiedad y las dos curvas (entrada y salida) no se tocan entre sí.
    g.gain.value = 0
    g.gain.setValueCurveAtTime(equalPowerCurve(32, "in"), when, fadeIn)
    g.gain.setValueCurveAtTime(equalPowerCurve(32, "out"), when + len - x, x)
    src.start(when, offset)
    src.stop(when + len + 0.05)
    src.onended = () => { try { src.disconnect(); g.disconnect() } catch { /* ya soltado */ } }
    layer.nextStart = when + len - x
    layer.started = true
  }

  /** Cada cuadro: sube/baja el entusiasmo, ajusta volúmenes y deja agendadas las próximas vueltas. */
  update(w: World, dt: number) {
    if (this.stopped) return
    const ctx = this.ctx()
    if (!ctx) return
    if (this.status === "idle" && !this.sfx.muted) { void this.load(ctx); return }
    if (this.status !== "ready" || !this.master) return
    const now = ctx.currentTime

    // entusiasmo = lo que pide la jugada (suavizado) + los golpes de eventos, que decaen solos
    this.bump *= Math.exp(-Math.max(0, dt) / 2.5)
    this.excitement = smoothExcitement(this.excitement, pressure(w), dt)
    const e = Math.min(1, this.excitement + this.bump)

    const silent = this.sfx.muted || this.paused
    const duck = now < this.duckUntil ? 1 - this.duckAmount : 1
    this.master.gain.setTargetAtTime(silent ? 0 : CROWD.master * duck, now, silent ? 0.08 : 0.12)

    for (const l of this.layers) {
      const target = l.key === "energy" ? energyGain(e) : bedGain(e) * (l.key === "bedC" ? 0.85 : 1)
      l.gain.gain.setTargetAtTime(target, now, 0.35)
      while (l.nextStart < now + 3) this.startVoice(ctx, l, Math.max(l.nextStart, now + 0.02))
    }
  }

  /** Reacción a un evento del juego (gol, palo, atajada, falta...). `camCx/camWidth`: para panear. */
  onEvent(ev: GameEvent, w: World, camCx: number, camWidth: number) {
    const ctx = this.ctx()
    if (!ctx || this.status !== "ready" || !this.master || this.stopped || this.sfx.muted) return
    const r = reactionFor(ev, this.humanSide)
    if (!r) return
    const now = ctx.currentTime
    this.bump = Math.min(1, this.bump + r.bump)
    if (r.duck) { this.duckUntil = now + r.duck.seconds; this.duckAmount = r.duck.amount }
    if (r.roar) this.playRoar(ctx, r.roar.gain, panFor(GOALS[r.roar.goalSide].lineX, camCx, camWidth))
    if (r.react !== undefined && now - this.lastReactAt > 1.5) {
      this.lastReactAt = now
      this.playReact(ctx, r.react, panFor(w.puck.x, camCx, camWidth))
    }
  }

  private panner(ctx: AudioContext, pan: number): AudioNode {
    if (typeof ctx.createStereoPanner !== "function") return this.master as GainNode
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    p.connect(this.master as GainNode)
    return p
  }

  private playRoar(ctx: AudioContext, gain: number, pan: number) {
    const which = pickVariant(2, this.lastRoar, Math.random())
    this.lastRoar = which
    const buf = this.buffers[which === 0 ? "roar1" : "roar2"]
    if (!buf) return
    const now = ctx.currentTime
    // si todavía suena una ovación (dos goles seguidos), la anterior se va apagando
    if (this.roar && this.roar.endsAt > now) this.roar.gain.gain.setTargetAtTime(0, now, 0.25)
    const g = ctx.createGain()
    g.gain.value = Math.min(1, gain) * CROWD.roarMax
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(g)
    g.connect(this.panner(ctx, pan))
    src.start(now)
    src.onended = () => { try { src.disconnect(); g.disconnect() } catch { /* ya soltado */ } }
    this.roar = { gain: g, endsAt: now + buf.duration }
  }

  private playReact(ctx: AudioContext, gain: number, pan: number) {
    const buf = this.buffers.react
    if (!buf) return
    const now = ctx.currentTime
    const g = ctx.createGain()
    g.gain.value = Math.min(1, gain) * CROWD.reactMax
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.95 + Math.random() * 0.1 // que dos reacciones seguidas no suenen idénticas
    src.connect(g)
    g.connect(this.panner(ctx, pan))
    src.start(now)
    src.onended = () => { try { src.disconnect(); g.disconnect() } catch { /* ya soltado */ } }
  }

  /** Apaga el público (al salir del partido). Después el contexto lo cierra `Sfx.close()`. */
  stop() {
    this.stopped = true
    const ctx = this.sfx.context
    try {
      if (ctx && this.master) this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    } catch { /* contexto ya cerrado */ }
  }
}
