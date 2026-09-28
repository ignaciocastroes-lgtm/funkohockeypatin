/**
 * Códigos de sala para el 2P anónimo (sin cuentas, sin Google): 5 caracteres de un alfabeto sin los que
 * se confunden al leerlos en voz alta o en una pantalla chica (0/O, 1/I/L). 31^5 ≈ 28,6 millones.
 */
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const ROOM_LEN = 5

/** `rand` devuelve un número en [0,1). Por defecto usa `crypto.getRandomValues` (no `Math.random`, que es predecible). */
export function newRoomCode(rand?: () => number): string {
  let out = ""
  for (let i = 0; i < ROOM_LEN; i++) {
    let r: number
    if (rand) r = rand()
    else if (typeof crypto !== "undefined" && crypto.getRandomValues) r = crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000
    else r = Math.random()
    out += ROOM_ALPHABET[Math.min(ROOM_ALPHABET.length - 1, Math.floor(r * ROOM_ALPHABET.length))]
  }
  return out
}

/** Limpia lo que escribe la persona (minúsculas, espacios, guiones) y devuelve el código, o null si no sirve. */
export function normalizeRoomCode(input: string): string | null {
  const c = String(input ?? "").toUpperCase().replace(/[\s\-_.]/g, "")
  if (c.length !== ROOM_LEN) return null
  for (const ch of c) if (!ROOM_ALPHABET.includes(ch)) return null
  return c
}
export const isRoomCode = (s: string): boolean => normalizeRoomCode(s) === s

/** URL para invitar (la que va en el QR): la misma página del juego con `?sala=CODIGO`. */
export function joinUrl(base: string, code: string): string {
  const u = new URL(base)
  u.search = ""
  u.hash = ""
  u.searchParams.set("sala", code)
  return u.toString()
}

/** Lee `?sala=CODIGO` de la URL con la que se abrió el juego. */
export function roomFromSearch(search: string): string | null {
  const m = /[?&]sala=([^&#]*)/.exec(search)
  if (!m) return null
  try { return normalizeRoomCode(decodeURIComponent(m[1])) } catch { return null } // un % mal formado no puede tirar la app
}
