// Auditoría de botones: recorre TODAS las pantallas del juego en 7 tamaños de pantalla y falla si algún
// control queda oculto, tapado, fuera de pantalla, sin nombre accesible, demasiado chico para el dedo
// o alcanzable con el teclado estando detrás de un diálogo.
//
// Uso (una vez):  pnpm add -D playwright && pnpm exec playwright install chromium
//                 pnpm audit:ui
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

const html = join(tmpdir(), "funko-patin-audit.html")
execSync(`node scripts/build-standalone.mjs ${JSON.stringify(html)}`, { cwd: root, stdio: "pipe" })
const PAGE_URL = `file://${html}?time=6`

const VIEWS = [[844, 390], [667, 375], [568, 320], [390, 844], [320, 568], [1024, 768], [1440, 900]]
const MIN_TOUCH = 44

const AUDIT = ({ MIN_TOUCH }) => {
  const out = []
  const els = [...document.querySelectorAll(".fp-root button, .fp-root input, .fp-root select, .fp-root a[href], .fp-root [role=radio]")]
  for (const el of els) {
    if (el.closest("[inert]")) continue // detrás de un diálogo: correctamente inerte
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("data-key") || el.tagName).trim().slice(0, 28)
    const issues = []
    let hidden = false
    for (let p = el; p && !hidden; p = p.parentElement) {
      const c = getComputedStyle(p)
      if (c.display === "none" || c.visibility === "hidden" || parseFloat(c.opacity) < 0.05) hidden = true
    }
    if (hidden) { out.push({ name, issues: ["OCULTO (display/visibility/opacity)"] }); continue }
    if (getComputedStyle(el).pointerEvents === "none" && !el.disabled) issues.push("pointer-events:none")
    el.scrollIntoView({ block: "nearest", inline: "nearest" })
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) issues.push("tamaño 0")
    if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) issues.push(`FUERA DE PANTALLA en ${innerWidth}x${innerHeight}`)
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {
      const t = document.elementFromPoint(cx, cy)
      if (t && !(el === t || el.contains(t) || (t.tagName === "LABEL" && t.contains(el)))) issues.push(`TAPADO por ${t.tagName.toLowerCase()}.${String(t.className).split(" ")[0]}`)
    }
    if (el.tagName !== "INPUT" && Math.min(r.width, r.height) < MIN_TOUCH) issues.push(`objetivo pequeño ${Math.round(r.width)}x${Math.round(r.height)}`)
    if (el.tagName === "BUTTON" && !(el.getAttribute("aria-label") || el.textContent.trim())) issues.push("sin nombre accesible")
    if (issues.length) out.push({ name, issues })
  }
  const scr = document.querySelector(".fp-screen:not(.fp-scroll)")
  if (scr && scr.scrollHeight > scr.clientHeight + 2) out.push({ name: "(pantalla)", issues: [`contenido más alto que la pantalla y sin scroll: ${scr.scrollHeight}>${scr.clientHeight}`] })
  return out
}

const browser = await chromium.launch()
const findings = []
for (const [w, h] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true })
  const page = await ctx.newPage()
  const K = (k) => page.locator(`[data-key="${k}"]`).first()
  const audit = async (label) => {
    for (const r of await page.evaluate(AUDIT, { MIN_TOUCH })) findings.push({ vp: `${w}x${h}`, label, ...r })
  }
  // con un diálogo abierto, Tab solo puede caer en el diálogo (o salir del documento): nunca en controles del fondo
  const trapped = async (label) => {
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab")
      const ok = await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || !!a.closest(".fp-dialog") })
      if (!ok) { findings.push({ vp: `${w}x${h}`, label, name: "(teclado)", issues: ["Tab llega a un control que está detrás del diálogo"] }); return }
    }
  }
  // los diálogos entran con un fundido de 250 ms: se espera a que terminen para medir
  const settle = () => page.waitForTimeout(400)
  await page.goto(PAGE_URL); await page.waitForTimeout(200)
  await audit("menú")
  await K("setup").click(); await audit("ajustes")
  await K("new").click(); await audit("editor")
  await page.fill("#fp-name", "Lobos"); await K("save").click(); await audit("ajustes con equipo propio")
  const cid = await page.evaluate("__handle.debug.saved().customTeams[0].id")
  await K(`del-${cid}`).click(); await settle(); await audit("diálogo borrar"); await trapped("diálogo borrar")
  await page.locator('.fp-dialog [data-key="dlg-1"]').click()
  await K("back").click(); await K("credits").click(); await audit("créditos")
  await K("back").click(); await K("play").click(); await page.waitForTimeout(500); await audit("partido")
  await K("pause").click(); await settle(); await audit("pausa"); await trapped("pausa")
  await K("quit").click(); await settle(); await audit("confirmar salir")
  await page.locator('.fp-dialog [data-key="dlg-1"]').click(); await K("resume").click()
  const portrait = h > w * 1.05
  if (!portrait) {
    try {
      await page.waitForSelector('[aria-label="Fin del partido"]', { timeout: 15000 })
      await settle(); await audit("final"); await trapped("final")
      const dead = await page.evaluate(() => document.querySelector('[data-key="pause"]')?.disabled)
      if (!dead) findings.push({ vp: `${w}x${h}`, label: "final", name: "Pausa", issues: ["el botón de pausa sigue activo tras terminar el partido"] })
    } catch { findings.push({ vp: `${w}x${h}`, label: "final", name: "(partido)", issues: ["el partido no llegó al final"] }) }
  }
  await ctx.close()
}
await browser.close()

if (!findings.length) { console.log(`SIN HALLAZGOS en ${VIEWS.length} tamaños de pantalla`); process.exit(0) }
for (const f of findings) console.log(`[${f.vp}] ${f.label} · ${f.name}: ${f.issues.join("; ")}`)
console.log(`\n${findings.length} hallazgos`)
process.exit(1)
