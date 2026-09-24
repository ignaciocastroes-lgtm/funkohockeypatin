// Prueba de extremo a extremo en Chromium. Cada bloque abre una página NUEVA (almacenamiento limpio) y
// arranca como un jugador: en el demo, tocar, menú. Si un bloque se cae, los demás igual corren.
// Uso (una vez): pnpm add -D playwright && pnpm exec playwright install chromium
//                pnpm e2e
import { bootToMenu, buildStandalone, closeTutorialIfOpen, loadPlaywright, reporter } from "./e2e-lib.mjs"

const { chromium } = loadPlaywright()
const html = buildStandalone("funko-patin-e2e.html")
const URL = `file://${html}?time=8`
const r = reporter()
const { check } = r

// autoplay permitido: equivale a un jugador que ya tocó la pantalla (si no, el navegador deja el audio en pausa)
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] })
const errs = []
async function fresh(vp = { width: 844, height: 390 }) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true })
  const page = await ctx.newPage()
  page.on("pageerror", (e) => errs.push(String(e)))
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) })
  const h = {
    ctx, page,
    scr: () => page.evaluate("__handle.debug.screen()"),
    saved: () => page.evaluate("JSON.parse(JSON.stringify(__handle.debug.saved()))"),
    K: (k) => page.locator(`[data-key="${k}"]`).first(),
    M: (expr) => page.evaluate(`(()=>{const m=__handle.debug.match();return ${expr}})()`),
    menu: async () => { const b = await bootToMenu(page, URL); return b },
  }
  return h
}
/** Toque rápido (o largo) con un dedo en (x,y). Devuelve el estado de la pelota justo después. */
const tapAt = (page, x, y, ms = 90) => page.evaluate(async ([x, y, ms]) => {
  const c = document.querySelector("canvas")
  const ev = (t) => c.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: "touch" }))
  ev("pointerdown"); await new Promise((r) => setTimeout(r, ms)); ev("pointerup")
  await new Promise((r) => setTimeout(r, 60))
  const m = __handle.debug.match(), p = m.world.puck
  return { carrier: p.carrierId, speed: Math.hypot(p.vx, p.vy), controlled: m.stats.controlledId }
}, [x, y, ms])
/** Deja un escenario fijo: L1 con la pelota en el centro, compañeros y rivales lejos y quietos. */
const scenario = (page, layout = {}) => page.evaluate((layout) => {
  const m = __handle.debug.match(), w = m.world
  const set = (k, x, y) => { k.x = x; k.y = y; k.px = x; k.py = y; k.vx = 0; k.vy = 0; k.pickupCooldown = 0 }
  const S = (id) => w.skaters.find((k) => k.id === id)
  const L = { L1: [20, 10], L2: [14, 14], L3: [26, 6], L4: [5, 10], V1: [30, 3], V2: [32, 17], V3: [33, 10], V4: [36, 12], ...layout }
  for (const [id, [x, y]] of Object.entries(L)) set(S(id), x, y)
  w.puck.carrierId = "L1"; w.puck.x = 20.5; w.puck.y = 10; w.puck.px = 20.5; w.puck.py = 10; w.puck.vx = w.puck.vy = 0
  w.phase = "play"
  m.pause(); m.resume()
}, layout)
const toScreen = (page, x, y) => page.evaluate(([x, y]) => __handle.debug.match().camera.toScreen(x, y), [x, y])

