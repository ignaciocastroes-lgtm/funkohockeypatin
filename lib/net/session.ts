/** Sesiones del 2P sobre un `Transport`. Sin DOM: se prueban con `memoryPair()`. */
import type { GameEvent } from "../engine"
import type { ButtonAction } from "../game/actions"
import { PROTOCOL_VERSION, encode, parseMessage, type HelloOpts, type Snapshot } from "./protocol"
import type { Transport } from "./transport"

/** HOST: espera al invitado, le manda cómo se arma el partido, recibe su stick y sus botones. */
export class HostSession {
  guestJoined = false
  closed = false
  /** Último stick del invitado (ya validado y acotado a [-1,1]). */
  guestStick = { x: 0, y: 0 }
  private buttons: ButtonAction[] = []
  private seq = 0
  onGuestJoined?: () => void
  onClosed?: () => void

  constructor(private t: Transport, private opts: HelloOpts) {
    t.onMessage((text) => {
      const m = parseMessage(text)
      if (!m) return
      if (m.t === "hi" && !this.guestJoined) {
        if (m.v !== PROTOCOL_VERSION) { this.t.send(encode({ t: "bye" })); return }
        this.guestJoined = true
        this.t.send(encode({ t: "hello", v: PROTOCOL_VERSION, opts: this.opts }))
        this.onGuestJoined?.()
      } else if (m.t === "in" && this.guestJoined) {
        this.guestStick = { x: m.mx, y: m.my }
      } else if (m.t === "btn" && this.guestJoined) {
        if (this.buttons.length < 8) this.buttons.push(m.a) // tope: un invitado que spamea no llena la memoria
      } else if (m.t === "bye") {
        this.finish()
      }
    })
    t.onClose(() => this.finish())
  }

  private finish() { if (this.closed) return; this.closed = true; this.guestJoined = false; this.onClosed?.() }
  takeButtons(): ButtonAction[] { return this.buttons.splice(0) }
  nextSeq(): number { return this.seq++ }
  sendSnapshot(s: Snapshot) { if (this.guestJoined) this.t.send(encode(s)) }
  sendEvents(e: GameEvent[]) { if (this.guestJoined && e.length) this.t.send(encode({ t: "ev", e })) }
  close() { if (!this.closed) { try { this.t.send(encode({ t: "bye" })) } catch { /* nada */ } this.t.close() } }
}

/** INVITADO: pide entrar, recibe el armado del partido y después snapshots y eventos. */
export class GuestSession {
  opts: HelloOpts | null = null
  closed = false
  latest: Snapshot | null = null
  private lastSeq = -1
  private events: GameEvent[] = []
  private lastStick = { x: 9, y: 9 }
  onHello?: (o: HelloOpts) => void
  onSnapshot?: (s: Snapshot) => void
  onClosed?: () => void

  constructor(private t: Transport) {
    t.onMessage((text) => {
      const m = parseMessage(text)
      if (!m) return
      if (m.t === "hello" && !this.opts) {
        if (m.v !== PROTOCOL_VERSION) { this.finish(); return }
        this.opts = m.opts
        this.onHello?.(m.opts)
      } else if (m.t === "snap" && this.opts) {
        if (m.seq <= this.lastSeq) return // llegó tarde/repetido: se ignora
        this.lastSeq = m.seq
        this.latest = m
        this.onSnapshot?.(m)
      } else if (m.t === "ev" && this.opts) {
        if (this.events.length < 200) this.events.push(...m.e)
      } else if (m.t === "bye") {
        this.finish()
      }
    })
    t.onClose(() => this.finish())
    t.send(encode({ t: "hi", v: PROTOCOL_VERSION }))
  }

  private finish() { if (this.closed) return; this.closed = true; this.onClosed?.() }
  takeEvents(): GameEvent[] { return this.events.splice(0) }
  /** Manda el stick solo si cambió (el llamador lo limita en frecuencia). */
  sendStick(x: number, y: number) {
    const rx = Math.round(x * 100) / 100, ry = Math.round(y * 100) / 100
    if (rx === this.lastStick.x && ry === this.lastStick.y) return
    this.lastStick = { x: rx, y: ry }
    this.t.send(encode({ t: "in", mx: rx, my: ry }))
  }
  sendButton(a: ButtonAction) { this.t.send(encode({ t: "btn", a })) }
  close() { if (!this.closed) { try { this.t.send(encode({ t: "bye" })) } catch { /* nada */ } this.t.close() } }
}
