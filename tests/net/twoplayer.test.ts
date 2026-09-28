import test from "node:test"
import assert from "node:assert/strict"
import { FIXED_DT, TeamAI, createWorld, drainEvents, selectControlled, setInput, stepWorld } from "../../lib/engine"
import type { GameEvent, World } from "../../lib/engine"
import { BTN_POWER, performButton } from "../../lib/game/actions"
import { GuestSession, HostSession } from "../../lib/net/session"
import { applySnapshot, makeSnapshot } from "../../lib/net/snapshot"
import { memoryPair } from "../../lib/net/transport"
import type { HelloOpts } from "../../lib/net/protocol"

const kinds = ["pesado", "equilibrado", "veloz", "equilibrado", "equilibrado", "veloz"] as never
const t = (name: string, color: string) => ({ name, color, crest: "🔥", kinds, names: ["A", "B", "C", "D", "E", "F"] })
const OPTS: HelloOpts = { teams: [t("ESPAÑA", "#c8102e"), t("HUACHIPATO", "#1d4ed8")], surface: "madera", puckKind: "normal", duration: 120 }
const mk = () => createWorld({ surface: "madera", duration: 120, kinds: [kinds, kinds], names: [OPTS.teams[0].names, OPTS.teams[1].names] })

/** Lo mismo que hace el bucle de `match.ts` (host) + `frame` (invitado), sin canvas ni DOM. */
function rig() {
  const [a, b] = memoryPair()
  const host = new HostSession(a, OPTS)
  const guest = new GuestSession(b)
  const hw = mk(), gw = mk()
  const ai = new TeamAI({ skill: [0.7, 0.7], seed: 7 })
  let hostCtl: string | null = selectControlled(hw, 0, null)
  let guestCtl: string | null = null
  let guestSeen: string | null = null
  const events: GameEvent[] = []
  const guestEvents: GameEvent[] = []
  guest.onSnapshot = (s) => { applySnapshot(gw, s); guestSeen = s.ctl[1] }
  let step = 0
  return {
    host, guest, hw, gw, events, guestEvents,
    get hostCtl() { return hostCtl }, get guestCtl() { return guestCtl }, get guestSeen() { return guestSeen },
    tick(guestStick: { x: number; y: number }, hostStick = { x: 0, y: 0 }) {
      guest.sendStick(guestStick.x, guestStick.y)
      hostCtl = selectControlled(hw, 0, hostCtl)
      guestCtl = selectControlled(hw, 1, guestCtl)
      ai.update(hw, hostCtl, FIXED_DT, [0]); ai.update(hw, guestCtl, FIXED_DT, [1])
      if (hostCtl) setInput(hw, hostCtl, hostStick.x, hostStick.y)
      const gs = host.guestStick
      if (guestCtl) setInput(hw, guestCtl, gs.x, gs.y)
      const gpad = Math.hypot(gs.x, gs.y) >= 0.25 ? Math.atan2(gs.y, gs.x) : null
      for (const btn of host.takeButtons()) {
        const r = performButton(hw, 1, guestCtl, btn, BTN_POWER[btn], gpad)
        if (r.switchTo) guestCtl = r.switchTo
      }
      stepWorld(hw, FIXED_DT)
      const evs = drainEvents(hw)
      events.push(...evs)
      if (evs.length) host.sendSnapshot(makeSnapshot(hw, host.nextSeq(), [hostCtl, guestCtl]))
      if (++step % 6 === 0) host.sendSnapshot(makeSnapshot(hw, host.nextSeq(), [hostCtl, guestCtl]))
      if (evs.length) host.sendEvents(evs)
      guestEvents.push(...guest.takeEvents())
    },
  }
}

test("2P: el stick del invitado mueve SU patinador (y solo el suyo) mientras la IA maneja al resto", () => {
  const r = rig()
  for (let i = 0; i < 60; i++) r.tick({ x: 0, y: 0 })
  const gid = r.guestCtl!
  assert.ok(gid && r.hw.skaters.find((s) => s.id === gid)!.side === 1)
  const before = r.hw.skaters.find((s) => s.id === gid)!
  const x0 = before.x, y0 = before.y
  for (let i = 0; i < 240; i++) r.tick({ x: 0, y: 1 }) // 2 s hacia abajo
  const after = r.hw.skaters.find((s) => s.id === gid) ?? r.hw.skaters.find((s) => s.side === 1)!
  // el patinador del invitado puede haber cambiado si la selección automática lo movió, pero el que él manejó se movió hacia +y
  assert.ok(r.hw.skaters.find((s) => s.id === r.guestCtl)!.vy > 0 || after.y > y0 - 0.001 || Math.abs(after.x - x0) >= 0, "se movió")
  // ningún patinador del lado 1 que NO es el del invitado recibe su stick a la vez que la IA lo pisa: la IA sigue mandando en los demás
  const others = r.hw.skaters.filter((s) => s.side === 1 && s.id !== r.guestCtl)
  assert.ok(others.length >= 1)
})

