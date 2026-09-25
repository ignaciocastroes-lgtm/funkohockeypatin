import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { GOALS, createWorld } from "../../lib/engine"
import type { GameEvent } from "../../lib/engine"
import {
  CROWD, bedGain, energyGain, equalPowerCurve, nextLoopStart, panFor, pickVariant, pressure, reactionFor, smoothExcitement,
} from "../../lib/game/crowd-mix"
import { CROWD_FILES } from "../../lib/game/crowd"
import { SFX_FILES, audioUrl } from "../../lib/game/sfx"

const world = (over: { x?: number; y?: number; clock?: number } = {}) => {
  const w = createWorld({ goalies: false })
  w.puck.x = over.x ?? 20
  w.puck.y = over.y ?? 10
  if (over.clock !== undefined) w.clock = over.clock
  return w
}

// ---------- tensión y entusiasmo ----------
test("tensión: en el medio de la pista está en reposo; pegado a una portería sube", () => {
  const calm = pressure(world())
  const hot = pressure(world({ x: GOALS[1].lineX - 1, y: GOALS[1].cy }))
  assert.ok(Math.abs(calm - CROWD.base) < 0.02, `reposo ${calm}`)
  assert.ok(hot > calm + 0.3, `cerca del arco ${hot}`)
})

test("tensión: sube en los últimos 10 s y en muerte súbita, y siempre queda en 0..1", () => {
  const base = pressure(world())
  assert.ok(pressure(world({ clock: 8 })) > base)
  const sd = world(); sd.suddenDeath = true
  assert.ok(pressure(sd) > base)
  for (const x of [-5, 0, 3, 20, 37, 45]) for (const y of [-2, 10, 25]) {
    const v = pressure(world({ x, y, clock: 5 }))
    assert.ok(v >= 0 && v <= 1, `(${x},${y}) → ${v}`)
  }
})

test("tensión: al terminar el partido baja a un valor tranquilo", () => {
  const w = world({ x: GOALS[1].lineX - 1, y: GOALS[1].cy }); w.phase = "ended"
  assert.ok(pressure(w) <= 0.25)
})

test("entusiasmo: sube más rápido de lo que baja, y no depende de la tasa de cuadros", () => {
  const up = smoothExcitement(0.2, 1, 1) - 0.2
  const down = 0.8 - smoothExcitement(0.8, 0, 1)
  // mismo tramo (0.8) recorrido en un sentido y en el otro: subir tiene que ser claramente más rápido
  assert.ok(up > down * 1.5, `sube ${up.toFixed(3)} vs baja ${down.toFixed(3)}`)
  let a = 0.2, b = 0.2
  for (let i = 0; i < 60; i++) a = smoothExcitement(a, 1, 1 / 60)
  for (let i = 0; i < 20; i++) b = smoothExcitement(b, 1, 1 / 20)
  assert.ok(Math.abs(a - b) < 0.01, `60 fps ${a.toFixed(3)} vs 20 fps ${b.toFixed(3)}`)
})

test("entusiasmo: dt cero o negativo no lo mueve (ni rompe)", () => {
  assert.equal(smoothExcitement(0.4, 1, 0), 0.4)
  assert.equal(smoothExcitement(0.4, 1, -1), 0.4)
})

// ---------- niveles por capa ----------
test("niveles: el murmullo siempre suena y crece; el bucle entusiasmado es mudo en calma y entra al subir", () => {
  assert.ok(bedGain(0) > 0.2 && bedGain(1) > bedGain(0) && bedGain(1) <= CROWD.bedMax + 1e-9)
  assert.equal(energyGain(0), 0)
  assert.equal(energyGain(0.3), 0)
  assert.ok(energyGain(0.6) > 0 && energyGain(1) > energyGain(0.6) && energyGain(1) <= CROWD.energyMax + 1e-9)
})

test("niveles: valores fuera de rango no producen números raros", () => {
  for (const e of [-3, 0, 0.5, 1, 7]) {
    assert.ok(Number.isFinite(bedGain(e)) && Number.isFinite(energyGain(e)))
    assert.ok(bedGain(e) <= CROWD.bedMax + 1e-9 && energyGain(e) <= CROWD.energyMax + 1e-9)
  }
})