// ─────────────────────────────────────────────────────────────────────────────
await r.block("ARRANQUE: el demo corre siempre y tocar lleva al menú", async () => {
  const t = await fresh()
  await t.page.goto(URL); await t.page.waitForTimeout(500)
  check("la app abre directo en el demo (partido IA vs IA, sin menú)", (await t.scr()) === "match")
  const t0 = await t.M("m.world.time"); await t.page.waitForTimeout(700)
  check("el demo corre solo (el reloj avanza sin tocar nada)", (await t.M("m.world.time")) > t0 + 0.4)
  await t.page.mouse.click(420, 200); await t.page.waitForTimeout(300)
  check("tocar la pantalla corta el demo y va al menú", (await t.scr()) === "menu")
  const t2 = await fresh()
  await t2.page.goto(URL); await t2.page.waitForTimeout(500)
  await t2.page.keyboard.press("KeyA"); await t2.page.waitForTimeout(300)
  check("cualquier tecla también lo corta", (await t2.scr()) === "menu")
  check("en el menú no queda ningún partido corriendo", await t2.M("m===null"))
  const t3 = await fresh(); await t3.menu()
  await t3.K("demo").click(); await t3.page.waitForTimeout(500)
  check("el botón 'Modo demo' abre el demo a propósito", (await t3.scr()) === "match")
  await t3.page.mouse.click(420, 200); await t3.page.waitForTimeout(500)
  check("tocar el demo abierto a mano arranca un partido de verdad (no vuelve al menú)", (await t3.scr()) === "match" && (await t3.M("m.world.time")) < 2)
  await t.ctx.close(); await t2.ctx.close(); await t3.ctx.close()
})

await r.block("MENÚ", async () => {
  const t = await fresh()
  const b = await t.menu()
  check("arranque: demo primero, menú después de tocar", b.demoOk && b.menuOk)
  check("resumen del partido visible", /\S+ vs \S+/.test(await t.page.locator(".fp-summary").innerText()))
  check("sin botón de entrenamiento mientras no esté desbloqueado", (await t.K("training").count()) === 0)
  await t.ctx.close()
})

await r.block("EQUIPOS", async () => {
  const t = await fresh(); const { page, K, saved, scr } = t
  await t.menu()
  await K("setup").click()
  let s = await saved()
  const [a, b] = [s.settings.localId, s.settings.visitId]
  check("por defecto hay dos selecciones distintas", !!a && !!b && a !== b)
  await K(`visit-${a}`).click()
  s = await saved()
  check("elegir de rival al equipo local los intercambia", s.settings.localId === b && s.settings.visitId === a)
  await K("nivel-dificil").click(); await K("dur-60").click()
  s = await saved()
  check("nivel y duración se guardan", s.settings.nivel === "dificil" && s.settings.duration === 60)
  await K("new").click()
  await page.fill("#fp-name", "lobos"); await K("kind-2-pesado").click(); await K("surf-cemento").click(); await K("save").click()
  s = await saved()
  const lobos = s.customTeams.find((x) => x.name === "LOBOS")
  check("crear equipo guarda nombre, pista y estilo", !!lobos && lobos.surface === "cemento" && lobos.roster[2].kind === "pesado")
  check("el equipo nuevo queda como local", s.settings.localId === lobos.id)
  await K("new").click(); await page.fill("#fp-name", "Lobos"); await K("save").click()
  check("nombre repetido: error y no guarda", (await page.locator(".fp-error").innerText()).includes("Ya existe") && (await scr()) === "editor")
  await K("cancel").click()
  await K("new").click(); await page.fill("#fp-name", "Osos"); await K("kind-1-veloz").click(); await K("save").click()
  s = await saved()
  const l2 = s.customTeams.find((x) => x.name === "LOBOS")
  check("crear otro equipo no modifica la plantilla del anterior", l2.roster[1].kind === "equilibrado" && l2.roster[2].kind === "pesado")
  await bootToMenu(page, URL)
  s = await saved()
  check("los equipos sobreviven a recargar", s.customTeams.map((x) => x.name).sort().join() === "LOBOS,OSOS" && s.settings.nivel === "dificil")
  await K("setup").click()
  const osos = s.customTeams.find((x) => x.name === "OSOS")
  await K(`del-${osos.id}`).click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-1"]').click()
  check("cancelar el borrado conserva el equipo", (await saved()).customTeams.length === 2)
  await K(`del-${osos.id}`).click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-0"]').click()
  check("borrar elimina el equipo", (await saved()).customTeams.map((x) => x.name).join() === "LOBOS")
  const lob = (await saved()).customTeams[0]
  await K(`edit-${lob.id}`).click()
  check("editar abre el editor con sus datos", (await scr()) === "editor" && (await page.inputValue("#fp-name")) === "LOBOS")
  await page.fill("#fp-name", "Lobos Azules"); await K("save").click()
  s = await saved()
  check("editar conserva el id y cambia el nombre", s.customTeams[0].id === lob.id && s.customTeams[0].name === "LOBOS AZULES")
  await t.ctx.close()
})

