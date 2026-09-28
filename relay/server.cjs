#!/usr/bin/env node
/**
 * Relay de salas para el 2P de Liga Funko-Patín. SOLO Node (sin dependencias). No sabe nada del juego:
 * junta a dos conexiones por código de sala y le reenvía a cada una lo que manda la otra.
 *
 *   ws://HOST:PORT/?room=ABCDE&role=host    crea la sala (falla si ya tiene host)
 *   ws://HOST:PORT/?room=ABCDE&role=guest   entra a una sala que ya existe y no está llena
 *
 * Detrás de TLS (wss://) con cualquier proxy (Caddy, nginx, Fly, Render...). Ver docs/RELAY.md.
 * Variables: PORT (default 8787; 0 = libre), HOST, ALLOWED_ORIGINS (coma; vacío = cualquiera),
 *            MAX_ROOMS (1000), ROOM_TTL_MS (sala esperando: 10 min).
 * Cierres con código propio: 4400 pedido inválido · 4403 origen no permitido · 4404 sala inexistente ·
 *            4409 sala ocupada · 4429 demasiados intentos/mensajes · 4503 servidor lleno.
 */
"use strict"
const http = require("http")
const crypto = require("crypto")

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const ROOM_RE = /^[A-HJKMNP-Z2-9]{5}$/
const MAX_FRAME = 16 * 1024
const MAX_MSGS_PER_SEC = 120

function frame(opcode, payload) {
  const len = payload.length
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : null
  if (!head) throw new Error("frame demasiado grande")
  return Buffer.concat([head, payload])
}

class Conn {
  constructor(socket, onText, onClose) {
    this.socket = socket; this.onText = onText; this.onClose = onClose
    this.buf = Buffer.alloc(0); this.parts = []; this.partsLen = 0; this.closed = false
    this.msgs = 0; this.msgWindow = Date.now()
    socket.on("data", (d) => this.data(d))
    socket.on("close", () => this.end())
    socket.on("error", () => this.end())
    socket.setNoDelay(true)
  }
  send(text) { if (!this.closed) try { this.socket.write(frame(1, Buffer.from(text, "utf8"))) } catch { this.end() } }
  close(code, reason) {
    if (this.closed) return
    try {
      const r = Buffer.from(reason || "", "utf8").subarray(0, 100)
      const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code || 1000, 0); r.copy(p, 2)
      this.socket.write(frame(8, p)); this.socket.end()
    } catch { /* ya cerrado */ }
    this.end()
  }
  end() { if (this.closed) return; this.closed = true; try { this.socket.destroy() } catch { /* nada */ } this.onClose() }
  data(d) {
    this.buf = Buffer.concat([this.buf, d])
    if (this.buf.length > MAX_FRAME * 2 + 16) return this.close(1009, "demasiado grande")
    for (;;) {
      const b = this.buf
      if (b.length < 2) return
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0
      let len = b[1] & 0x7f, off = 2
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4 }
      else if (len === 127) return this.close(1009, "demasiado grande")
      if (!masked) return this.close(1002, "cliente sin máscara")
      if (len > MAX_FRAME) return this.close(1009, "demasiado grande")
      if (b.length < off + 4 + len) return
      const mask = b.subarray(off, off + 4)
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len))
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]
      this.buf = b.subarray(off + 4 + len)
      if (op === 8) return this.close(1000, "")
      if (op === 9) { try { this.socket.write(frame(10, payload)) } catch { /* nada */ } continue }
      if (op === 10) continue
      if (op === 1 || op === 0) {
        if (op === 1) { this.parts = []; this.partsLen = 0 }
        this.parts.push(payload); this.partsLen += payload.length
        if (this.partsLen > MAX_FRAME) return this.close(1009, "demasiado grande")
        if (fin) {
          const text = Buffer.concat(this.parts).toString("utf8"); this.parts = []; this.partsLen = 0
          const now = Date.now()
          if (now - this.msgWindow >= 1000) { this.msgWindow = now; this.msgs = 0 }
          if (++this.msgs > MAX_MSGS_PER_SEC) return this.close(4429, "demasiados mensajes")
          this.onText(text)
        }
      } else return this.close(1003, "solo texto")
    }
  }
}

