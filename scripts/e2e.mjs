// Prueba de extremo a extremo en Chromium: menú, equipos (crear/editar/borrar/persistir), partido con dos dedos,
// pausa, salir, final y revancha. Uso (una vez): pnpm add -D playwright && pnpm exec playwright install chromium
//                                                pnpm e2e
import { execSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"

const require = createRequire(import.meta.url)
const root = resolve(dirname(new URL(import.meta.url).pathname), "..")
let chromium
try { ({ chromium } = require("playwright")) } catch {
  console.error("Falta playwright: pnpm add -D playwright && pnpm exec playwright install chromium")
  process.exit(2)
}
const html = join(tmpdir(), "funko-patin-e2e.html")
execSync(`node scripts/build-standalone.mjs ${JSON.stringify(html)}`, { cwd: root, stdio: "pipe" })
const PAGE_URL = `file://${html}?time=8`

let good = 0
const bad = []
const check = (name, cond, extra = "") => {
  if (cond) good++; else bad.push(name)
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${cond ? "" : "  " + extra}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true })
const page = await ctx.newPage()
const errs = []
page.on("pageerror", (e) => errs.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) })
const scr = () => page.evaluate("__handle.debug.screen()")
const saved = () => page.evaluate("JSON.parse(JSON.stringify(__handle.debug.saved()))")
const K = (k) => page.locator(`[data-key="${k}"]`).first()
const M = (expr) => page.evaluate(`(()=>{const m=__handle.debug.match();return ${expr}})()`)

console.log("MENÚ")
await page.goto(PAGE_URL); await page.waitForTimeout(300)
check("arranca en el menú", (await scr()) === "menu")
check("resumen del partido visible", (await page.locator(".fp-summary").innerText()).includes("HALCONES vs TIBURONES"))

console.log("EQUIPOS")
await K("setup").click()
await K("visit-t1").click()
let s = await saved()
check("elegir de rival al equipo local los intercambia", s.settings.localId === "t2" && s.settings.visitId === "t1")
await K("nivel-dificil").click(); await K("dur-60").click()
s = await saved()
check("nivel y duración se guardan", s.settings.nivel === "dificil" && s.settings.duration === 60)
await K("new").click()
await page.fill("#fp-name", "lobos"); await K("kind-2-pesado").click(); await K("surf-cemento").click(); await K("save").click()
s = await saved()
const lobos = s.customTeams.find((t) => t.name === "LOBOS")
check("crear equipo guarda nombre, pista y estilo", !!lobos && lobos.surface === "cemento" && lobos.roster[2].kind === "pesado")
check("el equipo nuevo queda como local", s.settings.localId === lobos.id)
await K("new").click(); await page.fill("#fp-name", "Lobos"); await K("save").click()
check("nombre repetido: error y no guarda", (await page.locator(".fp-error").innerText()).includes("Ya existe") && (await scr()) === "editor")
await K("cancel").click()
await K("new").click(); await page.fill("#fp-name", "Osos"); await K("kind-1-veloz").click(); await K("save").click()
s = await saved()
const l2 = s.customTeams.find((t) => t.name === "LOBOS")
check("crear otro equipo no modifica la plantilla del anterior", l2.roster[1].kind === "equilibrado" && l2.roster[2].kind === "pesado")
await page.goto(PAGE_URL); await page.waitForTimeout(300)
s = await saved()
check("los equipos sobreviven a recargar", s.customTeams.map((t) => t.name).sort().join() === "LOBOS,OSOS" && s.settings.nivel === "dificil")
await K("setup").click()
const osos = s.customTeams.find((t) => t.name === "OSOS")
await K(`del-${osos.id}`).click(); await page.waitForTimeout(350)
await page.locator('.fp-dialog [data-key="dlg-1"]').click()
check("cancelar el borrado conserva el equipo", (await saved()).customTeams.length === 2)
await K(`del-${osos.id}`).click(); await page.waitForTimeout(350)
await page.locator('.fp-dialog [data-key="dlg-0"]').click()
check("borrar elimina el equipo", (await saved()).customTeams.map((t) => t.name).join() === "LOBOS")
const lob = (await saved()).customTeams[0]
await K(`edit-${lob.id}`).click()
check("editar abre el editor con sus datos", (await scr()) === "editor" && (await page.inputValue("#fp-name")) === "LOBOS")
await page.fill("#fp-name", "Lobos Azules"); await K("save").click()
s = await saved()
check("editar conserva el id y cambia el nombre", s.customTeams[0].id === lob.id && s.customTeams[0].name === "LOBOS AZULES")

