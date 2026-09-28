/** Geometría PURA del rombo de 4 botones (para poder testear que NO se solapan). */
export interface ActionLayout {
  box: number
  /** Centros (px, relativos al contenedor) de cada botón. */
  centers: { left: [number, number]; top: [number, number]; right: [number, number]; bottom: [number, number] }
}

export function actionLayout(btnSize: number, gap: number): ActionLayout {
  const diag = Math.ceil(btnSize + gap) // distancia entre centros vecinos: siempre > btnSize
  const d = diag / Math.SQRT2
  const box = Math.ceil(diag * Math.SQRT2 + btnSize)
  const c = box / 2
  return { box, centers: { left: [c - d, c], top: [c, c - d], right: [c + d, c], bottom: [c, c + d] } }
}
