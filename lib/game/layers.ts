/**
 * Capas pre-renderizadas (Ronda 61). Lo que NO cambia de un cuadro a otro (el piso, la tribuna) se
 * pinta UNA vez en un canvas aparte y después cada cuadro solo lo estampa con `drawImage`.
 *
 * Por qué: el perfil de CPU mostró que el JavaScript del dibujo es poco (~5 % del tiempo) — lo caro
 * es RASTERIZAR: cientos de arcos/rectángulos por cuadro, con `clip`, gradientes y `shadowBlur`, a
 * densidad de píxel 2.5x. Un `drawImage` de un bitmap ya armado es la operación más barata que tiene
 * un canvas 2D (en el teléfono va directo a la GPU).
 *
 * Sin `document` (tests en Node) `makeLayer` devuelve null y quien llama cae al dibujo vectorial de
 * siempre — mismo resultado visual, solo que más caro.
 */
export interface Layer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

/** Lado máximo de un bitmap: varios navegadores de teléfono rechazan (o degradan) canvas más grandes. */
export const MAX_LAYER_SIDE = 4096

export function makeLayer(wPx: number, hPx: number): Layer | null {
  if (typeof document === "undefined") return null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.min(MAX_LAYER_SIDE, Math.round(wPx)))
    canvas.height = Math.max(1, Math.min(MAX_LAYER_SIDE, Math.round(hPx)))
    const ctx = canvas.getContext("2d")
    return ctx ? { canvas, ctx } : null
  } catch {
    return null
  }
}

/** Píxeles de dispositivo por metro con la transformación ACTUAL del contexto (incluye dpr y la
 *  rotación del modo vertical: por eso hipotenusa de (a,b) y no solo `a`). */
export function deviceScale(ctx: CanvasRenderingContext2D): number {
  try {
    const t = ctx.getTransform()
    const s = Math.hypot(t.a, t.b)
    return Number.isFinite(s) && s > 0 ? s : 1
  } catch {
    return 1
  }
}

/** Resoluciones (px por metro) en las que se hornea una capa. Escalones fijos para que el zoom
 *  automático de la cámara no fuerce a rehacer la capa en cada cuadro. */
export const RES_STEPS = [10, 14, 20, 28, 36, 44]

/**
 * Elige la resolución de horneado para la escala `need` (px/m reales en pantalla), con histéresis:
 * si la actual sirve (no queda muy borrosa ni desperdicia mucho), se mantiene. Tope en `cap`.
 */
export function pickRes(need: number, current: number | null, cap: number = RES_STEPS[RES_STEPS.length - 1]): number {
  const target = Math.min(cap, need)
  if (current !== null && current >= target * 0.8 && current <= Math.max(target * 1.7, RES_STEPS[0])) return current
  for (const r of RES_STEPS) if (r >= target * 0.95 && r <= cap) return r
  return Math.min(cap, RES_STEPS[RES_STEPS.length - 1])
}
