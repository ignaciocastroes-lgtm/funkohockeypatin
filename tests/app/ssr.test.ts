import test from "node:test"
import assert from "node:assert/strict"

// Next renderiza los componentes cliente también en el servidor: importar la app NO puede tocar window/document.
test("SSR: importar la app y el partido no requiere DOM", () => {
  assert.equal(typeof (globalThis as { window?: unknown }).window, "undefined")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const app = require("../../lib/app/app")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const match = require("../../lib/game/match")
  assert.equal(typeof app.mountApp, "function")
  assert.equal(typeof match.mountMatch, "function")
})