await r.block("PARTIDO SUELTO: sin tutorial, pausa, salir", async () => {
  const t = await fresh(); const { page, K, scr, M } = t
  await t.menu()
  await K("play").click(); await page.waitForTimeout(1400)
  check("entra al partido con canvas y reloj corriendo", (await scr()) === "match" && (await M("m.world.time")) > 0.5 && (await page.locator("canvas").count()) === 1)
  check("el partido suelto NO muestra el tutorial (eso es de la Copa)", (await page.locator(".fp-dialog").count()) === 0)
  const hud = await page.evaluate(() => [...document.querySelectorAll(".fp-hud button")].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height } }))
  check("los 4 botones están arriba a la derecha (no tapan la zona del pulgar)", hud.length === 4 && hud.every((b) => b.l > 422 && b.t < 30 && b.w >= 44 && b.h >= 44), JSON.stringify(hud))
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
  await t.ctx.close()
})

await r.block("DOS DEDOS, FINAL Y REVANCHA", async () => {
  const t = await fresh(); const { page, K, scr, M } = t
  await t.menu()
  await K("play").click(); await page.waitForTimeout(500)
  await scenario(page, { V1: [36, 3], V2: [36, 6], V3: [36, 9], V4: [36, 12], L1: [14, 10] })
  await page.evaluate(() => { const w = __handle.debug.match().world; w.puck.carrierId = null; w.puck.x = 16.5; w.puck.px = 16.5; w.puck.y = 10; w.puck.py = 10 })
  const g = await page.evaluate(async () => {
    const c = document.querySelector("canvas"), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), Mh = () => __handle.debug.match()
    const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: "touch" }))
    ev("pointerdown", 1, 150, 300); ev("pointermove", 1, 230, 300)
    let got = null; const t0 = performance.now()
    while (performance.now() - t0 < 4000) { await sleep(50); if (Mh().world.puck.carrierId === "L1") { got = Math.round(performance.now() - t0); break } }
    ev("pointerdown", 2, 600, 300)
    for (let k = 1; k <= 6; k++) { ev("pointermove", 2, 600 + k * 22, 300 - k * 22); await sleep(8) }
    ev("pointerup", 2, 600 + 6 * 22, 300 - 6 * 22); await sleep(120)
    const p = Mh().world.puck; const out = { got, carrier: p.carrierId, speed: Math.hypot(p.vx, p.vy) }
    ev("pointerup", 1, 230, 300); return out
  })
  check("el joystick recoge el puck y el deslizamiento lo patea", g.got !== null && g.carrier === null && g.speed > 15, JSON.stringify(g))
  await page.waitForSelector('[aria-label="Fin del partido"]', { timeout: 25000 })
  const txt = (await page.locator('[aria-label="Fin del partido"]').innerText()).toLowerCase()
  check("pantalla final con estadísticas", ["tiros", "pases completos", "robos", "faltas"].every((w) => txt.includes(w)))
  const before = await page.evaluate("[__handle.debug.saved().settings.localId,__handle.debug.saved().settings.visitId].join()")
  await K("rematch").click(); await page.waitForTimeout(600)
  check("revancha: partido nuevo 0-0, sin recargar y con los mismos equipos",
    (await scr()) === "match" && (await M("m.world.score.join()")) === "0,0" && (await M("m.world.time")) < 1.5 &&
    before === (await page.evaluate("[__handle.debug.saved().settings.localId,__handle.debug.saved().settings.visitId].join()")))
  await t.ctx.close()
})