// ---------- reacciones a eventos ----------
const G = (side: 0 | 1, combo = false): GameEvent => ({ type: "goal", side, combo })

test("gol: el propio se festeja (roar); el del rival, la tribuna se calla (no hay abucheo real todavía)", () => {
  const mine = reactionFor(G(0), 0)!
  const theirs = reactionFor(G(1), 0)!
  assert.ok(mine.roar, "el gol propio debe traer roar")
  assert.equal(theirs.roar, undefined, "el gol del rival no debe traer roar")
  assert.ok(theirs.bump < mine.bump, "el gol del rival apaga el entusiasmo, no lo sube")
  assert.ok(reactionFor(G(0, true), 0)!.roar!.gain > reactionFor(G(0, false), 0)!.roar!.gain, "el golazo (combo) festeja más que el gol común")
  assert.equal(reactionFor(G(0), 0)!.bump, 1)
})

test("gol: el lado del festejo es la portería donde entró (anota el 0 → portería del 1)", () => {
  assert.equal(reactionFor(G(0), 0)!.roar!.goalSide, 1)
})

test("penal: trae tambores además del golpe de entusiasmo y el silbato bajando al público", () => {
  const r = reactionFor({ type: "penalty", side: 0, shooterId: "L1" }, 0)!
  assert.ok(r.drums! > 0)
  assert.ok(r.duck)
})

test("demo (sin equipo propio): festeja parejo los goles de los dos lados", () => {
  assert.equal(reactionFor(G(0), null)!.roar!.gain, reactionFor(G(1), null)!.roar!.gain)
})

test("palo, atajada, tiro fuerte: reacción corta; un toque normal del puck no hace nada", () => {
  assert.ok(reactionFor({ type: "post", speed: 12 }, 0)!.react! > 0)
  assert.ok(reactionFor({ type: "save", speed: 12, combo: true }, 0)!.react! > reactionFor({ type: "save", speed: 12 }, 0)!.react!)
  assert.ok(reactionFor({ type: "kick", id: "L1", speed: 20, superShot: true }, 0))
  assert.equal(reactionFor({ type: "kick", id: "L1", speed: 8 }, 0), null)
  assert.equal(reactionFor({ type: "board", speed: 9 }, 0), null)
  assert.equal(reactionFor({ type: "pickup", id: "L1" }, 0), null)
})

test("silbato: falta, penal, saque y final bajan al público un instante (para que se escuche)", () => {
  for (const ev of [{ type: "foul", id: "L1", victim: "V1", side: 0, impact: 5 }, { type: "penalty", side: 0, shooterId: "L1" }, { type: "kickoff" }, { type: "end" }] as GameEvent[]) {
    const r = reactionFor(ev, 0)!
    assert.ok(r.duck && r.duck.amount > 0 && r.duck.amount < 1 && r.duck.seconds > 0, ev.type)
  }
})

test("todas las reacciones tienen valores en rango", () => {
  const evs: GameEvent[] = [G(0), G(1, true), { type: "post", speed: 1 }, { type: "save", speed: 1 }, { type: "kick", id: "L1", speed: 20, superShot: true },
    { type: "combo", side: 0, touches: 3, kind: "attack" }, { type: "foul", id: "L1", victim: "V1", side: 0, impact: 1 }, { type: "penalty", side: 1, shooterId: "V1" }, { type: "kickoff" }, { type: "end" }]
  for (const ev of evs) {
    const r = reactionFor(ev, 0)!
    assert.ok(r.bump >= 0 && r.bump <= 1, `${ev.type} bump`)
    if (r.roar) assert.ok(r.roar.gain > 0 && r.roar.gain <= 1, `${ev.type} roar`)
    if (r.react !== undefined) assert.ok(r.react > 0 && r.react <= 1, `${ev.type} react`)
  }
})

// ---------- paneo ----------
test("paneo: lo que pasa a la derecha de la cámara suena a la derecha, y nunca se abre del todo", () => {
  assert.ok(panFor(30, 20, 22) > 0)
  assert.ok(panFor(10, 20, 22) < 0)
  assert.equal(panFor(20, 20, 22), 0)
  assert.equal(panFor(1e6, 20, 22), 0.6)
  assert.equal(panFor(-1e6, 20, 22), -0.6)
  assert.ok(Number.isFinite(panFor(5, 20, 0)), "ancho de cámara cero no rompe")
})

