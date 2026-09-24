import test from "node:test"
import assert from "node:assert/strict"
import {
  AURA_MIN_CONTRAST, CUE_MIN_DISTANCE, FLOOR_BASE,
  GOALIE_STICK_MAX_TURN, PLATE_BRAND_H, auraColor, canvasFontFamily, colorDistance, edgeAnchor, goalieStickAngle, hudAvoidRects, plateSize, pickCueColor, slideOffRects,
} from "../../lib/game/cues"
import { DEFAULT_TEAMS, distinctColors } from "../../lib/app/teams"
import type { Surface } from "../../lib/engine"

const SURFACES = Object.keys(FLOOR_BASE) as Surface[]

test("marcador propio: se separa del color del equipo en TODAS las selecciones de fábrica", () => {
  for (const t of DEFAULT_TEAMS) {
    const cue = pickCueColor(t.color)
    assert.ok(colorDistance(t.color, cue) >= CUE_MIN_DISTANCE, `${t.name}: ${cue} se parece a ${t.color}`)
  }
})

test("marcador propio: amarillo por defecto, blanco para los equipos amarillo/naranja (Brasil, Angola)", () => {
  assert.equal(pickCueColor("#6cace4"), "#facc15") // Argentina
  assert.equal(pickCueColor("#ffdf00"), "#ffffff") // Brasil: el amarillo se perdía contra su propio cuerpo
  assert.equal(pickCueColor("#f9a01b"), "#ffffff") // Angola
})

test("marcador propio: cualquier color válido devuelve algún candidato (nunca rompe)", () => {
  for (const c of ["#000000", "#ffffff", "#808080", "#ff00ff", "#00ffff", "#facc15"]) {
    assert.match(pickCueColor(c), /^#[0-9a-f]{6}$/)
  }
})

test("aura: todo equipo de fábrica se separa de las tres pistas", () => {
  for (const t of DEFAULT_TEAMS) {
    for (const s of SURFACES) {
      const a = auraColor(t.color, FLOOR_BASE[s])
      assert.ok(colorDistance(a, FLOOR_BASE[s]) >= AURA_MIN_CONTRAST, `${t.name} sobre ${s}: aura ${a}`)
    }
  }
})

test("aura: un color que ya contrasta no se toca; uno oscuro sobre pista azul se aclara", () => {
  assert.equal(auraColor("#ffdf00", FLOOR_BASE.sintetico), "#ffdf00")
  const usa = "#0a3161" // EE.UU.: distancia 29 contra el sintético antes del cambio
  assert.ok(colorDistance(usa, FLOOR_BASE.sintetico) < 60)
  assert.notEqual(auraColor(usa, FLOOR_BASE.sintetico), usa)
})

test("aura: el color de contraste que elige distinctColors para la visita también se ve sobre el piso", () => {
  const [, visit] = distinctColors("#c8102e", "#e63946") // España vs Andorra: se parecen
  for (const s of SURFACES) assert.ok(colorDistance(auraColor(visit, FLOOR_BASE[s]), FLOOR_BASE[s]) >= AURA_MIN_CONTRAST)
})

const VW = 844, VH = 390, M = 24

test("flecha de borde: un punto visible no genera flecha", () => {
  assert.equal(edgeAnchor(VW / 2, VH / 2, VW, VH, M), null)
  assert.equal(edgeAnchor(M, M, VW, VH, M), null) // justo en el límite: se ve
})

test("flecha de borde: cae sobre el borde interior y apunta hacia el punto", () => {
  const right = edgeAnchor(VW + 300, VH / 2, VW, VH, M)!
  assert.ok(Math.abs(right.x - (VW - M)) < 1e-6 && Math.abs(right.y - VH / 2) < 1e-6)
  assert.ok(Math.abs(right.angle) < 1e-9)
  const up = edgeAnchor(VW / 2, -500, VW, VH, M)!
  assert.ok(Math.abs(up.y - M) < 1e-6 && Math.abs(up.angle + Math.PI / 2) < 1e-9)
  const corner = edgeAnchor(VW + 900, VH + 900, VW, VH, M)!
  assert.ok(corner.x <= VW - M + 1e-6 && corner.y <= VH - M + 1e-6)
})

test("flecha de borde: para cualquier punto lejano queda dentro del rectángulo útil", () => {
  for (const [vw, vh] of [[844, 390], [812, 375], [667, 375], [932, 430]] as const) {
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2
      const p = edgeAnchor(vw / 2 + Math.cos(a) * 2000, vh / 2 + Math.sin(a) * 2000, vw, vh, M)!
      assert.ok(p.x >= M - 1e-6 && p.x <= vw - M + 1e-6 && p.y >= M - 1e-6 && p.y <= vh - M + 1e-6, `${vw}x${vh} ángulo ${k}`)
    }
  }
})