await r.block("PASE DE UN DEDO: tocar al compañero con el pulgar izquierdo", async () => {
  const t = await fresh(); const { page, K, M } = t
  await t.menu(); await K("play").click(); await page.waitForTimeout(600)
  await scenario(page); await page.waitForTimeout(100)
  const l2 = await toScreen(page, 14, 14)
  check("el compañero de prueba está en la mitad IZQUIERDA de la pantalla", l2.x < 422, JSON.stringify(l2))
  const a = await tapAt(page, l2.x, l2.y)
  check("un toque rápido con el pulgar izquierdo sobre un compañero le pasa a él", a.carrier === null && a.speed > 8 && a.controlled === "L2", JSON.stringify(a))
  await page.waitForTimeout(2200)
  check("…y ese compañero recibe la pelota (el control no se va a otro)", (await M("m.world.puck.carrierId")) === "L2" && (await M("m.stats.controlledId")) === "L2")
  await scenario(page); await page.waitForTimeout(100)
  const b = await tapAt(page, 120, 330)
  check("un toque izquierdo en el vacío NO pasa (no regala la pelota)", b.carrier === "L1" && b.speed < 0.5, JSON.stringify(b))
  await scenario(page); await page.waitForTimeout(100)
  const c = await tapAt(page, l2.x, l2.y, 700)
  check("apoyar el dedo mucho rato sobre el compañero no es un toque", c.carrier === "L1", JSON.stringify(c))
  await scenario(page); await page.waitForTimeout(100)
  const l3 = await toScreen(page, 26, 6)
  const d = await tapAt(page, l3.x, l3.y)
  check("un toque sobre un compañero del lado derecho también pasa", d.carrier === null && d.controlled === "L3", JSON.stringify(d))
  // (el caso "rival pegado a un compañero" no se prueba acá: la IA mueve a ambos durante el toque y sería
  //  inestable; lo cubre tests/engine/tap-pass.test.ts con posiciones exactas)
  // Los compañeros que no controlás los mueve la IA: se lee dónde está L4 JUSTO antes de tocar su flecha.
  await scenario(page, { L4: [5, 17], L2: [14, 3] }); await page.waitForTimeout(300)
  const pr = await page.evaluate(() => { const m = __handle.debug.match(), k = m.world.skaters.find((q) => q.id === "L4"); return m.camera.toScreen(k.x, k.y) })
  const vw = 844, vh = 390, mg = 24, dx = pr.x - vw / 2, dy = pr.y - vh / 2
  const k = Math.min((vw / 2 - mg) / Math.abs(dx || 1e-9), (vh / 2 - mg) / Math.abs(dy || 1e-9))
  check("hay un compañero fuera de cuadro para probar la flecha de borde", pr.x < 0 || pr.x > vw || pr.y < 0 || pr.y > vh, JSON.stringify(pr))
  const f = await tapAt(page, vw / 2 + dx * k, vh / 2 + dy * k)
  check("tocar la flecha de borde de un compañero fuera de cuadro le pasa a él", f.carrier === null && f.controlled === "L4", JSON.stringify(f))
  await t.ctx.close()
})