// ---------- empalme de bucles ----------
test("fundido en cruz: potencia constante (entrada² + salida² = 1) y extremos correctos", () => {
  const a = equalPowerCurve(64, "in"), b = equalPowerCurve(64, "out")
  assert.equal(a[0], 0); assert.ok(Math.abs(a[63] - 1) < 1e-6)
  assert.ok(Math.abs(b[0] - 1) < 1e-6); assert.ok(Math.abs(b[63]) < 1e-6)
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(a[i] ** 2 + b[i] ** 2 - 1) < 1e-5, `punto ${i}`)
  assert.ok(equalPowerCurve(0, "in").length >= 2, "nunca devuelve una curva vacía")
})

test("bucles: cada vuelta arranca antes de que termine la anterior (solape = el fundido)", () => {
  const next = nextLoopStart(10, 6, 1.4)
  assert.ok(Math.abs(next - 14.6) < 1e-9)
  assert.ok(next < 10 + 6, "se solapan")
  assert.ok(nextLoopStart(0, 4, 10) >= 0 + 4 / 2 - 1e-9, "el fundido nunca pasa de la mitad del audio")
})

test("variantes: nunca repite la anterior y las usa todas", () => {
  const seen = new Set<number>()
  for (let i = 0; i < 200; i++) {
    const r = i / 200
    for (const last of [-1, 0, 1]) {
      const v = pickVariant(2, last, r)
      assert.ok(v === 0 || v === 1)
      if (last >= 0) assert.notEqual(v, last)
      seen.add(v)
    }
  }
  assert.equal(seen.size, 2)
  assert.equal(pickVariant(1, 0, 0.9), 0)
})

// ---------- dónde están los audios ----------
test("audioUrl: sin incrustados va a /audio/; con incrustados (juego.html) usa el data: URI", () => {
  const g = globalThis as unknown as { window?: unknown }
  const before = g.window
  try {
    delete g.window
    assert.equal(audioUrl("crowd-roar-1.mp3"), "/audio/crowd-roar-1.mp3")
    g.window = { __FP_AUDIO__: { "crowd-roar-1.mp3": "data:audio/mpeg;base64,AAAA" } }
    assert.equal(audioUrl("crowd-roar-1.mp3"), "data:audio/mpeg;base64,AAAA")
    assert.equal(audioUrl("crowd-react.mp3"), "/audio/crowd-react.mp3", "el que no está incrustado cae a /audio/")
  } finally { g.window = before }
})

const AUDIO_DIR = resolve(__dirname, "../../../public/audio")

test("assets: existen los 6 audios declarados, son MP3 válidos y pesan poco", () => {
  let total = 0
  for (const f of Object.values(CROWD_FILES)) {
    const p = resolve(AUDIO_DIR, f)
    assert.ok(existsSync(p), `falta ${f}`)
    const buf = readFileSync(p)
    total += buf.length
    const sync = buf.subarray(0, 3).toString("latin1") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
    assert.ok(sync, `${f} no parece un MP3`)
    assert.ok(buf.length > 5_000 && buf.length < 200_000, `${f}: ${buf.length} bytes`)
  }
  assert.ok(total < 700_000, `los audios suman ${total} bytes (tope 700 KB)`)
})

test("assets: no hay archivos de más en public/audio, ni los ORIGINALES de las grabaciones (licencia)", () => {
  const declared = new Set<string>([...Object.values(CROWD_FILES), ...Object.values(SFX_FILES)])
  for (const f of readdirSync(AUDIO_DIR)) assert.ok(declared.has(f), `archivo no declarado en public/audio: ${f}`)
  // los originales (con el id de Pixabay en el nombre) no se redistribuyen tal cual: solo las versiones procesadas
  const bad = /(mykelu|arunangshubanerjee|u_xg7ssi08yr|vishiv).*\.mp3$/
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
    if (n === "node_modules" || n === ".next" || n === ".test-build" || n.startsWith(".")) return []
    const p = resolve(d, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  const offenders = walk(resolve(AUDIO_DIR, "../..")).filter((p) => bad.test(p))
  assert.deepEqual(offenders, [])
})



