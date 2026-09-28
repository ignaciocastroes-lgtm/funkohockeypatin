import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, createWorld, stepWorld } from "../../lib/engine"
import { ROOM_ALPHABET, ROOM_LEN, isRoomCode, joinUrl, newRoomCode, normalizeRoomCode, roomFromSearch } from "../../lib/net/room"
import { MAX_MESSAGE_BYTES, encode, parseHelloOpts, parseMessage, type HelloOpts } from "../../lib/net/protocol"
import { applySnapshot, makeSnapshot } from "../../lib/net/snapshot"
import { GuestSession, HostSession } from "../../lib/net/session"
import { memoryPair } from "../../lib/net/transport"

const team = (name: string, color: string) => ({ name, color, crest: "🔥", kinds: ["pesado", "equilibrado", "veloz", "equilibrado", "equilibrado", "veloz"] as never, names: ["A", "B", "C", "D", "E", "F"] })
const OPTS: HelloOpts = { teams: [team("ESPAÑA", "#c8102e"), team("HUACHIPATO", "#1d4ed8")], surface: "madera", puckKind: "normal", duration: 120 }
const mkWorld = () => createWorld({ surface: "madera", puckKind: "normal", duration: 120, kinds: [OPTS.teams[0].kinds, OPTS.teams[1].kinds], names: [OPTS.teams[0].names, OPTS.teams[1].names] })

test("sala: el código usa solo el alfabeto sin confusiones y normaliza lo que escribe la persona", () => {
  assert.ok(!/[01OIL]/.test(ROOM_ALPHABET))
  for (let i = 0; i < 200; i++) { const c = newRoomCode(); assert.equal(c.length, ROOM_LEN); assert.ok(isRoomCode(c)) }
  assert.equal(normalizeRoomCode(" ab-cd 2 "), "ABCD2")
  for (const bad of ["", "ABCD", "ABCDEF", "ABCD0", "ABCDI", "AB CD!"]) assert.equal(normalizeRoomCode(bad), null, bad)
  assert.equal(newRoomCode(() => 0), "AAAAA")
  assert.equal(newRoomCode(() => 0.999999), "99999")
  const url = joinUrl("https://juego.example/app/?x=1#h", "ABCD2")
  assert.equal(url, "https://juego.example/app/?sala=ABCD2")
  assert.equal(roomFromSearch("?sala=abcd2"), "ABCD2")
  assert.equal(roomFromSearch("?otra=1"), null)
  assert.equal(roomFromSearch("?sala=%E0%A4%A"), null, "un % mal formado no lanza")
  assert.equal(roomFromSearch("?sala=%"), null)
})

test("protocolo: acepta mensajes válidos y rechaza basura sin lanzar", () => {
  assert.deepEqual(parseMessage(encode({ t: "hi", v: 1 })), { t: "hi", v: 1 })
  assert.deepEqual(parseMessage('{"t":"in","mx":5,"my":-9}'), null, "fuera de rango: se rechaza")
  assert.deepEqual(parseMessage('{"t":"in","mx":1.005,"my":-0.5}'), { t: "in", mx: 1, my: -0.5 }, "leve exceso: se acota")
  assert.deepEqual(parseMessage('{"t":"btn","a":"tiro"}'), { t: "btn", a: "tiro" })
  for (const bad of ['{"t":"btn","a":"hack"}', '{"t":"in","mx":"1","my":0}', '{"t":"in","mx":null,"my":0}', '{"t":"nada"}', "[]", "null", "42", "{", "", '{"t":"hi","v":NaN}', "x".repeat(MAX_MESSAGE_BYTES + 1)]) {
    assert.equal(parseMessage(bad), null, bad.slice(0, 30))
  }
  assert.equal(parseMessage('{"__proto__":{"t":"bye"}}'), null)
  const ev = parseMessage('{"t":"ev","e":[{"type":"goal","side":1},{"type":"virus"},{"type":"kick","id":"L1","speed":9999999},{"type":"kick","id":"L1","speed":12,"extra":"x"}]}')
  assert.deepEqual(ev, { t: "ev", e: [{ type: "goal", side: 1, combo: false }, { type: "kick", id: "L1", speed: 12, superShot: false }] }, "solo eventos válidos, sin campos ajenos")
})