await r.block("SAQUE TRAS EL GOL: la pelota es de quien lo recibió", async () => {
  const t = await fresh(); const { page, K } = t
  await t.menu(); await K("play").click(); await page.waitForTimeout(800)
  for (const side of [0, 1]) {
    await page.evaluate((side) => {
      const w = __handle.debug.match().world
      for (const k of w.skaters) { k.x = k.px = 20; k.y = k.py = 3 + Number(k.id.slice(1)) * 3; k.vx = k.vy = 0 }
      const g = w.goalies[side]; g.y = g.py = 3
      w.puck.carrierId = null; w.puck.x = w.puck.px = side === 0 ? 3 : 37; w.puck.y = w.puck.py = 10
      w.puck.vx = side === 0 ? -26 : 26; w.puck.vy = 0; w.phase = "play"
    }, side)
    await page.waitForFunction(() => __handle.debug.match().world.phase === "goal", null, { timeout: 4000 })
    const score = await page.evaluate("__handle.debug.match().world.score.join('-')")
    await page.waitForFunction(() => __handle.debug.match().world.phase === "play", null, { timeout: 8000 })
    await page.waitForTimeout(150)
    const carrier = await page.evaluate("__handle.debug.match().world.puck.carrierId")
    check(side === 0 ? `te hacen el gol (${score}): sacás vos, con la pelota (${carrier})` : `le hacés el gol al rival (${score}): saca el rival (${carrier})`,
      side === 0 ? String(carrier).startsWith("L") : String(carrier).startsWith("V"), String(carrier))
    if (side === 0) {
      const a = await page.evaluate(async () => {
        const m = __handle.debug.match(), w = m.world, s = w.skaters.find((k) => k.id === w.puck.carrierId), to = w.skaters.find((k) => k.side === 0 && k.id !== s.id)
        const sp = m.camera.toScreen(to.x, to.y), c = document.querySelector("canvas")
        const ev = (t) => c.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: sp.x, clientY: sp.y, bubbles: true, cancelable: true, pointerType: "touch" }))
        ev("pointerdown"); await new Promise((r) => setTimeout(r, 80)); ev("pointerup"); await new Promise((r) => setTimeout(r, 80))
        return { carrier: w.puck.carrierId, to: to.id, controlled: m.stats.controlledId }
      })
      check("en el primer instante del saque ya podés pasar tocando a un compañero", a.carrier === null || a.carrier === a.to, JSON.stringify(a))
    }
  }
  await t.ctx.close()
})

await r.block("COPA: el tutorial sale al arrancar, se puede omitir y no volver a mostrar", async () => {
  const t = await fresh(); const { page, K, saved, M } = t
  const startCup = async () => {
    // desde el menú hay que entrar a la Copa; tras cancelar una, la app ya queda en la selección de equipos
    if ((await page.locator('[data-key^="pick-"]').count()) === 0) await K("cup").click()
    // la pantalla ya trae 4 equipos marcados: se deja marcado exactamente este grupo (sin des-marcar sin querer)
    const want = ["n-es", "n-pt", "n-ar", "n-cl"]
    for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-key^="pick-"]')].filter((e) => e.getAttribute("aria-checked") === "true").map((e) => e.getAttribute("data-key").slice(5)))) {
      if (!want.includes(id)) await K(`pick-${id}`).click()
    }
    for (const id of want) if ((await K(`pick-${id}`).getAttribute("aria-checked")) !== "true") await K(`pick-${id}`).click()
    await K("start-cup").click()
    await K("play-cup").click(); await page.waitForTimeout(1400)
  }
  await t.menu()
  await startCup()
  const dlg = page.locator('.fp-dialog[aria-label="Cómo se juega"]')
  check("al arrancar la Copa aparece el tutorial", (await dlg.count()) === 1)
  check("y el partido queda en pausa detrás", await M("m.paused"))
  check("ofrece 'Entendido' y 'No volver a mostrar'", (await K("tutorial-ok").count()) === 1 && (await K("tutorial-never").count()) === 1)
  check("mientras no elijas 'no volver', queda sin apagar", (await saved()).settings.tutorialOptOut === false)
  await K("tutorial-ok").click(); await page.waitForTimeout(400)
  check("'Entendido' lo cierra y el partido sigue", (await dlg.count()) === 0 && !(await M("m.paused")))
  await K("pause").click(); await page.waitForTimeout(350); await K("restart").click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-0"]').click() // confirma el reinicio
  await page.waitForTimeout(1600)
  check("reiniciar el mismo cruce de verdad (reloj a cero)", (await M("m.world.time")) < 2.5 && (await M("m.world.score.join()")) === "0,0")
  check("…NO vuelve a mostrar el tutorial", (await dlg.count()) === 0)
  await K("pause").click(); await page.waitForTimeout(350); await K("quit").click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-0"]').click(); await page.waitForTimeout(400)
  await K("cancel-cup").click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-0"]').click(); await page.waitForTimeout(400)
  await startCup()
  check("otra Copa nueva lo vuelve a mostrar (todavía no se apagó)", (await dlg.count()) === 1)
  await K("tutorial-never").click(); await page.waitForTimeout(400)
  check("'No volver a mostrar' lo cierra, sigue el partido y queda guardado", (await dlg.count()) === 0 && !(await M("m.paused")) && (await saved()).settings.tutorialOptOut === true)
  await K("pause").click(); await page.waitForTimeout(350); await K("quit").click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-0"]').click(); await page.waitForTimeout(400)
  await K("cancel-cup").click(); await page.waitForTimeout(350)
  await page.locator('.fp-dialog [data-key="dlg-0"]').click(); await page.waitForTimeout(400)
  await startCup()
  check("con 'No volver a mostrar' ninguna Copa nueva lo muestra", (await dlg.count()) === 0)
  await bootToMenu(page, URL)
  check("la opción sobrevive a recargar la app", (await saved()).settings.tutorialOptOut === true)
  await t.ctx.close()
})

