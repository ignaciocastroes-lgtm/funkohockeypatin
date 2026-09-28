/**
 * Generador de QR mínimo, sin dependencias (el proyecto no las puede instalar en el sandbox y tampoco
 * hace falta una librería entera para esto). Solo modo BYTE (UTF-8), corrección de errores L o M,
 * versiones 1 a 10 (hasta 271 bytes con L) — alcanza de sobra para una URL o un código de sala.
 * Devuelve la matriz de módulos (true = oscuro); dibujarla es cosa de quien la use.
 * Verificado contra un lector real (OpenCV) en tests/game/qr.test.ts + scripts/verify-qr.py.
 */

export type QrEcc = "L" | "M"

const ECC_BITS: Record<QrEcc, number> = { L: 1, M: 0 } // bits de formato del estándar
// índice = versión (1..10)
const ECC_PER_BLOCK: Record<QrEcc, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
}
const NUM_BLOCKS: Record<QrEcc, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
}
const MAX_VERSION = 10

const bit = (v: number, i: number): boolean => ((v >>> i) & 1) !== 0

function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}

function dataCodewords(ver: number, ecc: QrEcc): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * NUM_BLOCKS[ecc][ver]
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const size = ver * 4 + 17
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos)
  return out
}

// ---------- Reed-Solomon sobre GF(256), polinomio 0x11D ----------
function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = new Array(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor) })
  }
  return result
}

// ---------- armado ----------
function utf8(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    let c = ch.codePointAt(0) as number
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else { c &= 0x1fffff; out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)) }
  }
  return out
}

function buildData(bytes: number[], ver: number, ecc: QrEcc): number[] {
  const bits: number[] = []
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, ver < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  const cap = dataCodewords(ver, ecc) * 8
  push(0, Math.min(4, cap - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8)
  const out: number[] = new Array(bits.length / 8).fill(0)
  bits.forEach((b, i) => { out[i >>> 3] |= b << (7 - (i & 7)) })
  return out
}

function addEccAndInterleave(data: number[], ver: number, ecc: QrEcc): number[] {
  const numBlocks = NUM_BLOCKS[ecc][ver]
  const blockEccLen = ECC_PER_BLOCK[ecc][ver]
  const rawCodewords = Math.floor(rawDataModules(ver) / 8)
  const numShort = numBlocks - (rawCodewords % numBlocks)
  const shortLen = Math.floor(rawCodewords / numBlocks)
  const blocks: number[][] = []
  const divisor = rsDivisor(blockEccLen)
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - blockEccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const e = rsRemainder(dat, divisor)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(e))
  }
  const result: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((blk, j) => { if (i !== shortLen - blockEccLen || j >= numShort) result.push(blk[i]) })
  }
  return result
}

class Grid {
  readonly size: number
  readonly modules: boolean[][]
  readonly isFn: boolean[][]
  constructor(readonly ver: number) {
    this.size = ver * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false))
    this.isFn = Array.from({ length: this.size }, () => new Array(this.size).fill(false))
  }
  set(x: number, y: number, dark: boolean) { this.modules[y][x] = dark; this.isFn[y][x] = true }

  drawFunctionPatterns() {
    const n = this.size
    for (let i = 0; i < n; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0) }
    for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx, y = cy + dy
        if (x >= 0 && x < n && y >= 0 && y < n) this.set(x, y, d !== 2 && d !== 4)
      }
    }
    const pos = alignmentPositions(this.ver)
    pos.forEach((py, i) => pos.forEach((px, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }))
    this.drawFormat(0, 0) // reserva el lugar; se vuelve a dibujar con la máscara elegida
    if (this.ver >= 7) {
      let rem = this.ver
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
      const bits = (this.ver << 12) | rem
      for (let i = 0; i < 18; i++) {
        const dark = bit(bits, i)
        const a = n - 11 + (i % 3), b = Math.floor(i / 3)
        this.set(a, b, dark); this.set(b, a, dark)
      }
    }
  }

  drawFormat(eccBits: number, mask: number) {
    const n = this.size
    const data = (eccBits << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i))
    this.set(8, 7, bit(bits, 6)); this.set(8, 8, bit(bits, 7)); this.set(7, 8, bit(bits, 8))
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i))
    for (let i = 0; i < 8; i++) this.set(n - 1 - i, 8, bit(bits, i))
    for (let i = 8; i < 15; i++) this.set(8, n - 15 + i, bit(bits, i))
    this.set(8, n - 8, true)
  }

  drawCodewords(cw: number[]) {
    const n = this.size
    let i = 0
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? n - 1 - vert : vert
          if (!this.isFn[y][x] && i < cw.length * 8) { this.modules[y][x] = bit(cw[i >>> 3], 7 - (i & 7)); i++ }
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      let inv: boolean
      switch (mask) {
        case 0: inv = (x + y) % 2 === 0; break
        case 1: inv = y % 2 === 0; break
        case 2: inv = x % 3 === 0; break
        case 3: inv = (x + y) % 3 === 0; break
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
        case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break
        case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
        default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
      }
      if (inv && !this.isFn[y][x]) this.modules[y][x] = !this.modules[y][x]
    }
  }

  penalty(): number {
    const n = this.size
    const m = this.modules
    let score = 0
    const runScore = (line: boolean[]) => {
      let s = 0, run = 1
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) run++
        else { if (run >= 5) s += 3 + (run - 5); run = 1 }
      }
      const str = line.map((b) => (b ? "1" : "0")).join("")
      for (const pat of ["10111010000", "00001011101"]) {
        let at = str.indexOf(pat)
        while (at !== -1) { s += 40; at = str.indexOf(pat, at + 1) }
      }
      return s
    }
    for (let y = 0; y < n; y++) score += runScore(m[y])
    for (let x = 0; x < n; x++) score += runScore(m.map((row) => row[x]))
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const c = m[y][x]
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3
    }
    let dark = 0
    for (const row of m) for (const c of row) if (c) dark++
    const k = Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1
    return score + Math.max(0, k) * 10
  }
}

/** Matriz del QR (true = módulo oscuro), SIN zona de silencio (dibujá 4 módulos claros alrededor). */
export function qrMatrix(text: string, ecc: QrEcc = "M"): boolean[][] {
  const bytes = utf8(text)
  let ver = 1
  for (; ver <= MAX_VERSION; ver++) {
    const capBits = dataCodewords(ver, ecc) * 8
    const need = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8
    if (need <= capBits) break
  }
  if (ver > MAX_VERSION) throw new Error(`QR: texto demasiado largo (${bytes.length} bytes)`)
  const codewords = addEccAndInterleave(buildData(bytes, ver, ecc), ver, ecc)

  let best: Grid | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const g = new Grid(ver)
    g.drawFunctionPatterns()
    g.drawCodewords(codewords)
    g.applyMask(mask)
    g.drawFormat(ECC_BITS[ecc], mask)
    const sc = g.penalty()
    if (sc < bestScore) { bestScore = sc; best = g }
  }
  return (best as Grid).modules
}

/** SVG en línea del QR (fondo blanco con zona de silencio) — para meter en el DOM sin canvas. */
export function qrSvg(text: string, px = 160, ecc: QrEcc = "M"): string {
  const m = qrMatrix(text, ecc)
  const quiet = 4
  const n = m.length + quiet * 2
  let d = ""
  m.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + quiet} ${y + quiet}h1v1h-1z` }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
