import test from "node:test"
import assert from "node:assert/strict"
import { Camera, createWorld } from "../../lib/engine"
import type { Phase, Side, World } from "../../lib/engine"
import { drawHud, drawScene, drawSkater, hairStyle } from "../../lib/game/draw"

/** Canvas espía: no dibuja nada, pero registra los números que recibe (para cazar NaN/Infinity). */
function spyCtx() {
  const nums: number[] = []
  const bad: string[] = []
  const store: Record<string, unknown> = {}
  const note = (where: string, v: unknown) => {
    if (typeof v === "number") { nums.push(v); if (!Number.isFinite(v)) bad.push(where) }
  }
  const ctx = new Proxy(store, {
    get(t, k: string) {
      if (k in t) return t[k]
      if (k === "measureText") return () => ({ width: 40 })
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} })
      return (...a: unknown[]) => { a.forEach((v) => note(k, v)) }
    },
    set(t, k: string, v) { t[k] = v; note(`set ${k}`, v); return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, nums, bad }
}

const opts = (humanSide: Side | null, controlledId: string | null) => ({
  controlledId, humanSide, colors: ["#ffdf00", "#0a3161"] as [string, string],
  names: ["A", "B"] as [string, string], crests: ["🇧🇷", "🇺🇸"] as [string, string], alpha: 0.5, fontFamily: "system-ui",
})

function camFor(w: World, vw: number, vh: number) {
  const cam = new Camera()
  cam.update(1 / 60, w, "L1", vw, vh)
  return cam
}

test("dibujo: los 4 peinados se dibujan con números finitos a cualquier zoom", () => {
  const seen = new Set<number>()
  for (let i = 1; i < 300; i++) {
    const id = `L${i}`
    const st = hairStyle(id)
    if (seen.has(st * 100 + (i % 5))) continue
    seen.add(st * 100 + (i % 5))
    for (const ppm of [8, 22, 60, 200]) {
      const { ctx, bad } = spyCtx()
      const sk = { id, side: 0, x: 3, y: 4, px: 3, py: 4, vx: 1, vy: 0, radius: 0.5, heading: 1.1, stickAngle: 2, stamina: 60, isCaptain: i % 7 === 0 } as never
      drawSkater(ctx, sk, "#ffdf00", 0.5, false, false, 0, { mine: true, aura: "#fff", cue: "#facc15", passTarget: i % 2 === 0, ppm })
      assert.deepEqual(bad, [], `${id} (estilo ${st}) a ppm ${ppm}`)
    }
  }
  assert.ok([...seen].some((k) => Math.floor(k / 100) === 0) && [...seen].some((k) => Math.floor(k / 100) === 3), "se probaron estilos distintos")
})

test("dibujo: el pelo es estable (mismo jugador, mismos trazos, cuadro a cuadro)", () => {
  const draw = () => {
    const { ctx, nums } = spyCtx()
    const sk = { id: "L2", side: 0, x: 3, y: 4, px: 3, py: 4, vx: 0, vy: 0, radius: 0.5, heading: 0.3, stickAngle: 2, stamina: 100, isCaptain: false } as never
    drawSkater(ctx, sk, "#fff", 0, false, false, 0, { mine: false, aura: "#fff", cue: "#facc15", passTarget: false, ppm: 30 })
    return nums.join(",")
  }
  assert.equal(draw(), draw())
})

test("dibujo: escena y marcador en todas las fases, con y sin humano, en 3 tamaños de pantalla", () => {
  for (const phase of ["play", "timeOn", "goal", "ended"] as Phase[]) {
    for (const hs of [0, null] as const) {
      for (const [vw, vh] of [[844, 390], [667, 375], [932, 430]] as const) {
        const w = createWorld({ goalies: true })
        w.phase = phase
        w.clock = phase === "play" ? 7 : 0 // últimos segundos: reloj en rojo
        w.score = [3, 12]
        w.fouls = [1, 10]
        w.puck.carrierId = "L1"
        const cam = camFor(w, vw, vh)
        const { ctx, bad } = spyCtx()
        drawScene(ctx, w, cam, opts(hs, "L1"))
        drawHud(ctx, w, cam, { ...opts(hs, "L1"), showHint: true, demo: hs === null })
        assert.deepEqual(bad, [], `fase ${phase}, humano ${hs}, ${vw}x${vh}`)
      }
    }
  }
})

test("dibujo: marcador con puntos y faltas de 3 cifras no se rompe (se topa en 99)", () => {
  const w = createWorld({ goalies: false })
  w.score = [150, 7]
  w.fouls = [0, 123]
  const cam = camFor(w, 844, 390)
  const { ctx, bad } = spyCtx()
  drawHud(ctx, w, cam, opts(0, "L1"))
  assert.deepEqual(bad, [])
})