function startRelay(opts = {}) {
  const maxRooms = opts.maxRooms || Number(process.env.MAX_ROOMS) || 1000
  const ttl = opts.roomTtlMs || Number(process.env.ROOM_TTL_MS) || 10 * 60 * 1000
  const allowed = String(opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const rooms = new Map() // code -> { host, guest, timer }
  const attempts = new Map() // ip -> { n, t }
  const stats = { rooms: 0, connections: 0 }

  const tooMany = (ip) => {
    const now = Date.now(), a = attempts.get(ip)
    if (!a || now - a.t > 60000) { attempts.set(ip, { n: 1, t: now }); return false }
    return ++a.n > 30
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [ip, a] of attempts) if (now - a.t > 60000) attempts.delete(ip) }, 30000)
  sweep.unref()

  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return }
    res.writeHead(426, { "content-type": "text/plain" }); res.end("Relay de Liga Funko-Patin: usar WebSocket.\n")
  })

  server.on("upgrade", (req, socket) => {
    const refuse = (status) => { try { socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`) } catch { /* nada */ } socket.destroy() }
    const key = req.headers["sec-websocket-key"]
    if (!key || String(req.headers.upgrade).toLowerCase() !== "websocket") return refuse("400 Bad Request")
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim()
    let url; try { url = new URL(req.url, "http://x") } catch { return refuse("400 Bad Request") }
    const room = url.searchParams.get("room") || "", role = url.searchParams.get("role") || ""

    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
      crypto.createHash("sha1").update(key + GUID).digest("base64") + "\r\n\r\n")

    let me = null
    const conn = new Conn(socket, (text) => { if (me) { const peer = role === "host" ? me.guest : me.host; if (peer) peer.send(text) } }, () => {
      if (!me) return
      const r = me; me = null
      const peer = role === "host" ? r.guest : r.host
      if (role === "host") { clearTimeout(r.timer); rooms.delete(room) } else r.guest = null
      if (peer) peer.close(1000, "el otro jugador se fue")
    })
    stats.connections++

    const origin = req.headers.origin
    if (allowed.length && !(origin && allowed.includes(origin))) return conn.close(4403, "origen no permitido")
    if (!ROOM_RE.test(room) || (role !== "host" && role !== "guest")) return conn.close(4400, "pedido inválido")
    if (tooMany(ip)) return conn.close(4429, "demasiados intentos")

    if (role === "host") {
      if (rooms.has(room)) return conn.close(4409, "sala ocupada")
      if (rooms.size >= maxRooms) return conn.close(4503, "servidor lleno")
      const r = { host: conn, guest: null, timer: null }
      r.timer = setTimeout(() => { if (!r.guest) conn.close(1000, "sala vencida") }, ttl)
      r.timer.unref()
      rooms.set(room, r); me = r; stats.rooms++
    } else {
      const r = rooms.get(room)
      if (!r) return conn.close(4404, "sala inexistente")
      if (r.guest) return conn.close(4409, "sala ocupada")
      r.guest = conn; me = r; clearTimeout(r.timer)
    }
  })

  return new Promise((resolve) => {
    server.listen(opts.port ?? Number(process.env.PORT ?? 8787), opts.host || process.env.HOST || "0.0.0.0", () => {
      resolve({ port: server.address().port, rooms, stats, close: () => new Promise((done) => { clearInterval(sweep); for (const r of rooms.values()) { r.host.end(); r.guest && r.guest.end() } server.close(() => done()); server.closeAllConnections?.() }) })
    })
  })
}

module.exports = { startRelay }
if (require.main === module) {
  startRelay().then((r) => console.log(`relay escuchando en el puerto ${r.port}`))
}