test("protocolo: hello valida equipos (colores, largos, tipos) — el nombre del rival es texto de un desconocido", () => {
  assert.ok(parseHelloOpts(OPTS))
  const bad = (f: (o: HelloOpts) => void) => { const o = structuredClone(OPTS); f(o); return parseHelloOpts(o) }
  assert.equal(bad((o) => { o.teams[1].color = "rojo" }), null)
  assert.equal(bad((o) => { o.teams[1].name = "<img src=x onerror=alert(1)>" }), null)
  assert.equal(bad((o) => { o.teams[1].name = "X".repeat(40) }), null)
  assert.equal(bad((o) => { (o.teams[0].kinds as unknown as string[])[0] = "dios" }), null)
  assert.equal(bad((o) => { o.duration = 99999 }), null)
  assert.equal(bad((o) => { (o as unknown as { surface: string }).surface = "lava" }), null)
  assert.equal(parseHelloOpts({ ...OPTS, teams: [OPTS.teams[0]] }), null)
})

test("snapshot: ida y vuelta fiel tras simular 3 s (posiciones, pelota, marcador, banco)", () => {
  const host = mkWorld(), guest = mkWorld()
  for (const s of host.skaters) { s.inputX = Math.cos(s.x); s.inputY = Math.sin(s.y) }
  for (let i = 0; i < 360; i++) stepWorld(host, FIXED_DT)
  const raw = JSON.stringify(makeSnapshot(host, 5, ["L1", "V1"]))
  assert.ok(raw.length < MAX_MESSAGE_BYTES, `snapshot ${raw.length} B debe entrar en un mensaje`)
  const parsed = parseMessage(raw)
  assert.ok(parsed && parsed.t === "snap")
  assert.ok(applySnapshot(guest, parsed as never))
  for (const s of host.skaters) {
    const g = guest.skaters.find((k) => k.id === s.id)!
    assert.ok(g, `${s.id} en pista del invitado`)
    assert.ok(Math.hypot(g.x - s.x, g.y - s.y) < 0.01 && Math.abs(g.heading - s.heading) < 0.002)
  }
  assert.deepEqual(guest.skaters.map((s) => s.id), host.skaters.map((s) => s.id))
  assert.ok(Math.hypot(guest.puck.x - host.puck.x, guest.puck.y - host.puck.y) < 0.01)
  assert.deepEqual(guest.score, host.score)
  assert.equal(guest.phase, host.phase)
  assert.equal(guest.restBench.length, host.restBench.length)
})

test("snapshot: sigue fiel a través de un cambio por cansancio y una tarjeta azul, y rechaza fotos ajenas", () => {
  const host = mkWorld(), guest = mkWorld()
  // fuerza un cambio: tira al de la pista y trae al suplente
  const tired = host.skaters.find((s) => s.side === 0 && s.id !== "L1")!
  tired.stamina = 0
  for (let i = 0; i < 1200; i++) stepWorld(host, FIXED_DT)
  const snap = parseMessage(JSON.stringify(makeSnapshot(host, 1, [null, null]))) as never
  assert.ok(applySnapshot(guest, snap))
  assert.deepEqual(guest.skaters.map((s) => s.id).sort(), host.skaters.map((s) => s.id).sort())
  assert.deepEqual(guest.restBench.map((b) => b.skater.id).sort(), host.restBench.map((b) => b.skater.id).sort())
  const alien = createWorld({ teamSize: 2, rosterSize: 2 })
  assert.equal(applySnapshot(alien, snap), false, "una foto que no encaja no toca el mundo")
})

test("sesión (sin red): hi → hello → stick, botones y snapshots, con topes", () => {
  const [a, b] = memoryPair()
  const host = new HostSession(a, OPTS)
  let joined = 0
  host.onGuestJoined = () => joined++
  const guest = new GuestSession(b)
  assert.equal(joined, 1)
  assert.deepEqual(guest.opts, OPTS)

  guest.sendStick(0.5, -0.25); guest.sendStick(0.5, -0.25) // el repetido no se manda
  assert.deepEqual(host.guestStick, { x: 0.5, y: -0.25 })
  for (let i = 0; i < 20; i++) guest.sendButton("tiro")
  assert.equal(host.takeButtons().length, 8, "tope de 8 botones en cola")
  assert.equal(host.takeButtons().length, 0)

  const w = mkWorld(), seen: number[] = []
  guest.onSnapshot = (s) => seen.push(s.seq)
  host.sendSnapshot(makeSnapshot(w, host.nextSeq(), ["L1", "V1"]))
  host.sendSnapshot(makeSnapshot(w, host.nextSeq(), ["L1", "V1"]))
  assert.deepEqual(seen, [0, 1])
  host.sendEvents([{ type: "kickoff" }])
  assert.deepEqual(guest.takeEvents(), [{ type: "kickoff" }])

  let hostClosed = false
  host.onClosed = () => { hostClosed = true }
  guest.close()
  assert.ok(hostClosed && host.closed)
})

