import test from "node:test"
import assert from "node:assert/strict"
import { fetchAudioBytes } from "../../lib/game/sfx"

test("fetchAudioBytes: decodifica una data: URI directo (sin fetch), bytes exactos", async () => {
  const original = new Uint8Array([0, 1, 2, 253, 254, 255, 42, 7])
  const b64 = Buffer.from(original).toString("base64")
  const uri = `data:audio/mpeg;base64,${b64}`
  const bytes = new Uint8Array(await fetchAudioBytes(uri))
  assert.deepEqual(Array.from(bytes), Array.from(original))
})

test("fetchAudioBytes: una data: URI sin base64 explícito, rechaza en vez de devolver basura", async () => {
  await assert.rejects(() => fetchAudioBytes("data:audio/mpeg,not-base64-at-all"))
})

test("fetchAudioBytes: una URL normal (no data:) sigue yendo por fetch", async () => {
  const calls: string[] = []
  const originalFetch = globalThis.fetch
  // @ts-expect-error -- reemplazo temporal para el test, no me importa el tipo exacto acá
  globalThis.fetch = async (url: string) => {
    calls.push(url)
    return { ok: true, arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer }
  }
  try {
    const bytes = new Uint8Array(await fetchAudioBytes("/audio/ref-whistle.mp3"))
    assert.deepEqual(Array.from(bytes), [9, 9, 9])
    assert.deepEqual(calls, ["/audio/ref-whistle.mp3"])
  } finally {
    globalThis.fetch = originalFetch
  }
})
