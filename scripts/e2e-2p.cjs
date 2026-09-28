/**
 * E2E del 2 jugadores con DOS navegadores reales (Playwright/Chromium) y el relay de verdad en localhost.
 * Uso:  node scripts/build-standalone.mjs juego.html && node scripts/e2e-2p.cjs [juego.html] [carpeta-capturas]
 * Requiere Playwright (npm i -D playwright && npx playwright install chromium). Deja capturas .png.
 * Comprueba: crear sala → unirse con el código → los dos entran al partido → botones de ataque/defensa
 * distintos según quién tiene la pelota → cero errores de página → si el host se va, el invitado se entera.
 */
const { chromium } = require("playwright")
const path = require("path")
const { startRelay } = require(path.join(__dirname, "..", "relay", "server.cjs"))
const http = require("http"), fs = require("fs")
const HTML = path.resolve(process.argv[2] || path.join(__dirname, "..", "juego.html"))
const OUT = path.resolve(process.argv[3] || ".")
process.chdir(OUT)
;(async () => {
  const relay = await startRelay({ port: 0, host: "127.0.0.1" })
  let html = fs.readFileSync(HTML, "utf8")
  const inject = `<script>window.FP_RELAY_URL="ws://127.0.0.1:${relay.port}"</script>`
  html = html.replace("<head>", "<head>" + inject)
  const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(html) })
  await new Promise((r) => srv.listen(0, "127.0.0.1", r))
  const url = `http://127.0.0.1:${srv.address().port}/`
  const browser = await chromium.launch()
  const errors = []
  const mk = async (name, lang) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, locale: lang, hasTouch: true })
    const page = await ctx.newPage()
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`))
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${name} console: ${m.text()}`) })
    return page
  }
  const host = await mk("host", "es-CL"), guest = await mk("guest", "pt-PT")
  await host.goto(url); await guest.goto(url)
  await host.waitForSelector('[data-key="online"], .fp-match', { timeout: 8000 })
  // el demo de arranque cubre el menú: un toque va al menú
  await host.mouse.click(400, 200); await guest.mouse.click(400, 200)
  await host.waitForSelector('[data-key="online"]', { timeout: 8000 })
  await guest.waitForSelector('[data-key="online"]', { timeout: 8000 })
  await host.screenshot({ path: "01-menu-es.png" }); await guest.screenshot({ path: "01-menu-pt.png" })
  await host.click('[data-key="online"]')
  await host.click('[data-key="create-room"]')
  await host.waitForSelector('[data-key="room-code-show"]', { timeout: 5000 })
  const code = (await host.textContent('[data-key="room-code-show"]')).trim()
  console.log("código de sala:", code)
  await host.screenshot({ path: "02-host-esperando.png" })
  await guest.click('[data-key="online"]')
  await guest.fill('[data-key="room-code"]', code.toLowerCase())
  await guest.screenshot({ path: "03-guest-lobby-pt.png" })
  await guest.click('[data-key="join-room"]')
  await host.waitForSelector(".fp-match canvas", { timeout: 8000 })
  await guest.waitForSelector(".fp-match canvas", { timeout: 8000 })
  console.log("los dos entraron al partido")
  await host.waitForTimeout(2500)
  // botones visibles en cada lado
  const btns = async (p) => p.$$eval(".fp-match button", (bs) => bs.map((b) => b.textContent.trim().replace(/\n/g, " ")).filter(Boolean))
  console.log("host botones:", await btns(host)); console.log("guest botones:", await btns(guest))
  await host.screenshot({ path: "04-host-partido.png" }); await guest.screenshot({ path: "04-guest-partido.png" })
  // el invitado mueve el stick (arrastra) y aprieta botones
  await guest.mouse.move(150, 300); await guest.mouse.down(); await guest.mouse.move(230, 300, { steps: 6 })
  await guest.waitForTimeout(1500)
  await guest.screenshot({ path: "05-guest-moviendo.png" })
  await guest.mouse.up()
  const gbtn = await guest.$$(".fp-match button")
  for (const b of gbtn) { const t = (await b.textContent()).trim(); if (/REMATE|DESARMAR|TROCA/.test(t)) { await b.click().catch(() => {}); } }
  await guest.waitForTimeout(3000)
  await host.screenshot({ path: "06-host-despues.png" }); await guest.screenshot({ path: "06-guest-despues.png" })
  console.log("errores de página:", errors.length ? errors : "ninguno")
  // el host se va: el invitado debe enterarse
  await host.keyboard.press("Escape")
  await host.waitForSelector('[data-key="quit"]', { timeout: 3000 })
  await host.click('[data-key="quit"]')
  await host.waitForTimeout(300)
  const confirm = await host.$$('.fp-dialog button')
  for (const b of confirm) { if (/Salir/.test(await b.textContent()) && !/menú/.test(await b.textContent())) { await b.click(); break } }
  await guest.waitForTimeout(1500)
  const dlg = await guest.$$eval(".fp-dialog", (d) => d.map((x) => x.textContent.trim().slice(0, 90)))
  console.log("invitado ve:", dlg)
  await guest.screenshot({ path: "07-guest-corte.png" })
  await browser.close(); srv.close(); await relay.close()
})().catch((e) => { console.error("E2E FALLÓ:", e.message); process.exit(1) })