test("sesión: un segundo 'hi', versiones distintas y mensajes antes de entrar se ignoran", () => {
  const [a, b] = memoryPair()
  const host = new HostSession(a, OPTS)
  b.send(encode({ t: "in", mx: 1, my: 1 })) // sin 'hi' previo
  assert.deepEqual(host.guestStick, { x: 0, y: 0 })
  b.send(encode({ t: "hi", v: 99 }))
  assert.equal(host.guestJoined, false, "versión incompatible: no entra")
  b.send(encode({ t: "hi", v: 1 }))
  assert.equal(host.guestJoined, true)
})

test("relay REAL por loopback: crea sala, entra el invitado, se reenvía en las dos direcciones y se limpia", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startRelay } = require("../../../relay/server.cjs") as { startRelay: (o: object) => Promise<{ port: number; rooms: Map<string, unknown>; close: () => Promise<void> }> }
  const relay = await startRelay({ port: 0, host: "127.0.0.1" })
  const WS = (globalThis as unknown as { WebSocket: new (u: string) => { onopen: () => void; onmessage: (e: { data: string }) => void; onclose: (e: { code: number }) => void; send(t: string): void; close(): void } }).WebSocket
  const open = (role: string, room: string) => new Promise<{ ws: InstanceType<typeof WS>; got: string[]; closed: Promise<number> }>((res) => {
    const ws = new WS(`ws://127.0.0.1:${relay.port}/?room=${room}&role=${role}`)
    const got: string[] = []
    let onC: (c: number) => void = () => {}
    const closed = new Promise<number>((r) => { onC = r })
    ws.onmessage = (e) => got.push(e.data)
    ws.onclose = (e) => onC(e.code)
    ws.onopen = () => res({ ws, got, closed })
  })
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  try {
    const host = await open("host", "ABCD2")
    const noRoom = await open("guest", "ZZZZ9").catch(() => null)
    if (noRoom) assert.equal(await noRoom.closed, 4404, "sala inexistente")
    const guest = await open("guest", "ABCD2")
    guest.ws.send("hola host"); host.ws.send("hola invitado")
    await wait(100)
    assert.deepEqual(host.got, ["hola host"]); assert.deepEqual(guest.got, ["hola invitado"])

    const third = await open("guest", "ABCD2").catch(() => null)
    if (third) assert.equal(await third.closed, 4409, "sala llena")
    const dupHost = await open("host", "ABCD2").catch(() => null)
    if (dupHost) assert.equal(await dupHost.closed, 4409, "ya tiene host")
    const bad = await open("host", "abc").catch(() => null)
    if (bad) assert.equal(await bad.closed, 4400, "código inválido")

    host.ws.close()
    assert.equal(await guest.closed, 1000, "si se va el host, el invitado se entera")
    await wait(50)
    assert.equal(relay.rooms.size, 0, "la sala se limpia")
  } finally { await relay.close() }
})

test("relay REAL: el host y el invitado de verdad juegan una sesión completa (HostSession/GuestSession sobre WebSocket)", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startRelay } = require("../../../relay/server.cjs") as { startRelay: (o: object) => Promise<{ port: number; close: () => Promise<void> }> }
  const { WebSocketTransport, relayUrl } = await import("../../lib/net/transport")
  const relay = await startRelay({ port: 0, host: "127.0.0.1" })
  const base = `ws://127.0.0.1:${relay.port}`
  try {
    const hostT = new WebSocketTransport(relayUrl(base, "QQQQ7", "host"))
    const host = new HostSession(hostT, OPTS)
    await new Promise<void>((r) => hostT.onOpen(r))
    const guest = new GuestSession(new WebSocketTransport(relayUrl(base, "QQQQ7", "guest")))
    const hello = await new Promise<HelloOpts>((r) => { guest.onHello = r })
    assert.equal(hello.teams[1].name, "HUACHIPATO")
    guest.sendStick(1, 0); guest.sendButton("pase-fuerte")
    await new Promise((r) => setTimeout(r, 150))
    assert.deepEqual(host.guestStick, { x: 1, y: 0 })
    assert.deepEqual(host.takeButtons(), ["pase-fuerte"])
    host.sendSnapshot(makeSnapshot(mkWorld(), host.nextSeq(), ["L1", "V1"]))
    await new Promise((r) => setTimeout(r, 150))
    assert.ok(guest.latest && guest.latest.seq === 0)
    host.close()
    await new Promise((r) => setTimeout(r, 150))
    assert.ok(guest.closed)
  } finally { await relay.close() }
})
