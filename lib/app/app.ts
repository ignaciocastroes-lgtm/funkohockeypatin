import { mountMatch } from "../game/match"
import type { MatchHandle, MatchOptions, MatchResult, Nivel } from "../game/match"
import { DURATIONS, allTeams, load, normalize, save } from "./storage"
import type { Saved } from "./storage"
import { CSS } from "./styles"
import {
  KINDS, KIND_LABEL, MAX_CUSTOM_TEAMS, NAME_MAX, PLAYER_NAME_MAX, SURFACES, SURFACE_HINT, SURFACE_LABEL,
  defaultRoster, distinctColors, makeTeam,
} from "./teams"
import type { Team, TeamDraft } from "./teams"
import { newCup, nextMatch, recordResult } from "./cup"
import type { Cup, CupMatch, MatchSlot } from "./cup"
import type { SkaterKind, Surface } from "../engine"

/**
 * Aplicación completa (menú, equipos, partido) SIN framework: un solo módulo que se monta en un <div>.
 * Next solo lo aloja (app/page.tsx). Así todo se puede probar igual en un navegador suelto.
 */

export interface AppOptions {
  /** Fuerza la duración del partido (segundos). Solo para desarrollo/pruebas. */
  durationOverride?: number
  debug?: boolean
  /** Reemplaza localStorage (pruebas). */
  storage?: Storage | null
}

export interface AppHandle {
  destroy(): void
  /** Solo para pruebas automáticas. */
  readonly debug: { screen: () => string; match: () => MatchHandle | null; saved: () => Saved }
}

type Screen = "menu" | "setup" | "editor" | "credits" | "match" | "cup"
type Child = Node | string | null | undefined | false

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === "class") e.className = String(v)
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v as EventListener)
    else if (k === "value") (e as unknown as HTMLInputElement).value = String(v)
    else e.setAttribute(k, v === true ? "" : String(v))
  }
  for (const c of kids) if (c !== undefined && c !== null && c !== false) e.append(c)
  return e
}

const NIVELES: Array<{ value: Nivel; label: string }> = [
  { value: "facil", label: "Fácil" },
  { value: "normal", label: "Normal" },
  { value: "dificil", label: "Difícil" },
]
const NIVEL_LABEL: Record<Nivel, string> = { facil: "Fácil", normal: "Normal", dificil: "Difícil" }
const SWATCHES = ["#10b981", "#a855f7", "#f472b6", "#22c55e", "#f97316", "#14b8a6", "#e11d48", "#94a3b8"]

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

const BOLT = `<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`

