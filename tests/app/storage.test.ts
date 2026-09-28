import test from "node:test"
import assert from "node:assert/strict"
import { safeStorage } from "../../lib/app/storage"

/** Storage falsa: funciona normal, o tira excepción en `setItem` (como un navegador que la
 *  bloquea) según `broken`. */
class FakeStorage {
  private m = new Map<string, string>()
  constructor(private broken = false) {}
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { if (this.broken) throw new Error("blocked"); this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

/** Pone un `window` falso para la duración de `fn`, y lo saca después pase lo que pase — para no
 *  filtrar estado global entre tests (`ssr.test.ts` depende de que `window` NO exista). */
function withFakeWindow<T>(win: Record<string, unknown>, fn: () => T): T {
  const g = globalThis as Record<string, unknown>
  const had = "window" in g
  const prev = g.window
  g.window = win
  try {
    return fn()
  } finally {
    if (had) g.window = prev
    else delete g.window
  }
}

test("safeStorage: sin window (SSR), null — nunca toca localStorage/sessionStorage", () => {
  assert.equal(safeStorage(), null)
})

test("safeStorage: localStorage anda bien -> lo usa (no hace falta sessionStorage)", () => {
  const ls = new FakeStorage(false)
  const ss = new FakeStorage(false)
  const got = withFakeWindow({ localStorage: ls, sessionStorage: ss }, () => safeStorage())
  assert.equal(got, ls)
})

test("safeStorage: localStorage bloqueado -> cae a sessionStorage (sobrevive a un F5, no a cerrar la pestaña)", () => {
  const ls = new FakeStorage(true)
  const ss = new FakeStorage(false)
  const got = withFakeWindow({ localStorage: ls, sessionStorage: ss }, () => safeStorage())
  assert.equal(got, ss)
})

test("safeStorage: los dos bloqueados -> null (no explota, se puede seguir jugando sin guardar nada)", () => {
  const ls = new FakeStorage(true)
  const ss = new FakeStorage(true)
  const got = withFakeWindow({ localStorage: ls, sessionStorage: ss }, () => safeStorage())
  assert.equal(got, null)
})