await r.block("ENTRENAMIENTO: los dos atajos secretos", async () => {
  const t = await fresh(); const { page, K, saved, scr } = t
  await t.menu(); await K("setup").click()
  await page.keyboard.down("Shift")
  for (const d of ["0", "1", "7", "8", "9"]) await page.keyboard.press(`Digit${d}`)
  await page.keyboard.up("Shift"); await page.waitForTimeout(400)
  check("PC: Shift + 0-1-7-8-9 desbloquea el entrenamiento (con la tecla física, no el símbolo)", (await saved()).settings.trainingUnlocked === true)
  check("y avisa con un diálogo", (await page.locator(".fp-dialog").count()) > 0)
  const t2 = await fresh(); await t2.menu(); await t2.K("setup").click()
  const box = await t2.page.locator("h2.fp-arcade").first().boundingBox()
  await t2.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await t2.page.mouse.down(); await t2.page.waitForTimeout(3000)
  check("celular: a los 3 s todavía no", (await t2.saved()).settings.trainingUnlocked === false)
  await t2.page.waitForTimeout(3500)
  check("celular: manteniendo el título 'PARTIDO' 6 s lo desbloquea", (await t2.saved()).settings.trainingUnlocked === true)
  await t2.page.mouse.up()
  // ya desbloqueado: el menú ofrece el modo
  await page.locator('.fp-dialog button').first().click().catch(() => {})
  await K("back").click(); await page.waitForTimeout(300)
  check("desbloqueado, el menú muestra 'Modo entrenamiento'", (await K("training").count()) === 1)
  await K("training").click(); await page.waitForTimeout(300)
  check("y abre la pantalla de entrenamiento", (await scr()) === "training")
  await t.ctx.close(); await t2.ctx.close()
})