export function mountApp(root: HTMLElement, opts: AppOptions = {}): AppHandle {
  const storage = opts.storage === undefined ? undefined : opts.storage
  let saved: Saved = storage === undefined ? load() : load(storage)
  const persist = () => { if (storage === undefined) save(saved); else save(saved, storage) }

  let screen: Screen = "menu"
  let match: MatchHandle | null = null
  let endTimer: number | undefined
  let destroyed = false
  let editing: Team | null = null
  let draft: TeamDraft = newDraft()
  let draftError = ""
  let dialog: HTMLElement | null = null

  root.classList.add("fp-root")
  const style = h("style")
  style.textContent = CSS
  const view = h("div", { style: "position:absolute;inset:0" })
  root.replaceChildren(style, view)

  const teamById = (id: string): Team => allTeams(saved).find((t) => t.id === id) ?? allTeams(saved)[0]

  function newDraft(from?: Team): TeamDraft {
    if (from) return { name: from.name, color: from.color, surface: from.surface, roster: from.roster.map((p) => ({ ...p })) }
    return { name: "NUEVO EQUIPO", color: SWATCHES[0], surface: "madera", roster: defaultRoster() }
  }

  // ---------- render con conservación de scroll y foco ----------
  function render() {
    if (destroyed) return
    const scroller = view.querySelector<HTMLElement>(".fp-scroll")
    const top = scroller?.scrollTop ?? 0
    const focusKey = (document.activeElement as HTMLElement | null)?.getAttribute?.("data-key") ?? null
    const next = screen === "menu" ? menuScreen()
      : screen === "setup" ? setupScreen()
      : screen === "editor" ? editorScreen()
      : screen === "credits" ? creditsScreen()
      : screen === "cup" ? cupScreen()
      : null
    if (next) {
      view.replaceChildren(next)
      const sc = view.querySelector<HTMLElement>(".fp-scroll")
      if (sc) { sc.scrollTop = top; fitScrollPadding() }
      if (focusKey) view.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true })
    }
  }
  function go(s: Screen) { screen = s; render() }

  /** La barra fija de abajo tapa lo que se enfoca con el teclado: el margen de scroll se ajusta a su alto real. */
  function fitScrollPadding() {
    const sc = view.querySelector<HTMLElement>(".fp-scroll")
    const bar = view.querySelector<HTMLElement>(".fp-sticky")
    if (sc && bar) sc.style.scrollPaddingBottom = `${bar.offsetHeight + 12}px`
  }
  window.addEventListener("resize", fitScrollPadding)

  // ---------- pantallas ----------
  function corners() {
    return ["tl", "tr", "bl", "br"].map((c) => h("div", { class: `fp-corner ${c}`, "aria-hidden": "true" }))
  }

  function menuScreen(): HTMLElement {
    const local = teamById(saved.settings.localId)
    const visit = teamById(saved.settings.visitId)
    const s = saved.settings
    const bolt = h("div", { class: "fp-bolt", "aria-hidden": "true" })
    bolt.innerHTML = BOLT
    return h("main", { class: "fp-screen fp-menu" },
      ...corners(),
      h("div", { class: "fp-brand" },
        bolt,
        h("h1", { class: "fp-h1 fp-arcade" }, "Liga Funko-Patín"),
        h("div", { class: "fp-sub fp-arcade" }, h("i"), "ARCADE", h("i")),
      ),
      h("div", { class: "fp-actions" },
        h("button", { class: "fp-btn solid", "data-key": "play", onclick: () => startMatch() }, "Jugar partido"),
        h("p", { class: "fp-summary" }, `${local.name} vs ${visit.name} · ${fmtDur(opts.durationOverride ?? s.duration)} · ${NIVEL_LABEL[s.nivel]}`),
        h("button", { class: "fp-btn cy", "data-key": "setup", onclick: () => go("setup") }, "Equipos y ajustes"),
        h("button", { class: "fp-btn ye", "data-key": "cup", onclick: () => go("cup") }, saved.cup ? "Copa (en curso)" : "Copa"),
        h("button", { class: "fp-btn ye", "data-key": "new", onclick: () => openEditor(null) }, "Crear equipo"),
        h("button", { class: "fp-btn te", "data-key": "credits", onclick: () => go("credits") }, "Créditos"),
      ),
    )
  }

  function topBar(title: string, color: string, back: () => void): HTMLElement {
    return h("div", { class: "fp-top" },
      h("button", { class: "fp-btn fp-back", "data-key": "back", "aria-label": "Volver", onclick: back }, "‹ Volver"),
      h("h2", { class: "fp-h2 fp-arcade", style: `color:${color}` }, title),
      h("span", { style: "width:78px", "aria-hidden": "true" }),
    )
  }

  function segmented<T extends string | number>(label: string, key: string, options: Array<{ value: T; label: string }>, current: T, pick: (v: T) => void): HTMLElement {
    return h("div", {},
      h("span", { class: "fp-lab" }, label),
      h("div", { class: "fp-seg", role: "group", "aria-label": label },
        ...options.map((o) => h("button", { type: "button", "data-key": `${key}-${o.value}`, "aria-pressed": String(o.value === current), onclick: () => pick(o.value) }, o.label)),
      ),
    )
  }

  function setLocal(id: string) {
    const s = saved.settings
    if (id === s.visitId) s.visitId = s.localId // intercambio: nunca el mismo equipo de los dos lados
    s.localId = id
    normalize(saved); persist(); render()
  }
  function setVisit(id: string) {
    const s = saved.settings
    if (id === s.localId) s.localId = s.visitId
    s.visitId = id
    normalize(saved); persist(); render()
  }

  function teamChip(t: Team, side: "local" | "visit"): HTMLElement {
    const s = saved.settings
    const selected = (side === "local" ? s.localId : s.visitId) === t.id
    const chip = h("button", {
      type: "button", role: "radio", "aria-checked": String(selected), class: "fp-chip", style: `--tc:${t.color}`,
      "data-key": `${side}-${t.id}`,
      onclick: () => (side === "local" ? setLocal(t.id) : setVisit(t.id)),
    },
      h("span", { class: "fp-dot", style: `background:${t.color}` }),
      h("span", { class: "fp-meta" }, h("b", {}, t.name), h("small", {}, `Pista ${SURFACE_LABEL[t.surface].toLowerCase()}`)),
    )
    if (t.builtin || side === "visit") return chip
    // los equipos propios se editan/borran desde la columna local
    return h("div", { class: "fp-chiprow" }, chip,
      h("button", { type: "button", class: "fp-btn fp-mini", "aria-label": `Editar ${t.name}`, "data-key": `edit-${t.id}`, onclick: () => openEditor(t) }, "✎"),
      h("button", { type: "button", class: "fp-btn fp-mini", "aria-label": `Borrar ${t.name}`, "data-key": `del-${t.id}`, onclick: () => confirmDelete(t) }, "🗑"),
    )
  }

  function setupScreen(): HTMLElement {
    const s = saved.settings
    const teams = allTeams(saved)
    const local = teamById(s.localId)
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("PARTIDO", "#22d3ee", () => go("menu")),
      h("div", { class: "fp-two" },
        h("section", { class: "fp-panel" }, h("h3", {}, "Tu equipo (local)"),
          h("div", { class: "fp-grid", role: "radiogroup", "aria-label": "Equipo local" }, ...teams.map((t) => teamChip(t, "local")))),
        h("section", { class: "fp-panel" }, h("h3", {}, "Rival (visita)"),
          h("div", { class: "fp-grid", role: "radiogroup", "aria-label": "Equipo visita" }, ...teams.map((t) => teamChip(t, "visit")))),
      ),
      h("section", { class: "fp-panel", style: "display:flex;flex-direction:column;gap:14px" },
        segmented<Nivel>("Nivel del rival", "nivel", NIVELES, s.nivel, (v) => { s.nivel = v; persist(); render() }),
        segmented<number>("Duración", "dur", DURATIONS.map((d) => ({ value: d, label: fmtDur(d) })), s.duration, (v) => { s.duration = v; persist(); render() }),
        segmented<string>("Dedos", "hand", [{ value: "r", label: "Diestro (mover a la izquierda)" }, { value: "l", label: "Zurdo (mover a la derecha)" }], s.leftHanded ? "l" : "r", (v) => { s.leftHanded = v === "l"; persist(); render() }),
        segmented<string>("Sonido", "snd", [{ value: "on", label: "Con sonido" }, { value: "off", label: "Silencio" }], s.sound ? "on" : "off", (v) => { s.sound = v === "on"; persist(); render() }),
        h("p", { class: "fp-note" }, `Se juega en la pista del local: ${SURFACE_LABEL[local.surface].toLowerCase()} (${SURFACE_HINT[local.surface].toLowerCase()}).`),
      ),
      h("div", { class: "fp-sticky" },
        h("button", { class: "fp-btn solid", "data-key": "play", onclick: () => startMatch() }, "Jugar"),
        h("button", { class: "fp-btn ye", "data-key": "new", onclick: () => openEditor(null) }, "Crear equipo"),
      ),
    ))
  }

  function openEditor(t: Team | null) {
    if (!t && saved.customTeams.length >= MAX_CUSTOM_TEAMS) {
      showDialog("Límite de equipos", `Puedes guardar hasta ${MAX_CUSTOM_TEAMS} equipos propios. Borra alguno para crear otro.`, [{ label: "Entendido", primary: true }])
      return
    }
    editing = t
    draft = newDraft(t ?? undefined)
    draftError = ""
    go("editor")
  }

  function editorScreen(): HTMLElement {
    const nameInput = h("input", {
      id: "fp-name", class: "fp-input", type: "text", maxlength: String(NAME_MAX), value: draft.name, "data-key": "name", autocomplete: "off",
      oninput: (e: Event) => { draft.name = (e.target as HTMLInputElement).value },
    })
    const colorInput = h("input", {
      class: "fp-color", type: "color", value: draft.color, "aria-label": "Color del equipo", "data-key": "color",
      oninput: (e: Event) => { draft.color = (e.target as HTMLInputElement).value; refreshDots() },
    })
    const dotsHost = h("div", { class: "fp-sw" })
    const refreshDots = () => {
      dotsHost.replaceChildren(...SWATCHES.map((c) => h("button", {
        type: "button", style: `background:${c}`, "aria-label": `Color ${c}`, "aria-pressed": String(c.toLowerCase() === draft.color.toLowerCase()),
        onclick: () => { draft.color = c; colorInput.value = c; refreshDots() },
      })))
    }
    refreshDots()

    const errorEl = h("p", { class: "fp-error", role: "alert", "data-key": "error" }, draftError)

    const rosterEls = draft.roster.map((p, i) => h("div", { class: "fp-player" },
      h("div", { style: "display:flex;align-items:center;gap:8px" },
        h("span", { class: "fp-dot", style: `background:${draft.color}`, "aria-hidden": "true" }),
        h("input", {
          class: "fp-input sm", type: "text", maxlength: String(PLAYER_NAME_MAX), value: p.name, "aria-label": `Nombre del jugador ${i + 1}${i === 0 ? " (capitán)" : ""}`,
          placeholder: i === 0 ? "CAPITÁN" : `JUGADOR ${i + 1}`, "data-key": `pname-${i}`, autocomplete: "off",
          oninput: (e: Event) => { p.name = (e.target as HTMLInputElement).value },
        }),
        i === 0 ? h("span", { "aria-hidden": "true", style: "color:#fbbf24;font-size:20px" }, "★") : null,
      ),
      h("div", { class: "fp-seg", role: "group", "aria-label": `Estilo del jugador ${i + 1}` },
        ...KINDS.map((k: SkaterKind) => h("button", {
          type: "button", "data-key": `kind-${i}-${k}`, "aria-pressed": String(p.kind === k),
          onclick: () => { p.kind = k; render() },
        }, KIND_LABEL[k])),
      ),
    ))

    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar(editing ? "EDITAR EQUIPO" : "CREAR EQUIPO", "#facc15", () => go(editing ? "setup" : "menu")),
      h("section", { class: "fp-panel" },
        h("div", { class: "fp-two" },
          h("div", {}, h("label", { class: "fp-lab", for: "fp-name" }, "Nombre"), nameInput),
          h("div", {}, h("span", { class: "fp-lab" }, "Color"), colorInput, dotsHost),
        ),
      ),
      h("section", { class: "fp-panel" },
        segmented<Surface>("Pista de localía", "surf", SURFACES.map((v) => ({ value: v, label: SURFACE_LABEL[v] })), draft.surface, (v) => { draft.surface = v; render() }),
        h("p", { class: "fp-note" }, `${SURFACE_HINT[draft.surface]}. Aplica cuando este equipo juega de local.`),
      ),
      h("section", { class: "fp-panel" }, h("h3", {}, "Plantilla titular"), h("div", { class: "fp-roster" }, ...rosterEls),
        h("p", { class: "fp-note" }, "Pesado: aguanta golpes pero es lento. Veloz: ágil pero liviano. El primero es el capitán."),
      ),
      errorEl,
      h("div", { class: "fp-sticky" },
        h("button", { class: "fp-btn ye solid", "data-key": "save", onclick: saveDraft }, "Guardar equipo"),
        h("button", { class: "fp-btn gr", "data-key": "cancel", onclick: () => go(editing ? "setup" : "menu") }, "Cancelar"),
      ),
    ))
  }

  function saveDraft() {
    const r = makeTeam(draft, allTeams(saved), editing?.id)
    if ("error" in r) {
      draftError = r.error
      const el = view.querySelector<HTMLElement>(".fp-error")
      if (el) el.textContent = r.error
      view.querySelector<HTMLElement>('[data-key="name"]')?.focus()
      return
    }
    const i = saved.customTeams.findIndex((t) => t.id === r.team.id)
    if (i >= 0) saved.customTeams[i] = r.team
    else saved.customTeams.push(r.team)
    if (!editing) saved.settings.localId = r.team.id // el equipo nuevo queda seleccionado como local
    normalize(saved)
    persist()
    editing = null
    go("setup")
  }

  function confirmDelete(t: Team) {
    showDialog(`¿Borrar ${t.name}?`, "Se elimina de este dispositivo y no se puede deshacer.", [
      { label: "Borrar", danger: true, onClick: () => {
        saved.customTeams = saved.customTeams.filter((x) => x.id !== t.id)
        normalize(saved); persist(); render()
      } },
      { label: "Cancelar" },
    ])
  }

  function creditsScreen(): HTMLElement {
    return h("main", { class: "fp-screen", style: "text-align:center;gap:18px" },
      h("h2", { class: "fp-arcade", style: "color:#2dd4bf;margin:0;font-size:clamp(18px,4vw,34px)" }, "CRÉDITOS"),
      h("p", { style: "margin:0;font-size:clamp(14px,2.6vw,20px);line-height:1.8" },
        "Desarrollo original: ", h("b", { style: "color:#facc15" }, "Ignacio"), h("br"),
        "Motor físico y sanciones: ", h("b", { style: "color:#22d3ee" }, "Liga Funko-Patín Team"), h("br"),
        "Pista: ", h("b", { style: "color:#ea580c" }, "40 × 20 m, reglamentaria")),
      h("button", { class: "fp-btn gr", "data-key": "back", onclick: () => go("menu") }, "Volver"),
    )
  }

  // ---------- diálogos ----------
  interface DialogButton { label: string; primary?: boolean; danger?: boolean; onClick?: () => void }
  function showDialog(title: string, text: string, buttons: DialogButton[], host: HTMLElement = root) {
    closeDialog()
    const prevFocus = document.activeElement as HTMLElement | null
    const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("h2", { class: "fp-arcade" }, title),
      h("p", { style: "margin:0;text-align:center;color:rgba(255,255,255,.8);font-size:14px;line-height:1.5" }, text),
      h("div", { class: "fp-row" }, ...buttons.map((b, i) => h("button", {
        class: `fp-btn ${b.danger ? "rd" : b.primary ? "cy solid" : "gr"}`, "data-key": `dlg-${i}`,
        onclick: () => { closeDialog(); prevFocus?.focus?.({ preventScroll: true }); b.onClick?.() },
      }, b.label))),
    )
    openModal(host, h("div", { class: "fp-overlay", style: "z-index:30" }, box))
  }
  let inertTargets: Element[] = []
  /** Abre un diálogo modal: todo lo demás del contenedor queda inerte (sin foco de teclado ni toques). */
  function openModal(host: HTMLElement, overlay: HTMLElement) {
    for (const t of inertTargets) t.removeAttribute("inert")
    inertTargets = [...host.children].filter((c) => c.tagName !== "STYLE")
    for (const t of inertTargets) t.setAttribute("inert", "")
    dialog = overlay
    host.append(overlay)
    overlay.querySelector<HTMLElement>("button")?.focus()
  }
  function closeDialog() {
    for (const t of inertTargets) t.removeAttribute("inert")
    inertTargets = []
    dialog?.remove()
    dialog = null
  }

  // ---------- partido ----------
  function teamMatchOptions(localId: string, visitId: string): Pick<MatchOptions, "teams" | "surface" | "nivel" | "duration" | "leftHanded" | "sound" | "debug"> {
    const s = saved.settings
    const local = teamById(localId)
    const visit = teamById(visitId)
    const [lc, vc] = distinctColors(local.color, visit.color)
    const mk = (t: Team, color: string) => ({ name: t.name, color, kinds: t.roster.map((p) => p.kind), names: t.roster.map((p) => p.name) })
    return {
      teams: [mk(local, lc), mk(visit, vc)],
      surface: local.surface,
      nivel: s.nivel,
      duration: opts.durationOverride ?? s.duration,
      leftHanded: s.leftHanded,
      sound: s.sound,
      debug: opts.debug,
    }
  }
  function matchOptions() { return teamMatchOptions(saved.settings.localId, saved.settings.visitId) }

  function stopMatch() {
    if (endTimer !== undefined) { window.clearTimeout(endTimer); endTimer = undefined }
    closeDialog()
    match?.destroy()
    match = null
    cupPlaying = null
  }

  /** Barra fija de controles (pausa / pantalla completa / sonido) sobre el partido en curso. */
  function matchHudBar(wrap: HTMLElement, m: MatchHandle): HTMLElement {
    return h("div", { class: "fp-hud" },
      h("button", { class: "fp-btn", "aria-label": "Pausa", "data-key": "pause", onclick: () => showPause(wrap) }, "❚❚"),
      canFullscreen() ? h("button", { class: "fp-btn", "aria-label": "Pantalla completa", "data-key": "fs", onclick: toggleFullscreen }, "⛶") : null,
      h("button", { class: "fp-btn", "aria-label": saved.settings.sound ? "Silenciar" : "Activar sonido", "data-key": "snd", "aria-pressed": String(saved.settings.sound),
        onclick: (e: Event) => {
          saved.settings.sound = !saved.settings.sound
          m.setSound(saved.settings.sound)
          const b = e.currentTarget as HTMLElement
          b.textContent = saved.settings.sound ? "🔊" : "🔇"
          b.setAttribute("aria-label", saved.settings.sound ? "Silenciar" : "Activar sonido")
          b.setAttribute("aria-pressed", String(saved.settings.sound))
          persist()
        } }, saved.settings.sound ? "🔊" : "🔇"),
    )
  }

  function startMatch() {
    stopMatch()
    screen = "match"
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = matchOptions()
    const m = mountMatch(wrap, {
      ...mo,
      onEnd: (r) => {
        // el partido terminó: la pausa ya no tiene sentido (antes el botón quedaba "vivo" sin hacer nada)
        const pb = wrap.querySelector<HTMLButtonElement>('[data-key="pause"]')
        if (pb) { pb.disabled = true; pb.setAttribute("aria-disabled", "true") }
        endTimer = window.setTimeout(() => showEnd(wrap, r), 1600)
      },
      onAutoPause: () => showPause(wrap),
    })
    match = m
    wrap.append(matchHudBar(wrap, m))
  }

  // ---------- copa ----------
  /** Equipos elegidos en la pantalla de armado de la Copa (no persiste hasta sortear). */
  let cupPick: string[] = allTeams(saved).slice(0, 4).map((t) => t.id)
  /** Qué cruce de la Copa se está jugando ahora mismo, si hay uno. */
  let cupPlaying: { which: MatchSlot; home: string; away: string } | null = null

  function shuffled<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function toggleCupPick(id: string) {
    if (cupPick.includes(id)) cupPick = cupPick.filter((x) => x !== id)
    else if (cupPick.length < 4) cupPick = [...cupPick, id]
    render()
  }

  function startCupMatch(which: MatchSlot, home: string, away: string) {
    stopMatch()
    cupPlaying = { which, home, away }
    screen = "match"
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = teamMatchOptions(home, away)
    const m = mountMatch(wrap, {
      ...mo,
      onEnd: (r) => {
        const pb = wrap.querySelector<HTMLButtonElement>('[data-key="pause"]')
        if (pb) { pb.disabled = true; pb.setAttribute("aria-disabled", "true") }
        endTimer = window.setTimeout(() => showCupEnd(wrap, r), 1600)
      },
      onAutoPause: () => showPause(wrap),
    })
    match = m
    wrap.append(matchHudBar(wrap, m))
  }

  function showCupEnd(wrap: HTMLElement, r: MatchResult) {
    if (!match || destroyed || !cupPlaying || !saved.cup) return
    closeDialog()
    const { which, home, away } = cupPlaying
    const homeT = teamById(home)
    const awayT = teamById(away)
    const [lc, vc] = distinctColors(homeT.color, awayT.color)
    const { cup: after, drawn } = recordResult(saved.cup, which, r.score)

    if (drawn) {
      const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Empate", style: "max-width:520px" },
        h("p", { class: "fp-result fp-arcade" }, "¡EMPATE!"),
        h("div", { class: "fp-score" }, h("span", { style: `color:${lc}` }, String(r.score[0])), h("span", { style: "font-size:.6em;opacity:.7" }, "-"), h("span", { style: `color:${vc}` }, String(r.score[1]))),
        h("p", { style: "margin:0;text-align:center;color:rgba(255,255,255,.8);font-size:14px" }, "En la Copa no hay empates: hay que definirlo."),
        h("div", { class: "fp-row" },
          h("button", { class: "fp-btn solid", "data-key": "replay", onclick: () => startCupMatch(which, home, away) }, "Jugar de nuevo"),
          h("button", { class: "fp-btn gr", "data-key": "cup", onclick: () => { stopMatch(); go("cup") } }, "Ver llave"),
        ),
      )
      openModal(wrap, h("div", { class: "fp-overlay" }, box))
      return
    }

    saved.cup = after
    persist()
    const winnerId = r.score[0] > r.score[1] ? home : away
    const winnerT = teamById(winnerId)
    const champion = after.championId
    const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Fin del partido de Copa", style: "max-width:520px" },
      h("p", { class: "fp-result fp-arcade", style: "color:#facc15" }, champion ? "¡CAMPEÓN!" : "AVANZA"),
      h("div", { class: "fp-score" }, h("span", { style: `color:${lc}` }, String(r.score[0])), h("span", { style: "font-size:.6em;opacity:.7" }, "-"), h("span", { style: `color:${vc}` }, String(r.score[1]))),
      h("p", { style: "margin:0;text-align:center;font-size:14px" }, champion ? `${teamById(champion).name} se queda con la Copa.` : `${winnerT.name} pasa a la siguiente ronda.`),
      h("div", { class: "fp-row" },
        h("button", { class: "fp-btn solid", "data-key": "cup", onclick: () => { stopMatch(); go("cup") } }, champion ? "Ver Copa" : "Siguiente partido"),
        h("button", { class: "fp-btn gr", "data-key": "menu", onclick: () => { stopMatch(); go("menu") } }, "Menú"),
      ),
    )
    openModal(wrap, h("div", { class: "fp-overlay" }, box))
  }

  function cupMatchRow(label: string, m: CupMatch): HTMLElement {
    const home = m.home ? teamById(m.home) : null
    const away = m.away ? teamById(m.away) : null
    return h("section", { class: "fp-panel", style: "display:flex;flex-direction:column;gap:8px" },
      h("h4", { style: "margin:0;opacity:.75;font-size:12px;letter-spacing:.08em" }, label),
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:10px" },
        h("b", { style: `color:${home?.color ?? "#9ca3af"}` }, home?.name ?? "?"),
        h("span", { style: "opacity:.8;font-size:13px" }, m.played && m.score ? `${m.score[0]} - ${m.score[1]}` : "vs"),
        h("b", { style: `color:${away?.color ?? "#9ca3af"}` }, away?.name ?? "?"),
      ),
    )
  }

  function cupSetupScreen(): HTMLElement {
    const teams = allTeams(saved)
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("COPA", "#facc15", () => go("menu")),
      h("section", { class: "fp-panel" },
        h("h3", {}, `Elige 4 equipos (${cupPick.length}/4)`),
        h("p", { class: "fp-note" }, "Eliminación directa: dos semifinales y una final. El sorteo de cruces es al azar."),
        h("div", { class: "fp-grid", role: "group", "aria-label": "Equipos de la copa" },
          ...teams.map((t) => h("button", {
            type: "button", role: "checkbox", class: "fp-chip", style: `--tc:${t.color}`,
            "aria-checked": String(cupPick.includes(t.id)),
            "data-key": `pick-${t.id}`,
            onclick: () => toggleCupPick(t.id),
          },
            h("span", { class: "fp-dot", style: `background:${t.color}` }),
            h("span", { class: "fp-meta" }, h("b", {}, t.name)),
          )),
        ),
      ),
      h("div", { class: "fp-sticky" },
        h("button", {
          class: "fp-btn solid", "data-key": "start-cup", disabled: cupPick.length !== 4,
          onclick: () => {
            if (cupPick.length !== 4) return
            const ids = shuffled(cupPick) as [string, string, string, string]
            saved.cup = newCup(ids)
            persist()
            render()
          },
        }, "Sortear y empezar Copa"),
      ),
    ))
  }

  function cupBracketScreen(cup: Cup): HTMLElement {
    const nm = nextMatch(cup)
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("COPA", "#facc15", () => go("menu")),
      cupMatchRow("Semifinal 1", cup.semis[0]),
      cupMatchRow("Semifinal 2", cup.semis[1]),
      cupMatchRow("Final", cup.final),
      cup.championId ? h("section", { class: "fp-panel", style: "text-align:center" },
        h("p", { class: "fp-result fp-arcade", style: "color:#facc15;margin:0" }, "¡CAMPEÓN!"),
        h("p", { style: `margin:4px 0 0;color:${teamById(cup.championId).color};font-weight:700` }, teamById(cup.championId).name),
      ) : null,
      h("div", { class: "fp-sticky" },
        nm
          ? h("button", { class: "fp-btn solid", "data-key": "play-cup", onclick: () => startCupMatch(nm.which, nm.home, nm.away) },
              `Jugar: ${teamById(nm.home).name} vs ${teamById(nm.away).name}`)
          : h("button", { class: "fp-btn solid", "data-key": "new-cup", onclick: () => { saved.cup = null; persist(); render() } }, "Nueva Copa"),
        cup.championId ? null : h("button", {
          class: "fp-btn rd", "data-key": "cancel-cup",
          onclick: () => showDialog("¿Cancelar la Copa?", "Se pierde el progreso del torneo.", [
            { label: "Cancelar Copa", danger: true, onClick: () => { saved.cup = null; persist(); render() } },
            { label: "Seguir" },
          ]),
        }, "Cancelar Copa"),
      ),
    ))
  }

  function cupScreen(): HTMLElement {
    return saved.cup ? cupBracketScreen(saved.cup) : cupSetupScreen()
  }

  function canFullscreen(): boolean {
    return typeof document !== "undefined" && !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function"
  }
  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) { void document.exitFullscreen?.() }
      else { const p = document.documentElement.requestFullscreen?.(); if (p && typeof p.catch === "function") p.catch(() => undefined) }
    } catch { /* no soportado */ }
  }

  function showPause(wrap: HTMLElement) {
    if (!match || match.ended || dialog) return
    match.pause()
    closeDialog()
    const back = () => { closeDialog(); match?.resume() }
    const cp = cupPlaying
    const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Pausa" },
      h("h2", { class: "fp-arcade" }, "PAUSA"),
      h("button", { class: "fp-btn solid", "data-key": "resume", onclick: back }, "Continuar"),
      h("button", { class: "fp-btn cy", "data-key": "restart", onclick: () => showDialog("¿Reiniciar el partido?", "Empiezas de nuevo con 0-0.", [
        { label: "Reiniciar", danger: true, onClick: () => (cp ? startCupMatch(cp.which, cp.home, cp.away) : startMatch()) },
        { label: "Cancelar", onClick: () => showPause(wrap) },
      ], wrap) }, "Reiniciar partido"),
      h("button", { class: "fp-btn rd", "data-key": "quit", onclick: () => showDialog(cp ? "¿Salir a la Copa?" : "¿Salir al menú?", "Se pierde el partido en curso.", [
        { label: "Salir", danger: true, onClick: () => { stopMatch(); go(cp ? "cup" : "menu") } },
        { label: "Cancelar", onClick: () => showPause(wrap) },
      ], wrap) }, cp ? "Salir a la Copa" : "Salir al menú"),
    )
    openModal(wrap, h("div", { class: "fp-overlay" }, box))
  }

  function showEnd(wrap: HTMLElement, r: MatchResult) {
    if (!match || destroyed) return
    closeDialog()
    const s = saved.settings
    const local = teamById(s.localId)
    const visit = teamById(s.visitId)
    const [lc, vc] = distinctColors(local.color, visit.color)
    const won = r.score[0] > r.score[1]
    const draw = r.score[0] === r.score[1]
    const row = (label: string, a: number, b: number) => h("tr", {}, h("td", { style: `color:${lc}` }, String(a)), h("td", {}, label), h("td", { style: `color:${vc}` }, String(b)))
    const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Fin del partido", style: "max-width:520px" },
      h("p", { class: "fp-result fp-arcade", style: `color:${draw ? "#e5e7eb" : won ? "#facc15" : "#f87171"}` }, draw ? "¡EMPATE!" : won ? "¡GANASTE!" : "PERDISTE"),
      h("div", { class: "fp-score" }, h("span", { style: `color:${lc}` }, String(r.score[0])), h("span", { style: "font-size:.6em;opacity:.7" }, "-"), h("span", { style: `color:${vc}` }, String(r.score[1]))),
      h("div", { style: "display:flex;justify-content:space-between;font-size:12px;letter-spacing:.06em" },
        h("b", { style: `color:${lc}` }, local.name), h("b", { style: `color:${vc}` }, visit.name)),
      h("table", { class: "fp-stats", "aria-label": "Estadísticas" },
        h("tbody", {}, row("Tiros", r.shots[0], r.shots[1]), row("Pases completos", r.passes[0], r.passes[1]), row("Robos", r.steals[0], r.steals[1]), row("Faltas", r.fouls[0], r.fouls[1]))),
      h("div", { class: "fp-row" },
        h("button", { class: "fp-btn solid", "data-key": "rematch", onclick: () => startMatch() }, "Revancha"),
        h("button", { class: "fp-btn gr", "data-key": "menu", onclick: () => { stopMatch(); go("menu") } }, "Menú"),
      ),
    )
    openModal(wrap, h("div", { class: "fp-overlay" }, box))
  }

  // ---------- teclado (escritorio) ----------
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return
    if (screen === "match") {
      const wrap = view.querySelector<HTMLElement>(".fp-match")
      if (!wrap || !match || match.ended) return
      if (dialog && match.paused) { closeDialog(); match.resume() } else showPause(wrap)
    } else if (screen === "setup" || screen === "credits" || screen === "cup") go("menu")
    else if (screen === "editor") go(editing ? "setup" : "menu")
  }
  document.addEventListener("keydown", onKey)

  render()

  return {
    destroy() {
      destroyed = true
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", fitScrollPadding)
      stopMatch()
      root.replaceChildren()
      root.classList.remove("fp-root")
    },
    debug: { screen: () => screen, match: () => match, saved: () => saved },
  }
}