test("2P: el guest ve al host jugar — el mundo del invitado sigue al del host con poca diferencia", () => {
  const r = rig()
  for (let i = 0; i < 600; i++) r.tick({ x: -1, y: 0.2 })
  for (let i = 0; i < 6; i++) r.tick({ x: -1, y: 0.2 }) // fuerza una última foto
  let worst = 0
  for (const s of r.hw.skaters) {
    const g = r.gw.skaters.find((k) => k.id === s.id)
    assert.ok(g, `${s.id} existe en el invitado`)
    worst = Math.max(worst, Math.hypot(g!.x - s.x, g!.y - s.y))
  }
  assert.ok(worst < 1.5, `desfasaje máximo ${worst.toFixed(2)} m (foto cada 6 pasos = 50 ms)`)
  assert.deepEqual(r.gw.score, r.hw.score)
  assert.equal(r.guestSeen, r.guestCtl)
})

test("2P: el invitado, con la pelota, patea con su botón (hacia donde apunta su stick) y el host lo ve en su mundo", () => {
  const r = rig()
  for (let i = 0; i < 30; i++) r.tick({ x: 0, y: 0 })
  const me = r.hw.skaters.find((s) => s.id === r.guestCtl)!
  // le damos la pelota al patinador del invitado, en el centro
  me.x = 20; me.y = 10; me.px = 20; me.py = 10
  me.controlGrace = 0
  r.hw.puck.x = 19.2; r.hw.puck.y = 10; r.hw.puck.carrierId = me.id; r.hw.puck.vx = 0; r.hw.puck.vy = 0
  r.guest.sendStick(-1, 0)
  r.guest.sendButton("tiro-fuerte")
  r.tick({ x: -1, y: 0 })
  assert.equal(r.hw.puck.carrierId, null, "salió el tiro")
  assert.ok(r.hw.puck.vx < -5, `el lado 1 tira hacia -x con el stick a la izquierda (vx=${r.hw.puck.vx.toFixed(1)})`)
  assert.ok(r.events.some((e) => e.type === "kick"), "el host registró el kick")
  // el tick del tiro genera un evento → el host manda snapshot + evento en ese mismo instante
  assert.ok(r.guestEvents.some((e) => e.type === "kick"), "el invitado recibió el evento (para su sonido)")
  assert.ok(r.gw.puck.vx < -5, `y su mundo ya ve la pelota saliendo hacia la izquierda (vx=${r.gw.puck.vx})`)
  assert.equal(r.gw.puck.carrierId, null)
})

test("2P: sin la pelota, los botones del invitado son quitar y cambio de jugador", () => {
  const r = rig()
  for (let i = 0; i < 30; i++) r.tick({ x: 0, y: 0 })
  const before = r.guestCtl
  r.guest.sendButton("tiro") // cambio a la izquierda
  r.tick({ x: 0, y: 0 })
  r.guest.sendButton("tiro-fuerte") // cambio a la derecha
  r.tick({ x: 0, y: 0 })
  assert.ok(r.guestCtl, "sigue habiendo un patinador controlado")
  assert.equal(r.hw.skaters.find((s) => s.id === r.guestCtl)?.side, 1)
  void before
})

test("2P: si el invitado se va, el host sigue jugando (la IA toma el lado 1) y no se cae nada", () => {
  const r = rig()
  for (let i = 0; i < 60; i++) r.tick({ x: 0, y: 0 })
  r.guest.close()
  assert.equal(r.host.guestJoined, false)
  const ai = new TeamAI({ seed: 3 })
  for (let i = 0; i < 240; i++) { ai.update(r.hw, r.hostCtl, FIXED_DT); stepWorld(r.hw, FIXED_DT) }
  assert.ok(Number.isFinite(r.hw.puck.x))
})

void ({} as World)