await r.block("PÚBLICO Y AUDIO: murmullo, ovación de gol, silencio y pausa (medido en la salida real)", async () => {
  const t = await fresh(); const { page, K, M } = t
  // todo lo que va a los parlantes pasa por un analizador: se mide el nivel real, no solo el estado interno
  await page.addInitScript(() => {
    const orig = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (typeof AudioDestinationNode !== "undefined" && dest instanceof AudioDestinationNode) {
        const c = this.context
        if (!c.__tap) { c.__tap = c.createAnalyser(); c.__tap.fftSize = 2048; orig.call(c.__tap, c.destination); window.__ctx = c }
        return orig.call(this, c.__tap, ...rest)
      }
      return orig.call(this, dest, ...rest)
    }
    window.__db = () => {
      const c = window.__ctx; if (!c) return -200
      const d = new Float32Array(2048); c.__tap.getFloatTimeDomainData(d)
      let s = 0; for (const v of d) s += v * v
      return 20 * Math.log10(Math.sqrt(s / d.length) + 1e-9)
    }
  })
  const db = () => page.evaluate("window.__db()")
  const audio = () => page.evaluate("__handle.debug.match().audio")
  await t.menu(); await K("play").click(); await page.waitForTimeout(500)
  await page.mouse.click(600, 200) // gesto sobre la cancha: desbloquea el audio
  await page.waitForFunction(() => __handle.debug.match()?.audio?.status === "ready", null, { timeout: 8000 })
  let a = await audio()
  check("los 6 audios se cargan y decodifican (estado 'ready', 3 capas de bucle)", a.status === "ready" && a.layers === 3, JSON.stringify(a))
  await page.waitForTimeout(2500)
  const calm = await db()
  check(`el murmullo de fondo suena (${calm.toFixed(0)} dB) y es discreto`, calm > -60 && calm < -25, String(calm))
  // gol real del equipo humano: la ovación tiene que sobresalir claramente del murmullo
  await page.evaluate(() => { const w = __handle.debug.match().world; for (const k of w.skaters) { k.x = k.px = 20; k.y = k.py = 3 + Number(k.id.slice(1)) * 3; k.vx = k.vy = 0 } w.goalies[1].y = w.goalies[1].py = 3; w.puck.carrierId = null; w.puck.x = w.puck.px = 37; w.puck.y = w.puck.py = 10; w.puck.vx = 26; w.puck.vy = 0; w.phase = "play" })
  let top = -200
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(250); top = Math.max(top, await db()) }
  check(`la ovación de gol sobresale del murmullo (+${(top - calm).toFixed(0)} dB)`, top > calm + 10, `${top} vs ${calm}`)
  check("el nivel máximo no satura la salida", top < -6, String(top))
  await M("m.setSound(false)"); await page.waitForTimeout(700)
  check("silenciado, el público se calla del todo", (await db()) < -70, String(await db()))
  await M("m.setSound(true)"); await page.waitForTimeout(1200)
  check("con sonido otra vez, vuelve", (await db()) > -60)
  await K("pause").click(); await page.waitForTimeout(800)
  check("en pausa, el público se calla", (await db()) < -70, String(await db()))
  check("sin errores de audio en consola", errs.length === 0, errs.slice(0, 2).join(" | "))
  await t.ctx.close()
})

await r.block("PÚBLICO: el demo lo tiene y el entrenamiento no", async () => {
  const t = await fresh(); const { page, K, scr } = t
  await page.goto(URL); await page.waitForTimeout(500)
  check("el demo tiene público (listo para sonar apenas haya un gesto)", (await page.evaluate("__handle.debug.match().audio")) !== null)
  await bootToMenu(page, URL)
  await K("setup").click()
  await page.keyboard.down("Shift"); for (const d of ["0", "1", "7", "8", "9"]) await page.keyboard.press(`Digit${d}`); await page.keyboard.up("Shift"); await page.waitForTimeout(400)
  await page.locator(".fp-dialog button").first().click().catch(() => {})
  await K("back").click(); await K("training").click(); await page.waitForTimeout(300)
  await K("train-local").click().catch(() => {}); await page.waitForTimeout(700)
  check("en el entrenamiento (práctica en soledad) no hay público", (await scr()) === "match" && (await page.evaluate("__handle.debug.match().audio")) === null)
  await t.ctx.close()
})

await browser.close()
check("sin errores en consola durante toda la corrida", errs.length === 0, errs.slice(0, 3).join(" | "))
r.finish()