test("flechas: nunca quedan encima de la placa ni de los botones, en ninguna dirección ni tamaño de pantalla", () => {
  const PAD = 16
  for (const [vw, vh] of [[844, 390], [812, 375], [667, 375], [932, 430]] as const) {
    const rects = hudAvoidRects(vw, vh)
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2
      const raw = edgeAnchor(vw / 2 + Math.cos(a) * 2000, vh / 2 + Math.sin(a) * 2000, vw, vh, M)!
      const p = slideOffRects(raw, rects, vw, vh, M, PAD)
      for (const r of rects) {
        const inside = p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1
        assert.ok(!inside, `${vw}x${vh} ángulo ${k}: (${p.x.toFixed(0)},${p.y.toFixed(0)}) cae en la interfaz`)
      }
      assert.ok(p.x >= M - 1e-6 && p.x <= vw - M + 1e-6 && p.y >= M - 1e-6 && p.y <= vh - M + 1e-6)
    }
  }
})

test("flechas: fuera de la interfaz no se mueven", () => {
  const rects = hudAvoidRects(VW, VH)
  const a = edgeAnchor(VW + 400, VH / 2, VW, VH, M)!
  const p = slideOffRects(a, rects, VW, VH, M, 16)
  assert.equal(p.x, a.x)
  assert.equal(p.y, a.y)
})

test("flecha de borde: un compañero que asoma a medias por el borde se ve y NO recibe flecha; uno casi oculto, sí", () => {
  const rPx = 12
  const pad = rPx * 0.5
  // centro justo en el borde: la mitad del cuerpo está a la vista
  assert.equal(edgeAnchor(VW / 2, 0, VW, VH, M, pad), null)
  assert.equal(edgeAnchor(-4, VH / 2, VW, VH, M, pad), null)
  // centro más de media radio afuera: ya casi no se ve
  assert.ok(edgeAnchor(VW / 2, -pad - 1, VW, VH, M, pad))
  // la flecha se dibuja igual a `margin` px del borde, no pegada al jugador
  assert.ok(Math.abs(edgeAnchor(VW / 2, -30, VW, VH, M, pad)!.y - M) < 1e-6)
})

test("fuente del canvas: nunca devuelve una variable CSS (el canvas la ignora y cae a 10px sans-serif)", () => {
  assert.ok(!canvasFontFamily("var(--font-orbitron)").includes("var("))
  assert.ok(!canvasFontFamily(null).includes("var("))
  assert.ok(!canvasFontFamily("").includes("var("))
})

test("fuente del canvas: usa la familia real si hay, y siempre deja una de respaldo", () => {
  const f = canvasFontFamily("  'Orbitron', 'Orbitron Fallback' ")
  assert.ok(f.startsWith("'Orbitron', 'Orbitron Fallback',"))
  assert.ok(f.includes("sans-serif"))
  assert.ok(canvasFontFamily(undefined).includes("sans-serif"))
})

test("interfaz fija: la placa arriba a la izquierda y los botones arriba a la derecha (no abajo, donde estorbaban)", () => {
  const [plate, buttons] = hudAvoidRects(VW, VH)
  assert.ok(plate.x0 === 0 && plate.y0 === 0 && plate.x1 < VW / 2 + 40)
  assert.ok(buttons.x1 === VW && buttons.y0 === 0 && buttons.x0 > VW / 2, "botones en la mitad derecha")
  assert.ok(buttons.y1 < VH / 4, "botones solo en el borde de arriba, no abajo")
})

test("flechas: junto a los botones de arriba a la derecha se corren hacia la izquierda (no hacia afuera de la pantalla)", () => {
  const rects = hudAvoidRects(VW, VH)
  const a = edgeAnchor(VW - 60, -400, VW, VH, M)! // borde de arriba, justo sobre los botones
  const p = slideOffRects(a, rects, VW, VH, M, 16)
  assert.ok(p.x < rects[1].x0, `x=${p.x} debería quedar a la izquierda de ${rects[1].x0}`)
})

test("palo del arquero: sigue a la pelota cuando está adelante", () => {
  // arquero del lado 0 mira hacia +x; la pelota está adelante y un poco arriba
  const a = goalieStickAngle(0, 0, 0, 10, 3)
  assert.ok(Math.abs(a - Math.atan2(3, 10)) < 1e-9)
})

test("palo del arquero: nunca gira más de ~66° de hacia donde mira, aunque la pelota esté al costado o atrás", () => {
  for (const facing of [0, Math.PI]) {
    for (let k = 0; k < 360; k++) {
      const ang = (k / 360) * Math.PI * 2
      const a = goalieStickAngle(facing, 5, 5, 5 + Math.cos(ang) * 8, 5 + Math.sin(ang) * 8)
      const turn = Math.abs(Math.atan2(Math.sin(a - facing), Math.cos(a - facing)))
      assert.ok(turn <= GOALIE_STICK_MAX_TURN + 1e-9, `facing ${facing}, ángulo ${k}: giró ${turn}`)
    }
  }
})

test("palo del arquero: la pelota encima del arquero no produce NaN", () => {
  assert.ok(Number.isFinite(goalieStickAngle(0, 3, 3, 3, 3)))
})

test("placa: el alto incluye la tira de marca de arriba y la zona reservada para las flechas la cubre", () => {
  for (const [vw, vh] of [[844, 390], [667, 375], [568, 320], [932, 430]] as const) {
    const { boxH } = plateSize(vw, vh)
    assert.ok(boxH >= 56 + PLATE_BRAND_H, `${vw}x${vh}`)
    const [plate] = hudAvoidRects(vw, vh)
    assert.ok(plate.y1 >= 8 + boxH, "la zona evitada llega al pie de la placa")
  }
})
