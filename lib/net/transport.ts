/** Transporte de texto entre dos puntas. Lo que viaja son mensajes JSON (ver `protocol.ts`). */
export interface Transport {
  send(text: string): void
  onMessage(cb: (text: string) => void): void
  onClose(cb: () => void): void
  close(): void
  readonly isOpen: boolean
}

/** Par de transportes conectados en el mismo proceso (sin red) — para probar toda la lógica de sala. */
export function memoryPair(): [Transport, Transport] {
  class End implements Transport {
    peer!: End
    private msg: Array<(t: string) => void> = []
    private cls: Array<() => void> = []
    isOpen = true
    send(text: string) { if (this.isOpen && this.peer.isOpen) for (const cb of this.peer.msg) cb(text) }
    onMessage(cb: (t: string) => void) { this.msg.push(cb) }
    onClose(cb: () => void) { this.cls.push(cb) }
    close() {
      if (!this.isOpen) return
      this.isOpen = false
      for (const cb of this.cls) cb()
      if (this.peer.isOpen) { this.peer.isOpen = false; for (const cb of this.peer.cls) cb() }
    }
  }
  const a = new End(), b = new End()
  a.peer = b; b.peer = a
  return [a, b]
}

type WSLike = {
  readyState: number
  send(d: string): void
  close(): void
  onopen: null | (() => void)
  onmessage: null | ((e: { data: unknown }) => void)
  onclose: null | ((e?: { code?: number }) => void)
  onerror: null | (() => void)
}

/** WebSocket contra el relay. Los mensajes enviados antes de abrir se encolan. */
export class WebSocketTransport implements Transport {
  private ws: WSLike
  private queue: string[] = []
  private msg: Array<(t: string) => void> = []
  private cls: Array<() => void> = []
  private opn: Array<() => void> = []
  private closed = false
  /** Código con el que cerró el relay (4404 sala inexistente, 4409 ocupada, 4503 lleno...) o 0 si no lo sabemos. */
  closeCode = 0

  constructor(url: string, WS: new (u: string) => WSLike = (globalThis as unknown as { WebSocket: new (u: string) => WSLike }).WebSocket) {
    this.ws = new WS(url)
    this.ws.onopen = () => { for (const t of this.queue.splice(0)) this.ws.send(t); for (const cb of this.opn) cb() }
    this.ws.onmessage = (e) => { if (typeof e.data === "string") for (const cb of this.msg) cb(e.data) }
    const done = () => { if (this.closed) return; this.closed = true; for (const cb of this.cls) cb() }
    this.ws.onclose = (e) => { this.closeCode = e?.code ?? 0; done() }
    this.ws.onerror = done
  }
  get isOpen() { return !this.closed && this.ws.readyState === 1 }
  onOpen(cb: () => void) { if (this.ws.readyState === 1) cb(); else this.opn.push(cb) }
  send(text: string) { if (this.closed) return; if (this.ws.readyState === 1) this.ws.send(text); else this.queue.push(text) }
  onMessage(cb: (t: string) => void) { this.msg.push(cb) }
  onClose(cb: () => void) { this.cls.push(cb) }
  close() { if (this.closed) return; this.closed = true; try { this.ws.close() } catch { /* ya cerrado */ } for (const cb of this.cls) cb() }
}

/** URL del relay: `window.FP_RELAY_URL` (se puede definir en el HTML sin recompilar) o `NEXT_PUBLIC_FP_RELAY_URL`. */
export function relayBaseUrl(): string | null {
  const w = (typeof window !== "undefined" ? window : undefined) as (Window & { FP_RELAY_URL?: string }) | undefined
  const fromWindow = w?.FP_RELAY_URL
  let fromEnv: string | undefined
  // Literal a propósito: Next reemplaza `process.env.NEXT_PUBLIC_*` en el build solo si se escribe así.
  try { fromEnv = process.env.NEXT_PUBLIC_FP_RELAY_URL } catch { fromEnv = undefined }
  const u = String(fromWindow || fromEnv || "").trim()
  return /^wss?:\/\//i.test(u) ? u.replace(/\/+$/, "") : null
}

export function relayUrl(base: string, room: string, role: "host" | "guest"): string {
  return `${base}/?room=${encodeURIComponent(room)}&role=${role}`
}
