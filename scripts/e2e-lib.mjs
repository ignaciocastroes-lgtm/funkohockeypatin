// Utilidades compartidas por e2e.mjs y audit-ui.mjs.
import { execSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"

const require = createRequire(import.meta.url)
export const root = resolve(dirname(new URL(import.meta.url).pathname), "..")

/** Carga Playwright o sale con un mensaje claro (no es dependencia del proyecto: ver README). */
export function loadPlaywright() {
  try { return require("playwright") } catch {
    console.error("Falta playwright: pnpm add -D playwright && pnpm exec playwright install chromium")
    process.exit(2)
  }
}

/** Empaqueta la app en un HTML autocontenido y devuelve su ruta. */
export function buildStandalone(name) {
  const html = join(tmpdir(), name)
  execSync(`node scripts/build-standalone.mjs ${JSON.stringify(html)}`, { cwd: root, stdio: "pipe" })
  return html
}

/**
 * Abre la app tal como la ve un jugador: SIEMPRE arranca en el demo (IA vs IA, "attract mode"); tocar la
 * pantalla lo corta y lleva al menú. Verifica las dos cosas y devuelve { demoOk, menuOk } para reportarlas.
 */
export async function bootToMenu(page, url) {
  await page.goto(url)
  await page.waitForTimeout(400)
  const first = await page.evaluate("__handle.debug.screen()")
  const running = await page.evaluate("(()=>{const m=__handle.debug.match();return !!m && m.world.time>=0})()")
  const vp = page.viewportSize() ?? { width: 844, height: 390 }
  await page.mouse.click(vp.width / 2, vp.height / 2) // el centro, sea cual sea el tamaño de pantalla
  await page.waitForTimeout(300)
  const after = await page.evaluate("__handle.debug.screen()")
  return { demoOk: first === "match" && running, menuOk: after === "menu" }
}

/** Cierra el tutorial de la Copa si está abierto (con "Entendido"). */
export async function closeTutorialIfOpen(page) {
  const b = page.locator('[data-key="tutorial-ok"]')
  if (await b.count()) { await b.click(); await page.waitForTimeout(300) }
}

/** Marcador simple: check() cuenta, block() aísla cada bloque (si uno se rompe, los demás igual corren). */
export function reporter() {
  const r = { good: 0, bad: [] }
  r.check = (name, cond, extra = "") => {
    if (cond) r.good++; else r.bad.push(name)
    console.log(`${cond ? "  ✓" : "  ✗"} ${name}${cond ? "" : "  " + extra}`)
  }
  r.block = async (title, fn) => {
    console.log(title)
    try { await fn() } catch (e) {
      const msg = String(e?.message ?? e).split("\n")[0]
      r.bad.push(`${title}: ${msg}`)
      console.log(`  ✗ (el bloque se cayó) ${msg}`)
    }
  }
  r.finish = (total) => {
    console.log(`\n${r.good} bien, ${r.bad.length} mal`, r.bad.length ? r.bad : "")
    process.exit(r.bad.length ? 1 : 0)
  }
  return r
}