console.log("PARTIDO")
await K("back").click(); await K("play").click(); await page.waitForTimeout(700)
check("entra al partido con canvas y reloj corriendo", (await scr()) === "match" && (await M("m.world.time")) > 0.3 && (await page.locator("canvas").count()) === 1)
await K("pause").click(); await page.waitForTimeout(350)
const t0 = await M("m.world.time"); await page.waitForTimeout(500)
check("en pausa el reloj no avanza", Math.abs((await M("m.world.time")) - t0) < 1e-6)
await K("resume").click(); await page.waitForTimeout(400)
check("al continuar vuelve a correr", (await M("m.world.time")) > t0 + 0.2)
await page.keyboard.press("Escape")
check("Esc pausa", await M("m.paused"))
await page.keyboard.press("Escape")
check("Esc otra vez reanuda", !(await M("m.paused")))
await page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
check("pestaña oculta: pausa sola y abre el menú de pausa", (await M("m.paused")) && (await page.locator(".fp-dialog").count()) === 1)
await page.evaluate("Object.defineProperty(document,'hidden',{value:false,configurable:true})")
await page.waitForTimeout(350); await K("resume").click()
await K("pause").click(); await page.waitForTimeout(350); await K("quit").click(); await page.waitForTimeout(350)
await page.locator('.fp-dialog [data-key="dlg-1"]').click()
check("cancelar salir vuelve a la pausa", (await scr()) === "match" && (await page.locator('.fp-dialog[aria-label="Pausa"]').count()) === 1)
await K("quit").click(); await page.waitForTimeout(350); await page.locator('.fp-dialog [data-key="dlg-0"]').click()
check("salir confirmado: menú y partido liberado", (await scr()) === "menu" && (await M("m===null")) && (await page.locator("canvas").count()) === 0)

console.log("DOS DEDOS")
await K("play").click(); await page.waitForTimeout(400)
const gesture = await page.evaluate(async () => {
  const c = document.querySelector("canvas"), M = () => __handle.debug.match()
  const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: "touch" }))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // escenario determinista: L1 con el puck 2 m delante, rivales lejos (no depende de quién gane el saque)
  const w = M().world
  for (const k of w.skaters) { if (k.side === 1) { k.x = 36; k.y = 3 + Number(k.id.slice(1)) * 3; k.vx = k.vy = 0; k.px = k.x; k.py = k.y } }
  const l1 = w.skaters.find((k) => k.id === "L1"); l1.x = 14; l1.y = 10; l1.vx = l1.vy = 0; l1.px = 14; l1.py = 10
  w.puck.carrierId = null; w.puck.x = 16.5; w.puck.y = 10; w.puck.px = 16.5; w.puck.py = 10; w.puck.vx = w.puck.vy = 0
  ev("pointerdown", 1, 150, 300); ev("pointermove", 1, 230, 300)
  let got = null; const t0 = performance.now()
  while (performance.now() - t0 < 4000) { await sleep(50); if (M().world.puck.carrierId === "L1") { got = Math.round(performance.now() - t0); break } }
  ev("pointerdown", 2, 600, 300)
  for (let k = 1; k <= 6; k++) { ev("pointermove", 2, 600 + k * 22, 300 - k * 22); await sleep(8) }
  ev("pointerup", 2, 600 + 6 * 22, 300 - 6 * 22); await sleep(120)
  const p = M().world.puck; const out = { got, carrier: p.carrierId, speed: Math.hypot(p.vx, p.vy) }
  ev("pointerup", 1, 230, 300); return out
})
check("el joystick recoge el puck y el deslizamiento lo patea", gesture.got !== null && gesture.carrier === null && gesture.speed > 15, JSON.stringify(gesture))

console.log("FINAL Y REVANCHA")
await page.waitForSelector('[aria-label="Fin del partido"]', { timeout: 20000 })
const txt = (await page.locator('[aria-label="Fin del partido"]').innerText()).toLowerCase()
check("pantalla final con estadísticas", ["tiros", "pases completos", "robos", "faltas"].every((w) => txt.includes(w)))
const before = await page.evaluate("[__handle.debug.saved().settings.localId,__handle.debug.saved().settings.visitId].join()")
await K("rematch").click(); await page.waitForTimeout(600)
check("revancha: partido nuevo 0-0, sin recargar y con los mismos equipos",
  (await scr()) === "match" && (await M("m.world.score.join()")) === "0,0" && (await M("m.world.time")) < 1.5 &&
  before === (await page.evaluate("[__handle.debug.saved().settings.localId,__handle.debug.saved().settings.visitId].join()")))
check("sin errores en consola", errs.length === 0, errs.join(" | "))

await browser.close()
console.log(`\n${good} bien, ${bad.length} mal`, bad.length ? bad : "")
process.exit(bad.length ? 1 : 0)
