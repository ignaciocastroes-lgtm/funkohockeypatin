import { mountMatch } from "../game/match"
import { digitFromCode } from "../game/input"
import { shouldShowCupTutorial } from "./tutorial"
import type { MatchHandle, MatchOptions, MatchResult, Nivel } from "../game/match"
import { DURATIONS, allTeams, load, normalize, save } from "./storage"
import type { Saved, Settings } from "./storage"
import { CSS } from "./styles"
import {
  CATEGORIES, CATEGORY_LABEL, CRESTS, KINDS, KIND_LABEL, MAX_CUSTOM_TEAMS, NAME_MAX, PLAYER_NAME_MAX, SURFACES, SURFACE_HINT, SURFACE_LABEL,
  defaultRoster, distinctColors, makeTeam,
} from "./teams"
import type { Category, Team, TeamDraft } from "./teams"
import { newCup, nextMatch, recordResult } from "./cup"
import type { Cup, MatchSlot } from "./cup"
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

type Screen = "menu" | "setup" | "editor" | "credits" | "match" | "cup" | "training"
type Child = Node | string | null | undefined | false

/** Evento no estándar (Chrome/Edge/Android) que avisa que la página se puede instalar como app. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

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
  // ---------- instalar como app ----------
  // Chrome/Edge/Android avisan con este evento cuando la página es instalable; lo guardamos para
  // poder disparar el diálogo nativo desde un botón nuestro (si no se captura, como en iOS/Safari
  // que no tiene este evento, el botón igual aparece y explica cómo agregarla a mano).
  let installPromptEvent: BeforeInstallPromptEvent | null = null
  let installedThisSession = false
  const onBeforeInstallPrompt = (e: Event) => { e.preventDefault(); installPromptEvent = e as BeforeInstallPromptEvent; render() }
  const onAppInstalled = () => { installedThisSession = true; installPromptEvent = null; render() }
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
  window.addEventListener("appinstalled", onAppInstalled)

  root.classList.add("fp-root")
  const style = h("style")
  style.textContent = CSS
  const view = h("div", { style: "position:absolute;inset:0" })
  root.replaceChildren(style, view)

  const teamById = (id: string): Team => allTeams(saved).find((t) => t.id === id) ?? allTeams(saved)[0]

  function newDraft(from?: Team): TeamDraft {
    if (from) return { name: from.name, color: from.color, crest: from.crest, surface: from.surface, category: from.category, roster: from.roster.map((p) => ({ ...p })) }
    return { name: "NUEVO EQUIPO", color: SWATCHES[0], crest: CRESTS[0], surface: "madera", category: "mixto", roster: defaultRoster() }
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
      : screen === "training" ? trainingScreen()
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

  /** Escena de festejo: el equipo saltando con la copa y un cartel de "¡CAMPEONES!" — se usa tanto
   *  al terminar la final como en la pantalla de la llave, una vez que la Copa ya tiene dueño. */
  function celebrationScene(team: Team): HTMLElement {
    const c = team.color
    const players = [0, 1, 2, 3, 4].map((i) =>
      h("span", { class: "fp-cel-player", style: `animation-delay:${(i * 0.11).toFixed(2)}s`, "aria-hidden": "true" }, "🧍"))
    const confetti = Array.from({ length: 14 }, (_, i) =>
      h("span", { class: "fp-cel-confetti", style: `left:${(i * 7 + 2) % 96}%;animation-delay:${(i * 0.18).toFixed(2)}s;background:${SWATCHES[i % SWATCHES.length]}`, "aria-hidden": "true" }))
    return h("div", { class: "fp-celebration", role: "img", "aria-label": `${team.name}, campeón de la Copa` },
      ...confetti,
      h("div", { class: "fp-cel-banner", style: `--c:${c}` }, "¡CAMPEONES!"),
      h("div", { class: "fp-cel-stage" }, players[0], players[1], h("span", { class: "fp-cel-trophy", "aria-hidden": "true" }, "🏆"), players[2], players[3]),
      h("p", { class: "fp-cel-team", style: `color:${c}` }, team.name),
    )
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
        h("button", { class: "fp-btn gr", "data-key": "demo", onclick: () => startDemo() }, "Modo demo (IA vs IA)"),
        (saved.settings.trainingUnlocked || !!saved.cup?.championId)
          ? h("button", { class: "fp-btn gr", "data-key": "training", onclick: () => go("training") }, "Modo entrenamiento")
          : null,
        h("button", { class: "fp-btn te", "data-key": "credits", onclick: () => go("credits") }, "Créditos"),
        canOfferInstall() ? h("button", { class: "fp-btn gr", "data-key": "install", onclick: () => handleInstallClick() }, "📲 Instalar la app") : null,
      ),
      // marca al pie: el marcador del juego es el de ardisport.cl (texto, no link: un link chico rompería los 44 px)
      h("p", { class: "fp-foot" }, "ardisport.cl"),
    )
  }

  function topBar(title: string, color: string, back: () => void, onTitleHold?: () => void): HTMLElement {
    let holdTimer = 0
    const startHold = () => { if (onTitleHold) holdTimer = window.setTimeout(onTitleHold, 6000) }
    const cancelHold = () => window.clearTimeout(holdTimer)
    return h("div", { class: "fp-top" },
      h("button", { class: "fp-btn fp-back", "data-key": "back", "aria-label": "Volver", onclick: back }, "‹ Volver"),
      h("h2", {
        class: "fp-h2 fp-arcade", style: `color:${color}`,
        ...(onTitleHold ? {
          onpointerdown: startHold, onpointerup: cancelHold, onpointerleave: cancelHold, onpointercancel: cancelHold,
        } : {}),
      }, title),
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
      topBar("PARTIDO", "#22d3ee", () => go("menu"), () => unlockTraining()),
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
        segmented<Settings["music"]>("Música de fondo", "music", [{ value: "on", label: "Prendida" }, { value: "low", label: "Atenuada" }, { value: "off", label: "Apagada" }], s.music, (v) => { s.music = v; persist(); render() }),
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

    const crestHost = h("div", { class: "fp-sw", role: "group", "aria-label": "Escudo del equipo" })
    const refreshCrests = () => {
      crestHost.replaceChildren(...CRESTS.map((c) => h("button", {
        type: "button", class: "fp-crest", "aria-label": `Escudo ${c}`, "aria-pressed": String(c === draft.crest),
        onclick: () => { draft.crest = c; refreshCrests() },
      }, c)))
    }
    refreshCrests()

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
        h("div", {}, h("span", { class: "fp-lab" }, "Escudo"), crestHost),
      ),
      h("section", { class: "fp-panel" },
        segmented<Surface>("Pista de localía", "surf", SURFACES.map((v) => ({ value: v, label: SURFACE_LABEL[v] })), draft.surface, (v) => { draft.surface = v; render() }),
        h("p", { class: "fp-note" }, `${SURFACE_HINT[draft.surface]}. Aplica cuando este equipo juega de local.`),
        segmented<Category>("Categoría", "cat", CATEGORIES.map((v) => ({ value: v, label: CATEGORY_LABEL[v] })), draft.category, (v) => { draft.category = v; render() }),
        h("p", { class: "fp-note" }, "Solo una etiqueta: no cambia nada del motor ni del balance."),
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
    return h("main", { class: "fp-screen fp-scroll", style: "text-align:center;gap:18px" },
      h("h2", { class: "fp-arcade", style: "color:#2dd4bf;margin:0;font-size:clamp(18px,4vw,34px)" }, "CRÉDITOS"),
      h("p", { style: "margin:0;font-size:clamp(14px,2.6vw,20px);line-height:1.8" },
        "Desarrollo original: ", h("b", { style: "color:#facc15" }, "Ignacio"), h("br"),
        "Motor físico y sanciones: ", h("b", { style: "color:#22d3ee" }, "Liga Funko-Patín Team"), h("br"),
        "Herramientas de prueba: ", h("b", { style: "color:#a78bfa" }, "Playwright"), h("br"),
        "Pista: ", h("b", { style: "color:#ea580c" }, "40 × 20 m, reglamentaria")),
      h("p", { style: "margin:0;font-size:clamp(13px,2.4vw,18px);line-height:1.8;color:rgba(255,255,255,.85)" },
        "Marcador oficial: ", h("b", { style: "color:#4ade80" }, "ardisport.cl"), h("br"),
        "Un saludo especial a ", h("b", { style: "color:#f472b6" }, "BYN"), " y a mis ", h("b", { style: "color:#f472b6" }, "4 hijos"), "."),
      h("p", { style: "margin:0;font-size:clamp(12px,2.2vw,16px);line-height:1.7;color:rgba(255,255,255,.7)" },
        "Público de las gradas: grabaciones de estadio de ", h("b", {}, "mykelu"), ", ", h("b", {}, "arunangshubanerjee"), ", ",
        h("b", {}, "u_xg7ssi08yr"), " y ", h("b", {}, "vishiv"), " (Pixabay), editadas para el juego."),
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

  /** Desbloquea entrenamiento (Copa ganada aparte) y avisa — antes se hacía en silencio. */
  function unlockTraining() {
    if (saved.settings.trainingUnlocked) return
    saved.settings.trainingUnlocked = true
    persist()
    render()
    showDialog("¡MODO ENTRENAMIENTO DESBLOQUEADO!", "Ya está disponible desde el menú principal.", [{ label: "Genial", primary: true }])
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
  function teamMatchOptions(localId: string, visitId: string): Pick<MatchOptions, "teams" | "surface" | "nivel" | "duration" | "leftHanded" | "sound" | "music" | "debug"> {
    const s = saved.settings
    const local = teamById(localId)
    const visit = teamById(visitId)
    const [lc, vc] = distinctColors(local.color, visit.color)
    const mk = (t: Team, color: string) => ({ name: t.name, color, crest: t.crest, kinds: t.roster.map((p) => p.kind), names: t.roster.map((p) => p.name) })
    return {
      teams: [mk(local, lc), mk(visit, vc)],
      surface: local.surface,
      nivel: s.nivel,
      duration: opts.durationOverride ?? s.duration,
      leftHanded: s.leftHanded,
      sound: s.sound,
      music: s.music,
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
    demoPlaying = false
    demoFromBoot = false
    trainingPlaying = null
  }

  /** Barra fija de controles (pausa / pantalla completa / sonido / música) sobre el partido en curso. */
  function matchHudBar(wrap: HTMLElement, m: MatchHandle): HTMLElement {
    const viewLabel = (v: string) => (v === "full" ? "TOT" : v === "three-quarter" ? "3/4" : "SEG")
    const viewName = (v: string) => (v === "full" ? "cancha completa" : v === "three-quarter" ? "3/4 de cancha" : "seguir la jugada")
    const MUSIC_ICON: Record<Settings["music"], string> = { on: "🎉", low: "🔉", off: "🔇" }
    const MUSIC_NAME: Record<Settings["music"], string> = { on: "Música: prendida", low: "Música: atenuada", off: "Música: apagada" }
    const MUSIC_NEXT: Record<Settings["music"], Settings["music"]> = { on: "low", low: "off", off: "on" }
    return h("div", { class: "fp-hud" },
      h("button", { class: "fp-btn", "aria-label": "Pausa", "data-key": "pause", onclick: () => showPause(wrap) }, "❚❚"),
      h("button", { class: "fp-btn view", "aria-label": `Vista: ${viewName(m.viewMode)} — tocá para cambiar`, "data-key": "view",
        onclick: (e: Event) => {
          m.cycleView()
          const b = e.currentTarget as HTMLElement
          b.textContent = viewLabel(m.viewMode)
          b.setAttribute("aria-label", `Vista: ${viewName(m.viewMode)} — tocá para cambiar`)
        } }, viewLabel(m.viewMode)),
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
      h("button", { class: "fp-btn", "aria-label": MUSIC_NAME[saved.settings.music], "data-key": "music",
        onclick: (e: Event) => {
          saved.settings.music = MUSIC_NEXT[saved.settings.music]
          m.setMusic(saved.settings.music)
          const b = e.currentTarget as HTMLElement
          b.textContent = MUSIC_ICON[saved.settings.music]
          b.setAttribute("aria-label", MUSIC_NAME[saved.settings.music])
          persist()
        } }, MUSIC_ICON[saved.settings.music]),
    )
  }

  let tutorialShownForCup: string | null = null

  function showTutorial(wrap: HTMLElement) {
    // Se demora un toque a propósito: si pausa en el mismo frame que arranca el partido, el
    // diálogo tapa el saque inicial antes de que se vea un solo instante de juego.
    window.setTimeout(() => {
      if (destroyed || !match || match.ended || dialog) return
      match.pause()
      closeDialog()
      let timer = 0
      const dismiss = (optOut = false) => {
        window.clearTimeout(timer)
        if (optOut) { saved.settings.tutorialOptOut = true; persist() }
        closeDialog()
        match?.resume()
      }
      const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Cómo se juega" },
        h("h2", { class: "fp-arcade" }, "CÓMO SE JUEGA"),
        h("p", { class: "fp-note" }, "Izquierdo (o WASD/flechas): movés al jugador que lleva el puck."),
        h("p", { class: "fp-note" }, "Derecho: deslizá para pasar o tirar — roce suave es pase, latigazo es tiro."),
        h("p", { class: "fp-note" }, "Tocá a un compañero (con cualquier dedo, hasta con el izquierdo) para pasarle. Un toque suelto a la derecha (o Espacio) es pase automático al mejor."),
        h("button", { class: "fp-btn solid", "data-key": "tutorial-ok", onclick: () => dismiss(false) }, "Entendido"),
        h("button", { class: "fp-btn", "data-key": "tutorial-never", onclick: () => dismiss(true) }, "No volver a mostrar"),
      )
      openModal(wrap, h("div", { class: "fp-overlay" }, box))
      timer = window.setTimeout(() => dismiss(false), 20000)
    }, 900)
  }

  function startMatch() {
    stopMatch()
    maybeAutoFullscreen()
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

  /** Modo demo/espectador: IA vs IA, sin jugador humano. Elige dos equipos al azar y, cuando
   *  termina, arranca otro solo — pensado como "attract mode" de arcade. Se sale desde la pausa. */
  let demoPlaying = false
  let demoFromBoot = false
  /** Config del entrenamiento en curso (para "reiniciar" desde la pausa), si hay uno. */
  let trainingPlaying: { goalie: "local" | "visita" | "ninguno"; penalties?: boolean } | null = null
  function startDemo(fromBoot = false) {
    stopMatch()
    demoPlaying = true
    demoFromBoot = fromBoot
    screen = "match"
    const teams = allTeams(saved)
    const a = teams[Math.floor(Math.random() * teams.length)]
    // Antes: se sorteaban los dos por separado y se "corregía" si coincidían — con mala suerte en el
    // segundo sorteo podía volver a tocar el mismo. Ahora `b` sale de la lista SIN `a`: es imposible
    // que salga el mismo equipo dos veces (mientras haya 2 o más equipos).
    const rest = teams.filter((t) => t.id !== a.id)
    const b = rest.length ? rest[Math.floor(Math.random() * rest.length)] : a
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = teamMatchOptions(a.id, b.id)
    const m = mountMatch(wrap, {
      ...mo,
      demo: true,
      onDemoTap: () => { if (demoFromBoot) { stopMatch(); go("menu") } else startMatch() },
      onEnd: () => {
        endTimer = window.setTimeout(() => { if (demoPlaying && !destroyed) startDemo(demoFromBoot) }, 2400)
      },
    })
    match = m
    wrap.append(matchHudBar(wrap, m))
  }

  // ---------- entrenamiento ----------
  const TRAINING_GOALIE_LABEL: Record<"local" | "visita" | "ninguno", string> = {
    local: "Arquero local", visita: "Arquero visita", ninguno: "Sin arquero",
  }
  function trainingScreen(): HTMLElement {
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("ENTRENAMIENTO", "#9ca3af", () => go("menu")),
      h("section", { class: "fp-panel" },
        h("p", { class: "fp-note" }, "Practicá tiros solo, sin rival. Elegí qué arquero tenés en cancha."),
        h("div", { class: "fp-actions" },
          ...(Object.keys(TRAINING_GOALIE_LABEL) as Array<"local" | "visita" | "ninguno">).map((g) =>
            h("button", { class: "fp-btn solid", "data-key": `train-${g}`, onclick: () => startTraining(g) }, TRAINING_GOALIE_LABEL[g])),
        ),
      ),
      h("section", { class: "fp-panel" },
        h("h3", {}, "Penales · súper tiros"),
        h("p", { class: "fp-note" }, "Mano a mano contra el arquero rival, un penal tras otro, siempre con el tanque de energía lleno — para practicar la puntería y el súper tiro sin depender del cansancio."),
        h("div", { class: "fp-actions" },
          h("button", { class: "fp-btn ye", "data-key": "train-penalties", onclick: () => startTraining("visita", true) }, "Practicar penales"),
        ),
      ),
    ))
  }

  function startTraining(goalie: "local" | "visita" | "ninguno", penalties = false) {
    stopMatch()
    maybeAutoFullscreen()
    trainingPlaying = { goalie, penalties }
    screen = "match"
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = matchOptions()
    const m = mountMatch(wrap, {
      ...mo,
      duration: 600,
      training: { goalie, penalties },
      onEnd: () => { stopMatch(); go("training") },
      onAutoPause: () => showPause(wrap),
    })
    match = m
    wrap.append(matchHudBar(wrap, m))
  }

  // ---------- copa ----------
  /** Equipos elegidos en la pantalla de armado de la Copa (no persiste hasta sortear). */
  /** Mi equipo elegido para la próxima Copa (siempre va primero en `teamIds`: así queda "local" en
   *  cada cruce que juegue, sin tener que tocar nada de la lógica del bracket en cup.ts). */
  let myTeamPick: string | null = allTeams(saved)[0]?.id ?? null
  let cupNivel: Nivel = saved.settings.nivel
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

  function startCupMatch(which: MatchSlot, home: string, away: string) {
    stopMatch()
    maybeAutoFullscreen()
    cupPlaying = { which, home, away }
    screen = "match"
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = teamMatchOptions(home, away)
    const m = mountMatch(wrap, {
      ...mo,
      onEnd: (r) => {
        if (r.score[0] === r.score[1]) {
          startShootout(wrap, which, home, away, r.score)
          return
        }
        const pb = wrap.querySelector<HTMLButtonElement>('[data-key="pause"]')
        if (pb) { pb.disabled = true; pb.setAttribute("aria-disabled", "true") }
        endTimer = window.setTimeout(() => showCupEnd(wrap, r), 1600)
      },
      onAutoPause: () => showPause(wrap),
    })
    match = m
    wrap.append(matchHudBar(wrap, m))
    // El tutorial de controles sale AL ARRANCAR LA COPA (primer cruce), una vez por Copa, y se puede
    // apagar para siempre con "No volver a mostrar". El partido suelto y el demo no lo muestran.
    if (saved.cup && shouldShowCupTutorial(saved.settings.tutorialOptOut, saved.cup, tutorialShownForCup)) {
      tutorialShownForCup = saved.cup.id
      showTutorial(wrap)
    }
  }

  /** Empate en la Copa: tanda de penales (3 por lado, mano a mano) en vez de rejugar todo el
   *  partido — es un mini-partido nuevo, aparte, dedicado solo a la tanda. */
  function startShootout(prevWrap: HTMLElement, which: MatchSlot, home: string, away: string, regularScore: [number, number]) {
    stopMatch()
    screen = "match"
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = teamMatchOptions(home, away)
    const m = mountMatch(wrap, {
      ...mo,
      shootout: true,
      onShootoutEnd: (sr) => {
        const finalScore: [number, number] = [regularScore[0] + sr.made[0], regularScore[1] + sr.made[1]]
        const winnerName = teamById(sr.winner === 0 ? home : away).name
        endTimer = window.setTimeout(() => {
          showDialog(
            "¡Definido por penales!",
            `${winnerName} ganó la tanda ${Math.max(...sr.made)}-${Math.min(...sr.made)}.`,
            [{ label: "Seguir", primary: true, onClick: () => showCupEnd(wrap, { score: finalScore, fouls: [0, 0], steals: [0, 0], passes: [0, 0], shots: [0, 0] }) }],
          )
        }, 900)
      },
      onAutoPause: () => showPause(wrap),
    })
    match = m
    cupPlaying = { which, home, away }
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
      champion ? celebrationScene(teamById(champion)) : h("p", { class: "fp-result fp-arcade", style: "color:#facc15" }, "AVANZA"),
      h("div", { class: "fp-score" }, h("span", { style: `color:${lc}` }, String(r.score[0])), h("span", { style: "font-size:.6em;opacity:.7" }, "-"), h("span", { style: `color:${vc}` }, String(r.score[1]))),
      h("p", { style: "margin:0;text-align:center;font-size:14px" }, champion ? `${teamById(champion).name} se queda con la Copa.` : `${winnerT.name} pasa a la siguiente ronda.`),
      h("div", { class: "fp-row" },
        h("button", { class: "fp-btn solid", "data-key": "cup", onclick: () => { stopMatch(); go("cup") } }, champion ? "Ver Copa" : "Siguiente partido"),
        h("button", { class: "fp-btn gr", "data-key": "menu", onclick: () => { stopMatch(); go("menu") } }, "Menú"),
      ),
    )
    openModal(wrap, h("div", { class: "fp-overlay" }, box))
  }

  /** Bracket real (SVG, con líneas) en vez de la lista apilada de antes — mi equipo (`teamIds[0]`)
   *  queda resaltado con un aro en su color en cada casillero donde aparece. */
  function cupBracketSvg(cup: Cup): HTMLElement {
    const W = 360, H = 360
    const boxW = 96, boxH = 30
    const leftX = 4, midX = 132, rightX = 260
    const rowY = [18, 74, 216, 272] // las 4 hojas: 2 arriba (semi1), 2 abajo (semi2)
    const semiY = [46, 244] // los dos casilleros de semifinal, centrados entre su par de hojas
    const finalY = H / 2 - boxH / 2
    const mine = cup.teamIds[0]

    const box = (x: number, y: number, id: string | null, score?: number, faded = false) => {
      const t = id ? teamById(id) : null
      const isMine = !!t && t.id === mine
      const stroke = isMine ? "#facc15" : "rgba(255,255,255,.25)"
      const sw = isMine ? 2.5 : 1
      const label = t ? `${t.crest} ${t.name.slice(0, 3)}` : "?"
      const fill = t ? t.color : "#1f2937"
      return `
        <g opacity="${faded ? 0.45 : 1}">
          <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="7" fill="${fill}22" stroke="${stroke}" stroke-width="${sw}"/>
          <text x="${x + 8}" y="${y + boxH / 2 + 4}" font-size="11" font-weight="700" fill="#fff" style="font-family:inherit">${esc(label)}</text>
          ${score !== undefined ? `<text x="${x + boxW - 8}" y="${y + boxH / 2 + 4}" font-size="12" font-weight="800" fill="#fff" text-anchor="end">${score}</text>` : ""}
        </g>`
    }
    // conector en "codo": de dos hojas hacia un casillero, con una línea vertical que las une
    const elbow = (fromX: number, y1: number, y2: number, toY: number, toX: number) => {
      const midXLine = (fromX + toX) / 2
      return `
        <path d="M ${fromX} ${y1} H ${midXLine} V ${y2} H ${fromX}" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>
        <path d="M ${midXLine} ${(y1 + y2) / 2} H ${toX}" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>`
    }

    const s0 = cup.semis[0], s1 = cup.semis[1]
    const w0 = s0.played && s0.score ? (s0.score[0] > s0.score[1] ? s0.home : s0.away) : null
    const w1 = s1.played && s1.score ? (s1.score[0] > s1.score[1] ? s1.home : s1.away) : null

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
        ${elbow(leftX + boxW, rowY[0] + boxH / 2, rowY[1] + boxH / 2, semiY[0] + boxH / 2, midX)}
        ${elbow(leftX + boxW, rowY[2] + boxH / 2, rowY[3] + boxH / 2, semiY[1] + boxH / 2, midX)}
        ${elbow(midX + boxW, semiY[0] + boxH / 2, semiY[1] + boxH / 2, finalY + boxH / 2, rightX)}
        ${box(leftX, rowY[0], s0.home)}
        ${box(leftX, rowY[1], s0.away)}
        ${box(leftX, rowY[2], s1.home)}
        ${box(leftX, rowY[3], s1.away)}
        ${box(midX, semiY[0], w0 ?? s0.home, s0.played && s0.score ? Math.max(...s0.score) : undefined, !w0)}
        ${box(midX, semiY[1], w1 ?? s1.home, s1.played && s1.score ? Math.max(...s1.score) : undefined, !w1)}
        ${box(rightX, finalY, cup.championId ?? cup.final.home, cup.final.played && cup.final.score ? Math.max(...cup.final.score) : undefined, !cup.championId)}
        ${cup.championId ? `<text x="${rightX + boxW / 2}" y="${finalY - 14}" font-size="22" text-anchor="middle">🏆</text>` : ""}
      </svg>`
    const host = h("div", { style: "display:flex;justify-content:center" })
    host.innerHTML = svg
    return host
  }

  function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
  }

  function cupSetupScreen(): HTMLElement {
    const teams = allTeams(saved)
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("COPA", "#facc15", () => go("menu")),
      h("section", { class: "fp-panel" },
        h("h3", {}, "Elegí tu equipo"),
        h("p", { class: "fp-note" }, "Eliminación directa: dos semifinales y una final. Los otros 3 salen al azar — vos jugás siempre con este."),
        h("div", { class: "fp-grid", role: "radiogroup", "aria-label": "Tu equipo en la copa" },
          ...teams.map((t) => h("button", {
            type: "button", role: "radio", class: "fp-chip", style: `--tc:${t.color}`,
            "aria-checked": String(myTeamPick === t.id),
            "data-key": `mine-${t.id}`,
            onclick: () => { myTeamPick = t.id; render() },
          },
            h("span", { class: "fp-dot", style: `background:${t.color}` }),
            h("span", { class: "fp-meta" }, h("b", {}, t.name)),
          )),
        ),
      ),
      h("section", { class: "fp-panel" },
        segmented<Nivel>("Nivel de los rivales", "cup-nivel", NIVELES, cupNivel, (v) => { cupNivel = v; render() }),
      ),
      h("div", { class: "fp-sticky" },
        h("button", {
          class: "fp-btn solid", "data-key": "start-cup", disabled: !myTeamPick,
          onclick: () => {
            if (!myTeamPick) return
            const rivals = shuffled(teams.filter((t) => t.id !== myTeamPick).map((t) => t.id)).slice(0, 3)
            if (rivals.length < 3) return // no hay suficientes equipos distintos todavía
            // Mi equipo SIEMPRE primero: así queda "local" (yo lo controlo) en cada cruce que
            // juegue, incluida la final — sin tocar nada de cup.ts.
            const ids = [myTeamPick, ...rivals] as [string, string, string, string]
            saved.settings.nivel = cupNivel
            saved.cup = newCup(ids)
            persist()
            render()
          },
        }, myTeamPick ? `Sortear y empezar Copa (jugás con ${teamById(myTeamPick).name})` : "Elegí tu equipo"),
      ),
    ))
  }

  function cupBracketScreen(cup: Cup): HTMLElement {
    const nm = nextMatch(cup)
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("COPA", "#facc15", () => go("menu")),
      h("section", { class: "fp-panel" }, cupBracketSvg(cup)),
      cup.championId ? h("section", { class: "fp-panel", style: "text-align:center" },
        celebrationScene(teamById(cup.championId)),
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
  /** true si corre instalada (ícono en el escritorio/launcher de Android, o "Agregar a inicio" en iOS). */
  function isStandalonePwa(): boolean {
    if (typeof window === "undefined") return false
    const std = (navigator as unknown as { standalone?: boolean }).standalone
    return !!std || !!window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)")?.matches
  }
  /** Instalada como app: pide pantalla completa sola al arrancar un partido (con gesto del botón
   *  que llamó a esto). En el navegador normal se deja el botón ⛶ del HUD, que es explícito. */
  function maybeAutoFullscreen() {
    if (document.fullscreenElement || !canFullscreen() || !isStandalonePwa()) return
    toggleFullscreen()
  }

  /** Se ofrece el botón de instalar salvo que ya esté corriendo instalada (o se acabe de instalar
   *  en esta misma sesión, antes de que el navegador la relance en modo standalone). */
  function canOfferInstall(): boolean { return !installedThisSession && !isStandalonePwa() }

  async function handleInstallClick() {
    if (installPromptEvent) {
      const evt = installPromptEvent
      installPromptEvent = null
      try {
        await evt.prompt()
        const choice = await evt.userChoice
        if (choice.outcome === "accepted") installedThisSession = true
      } catch { /* el usuario cerró el diálogo nativo, o el navegador no lo soportó a último momento */ }
      render()
      return
    }
    // Sin el evento nativo (iOS/Safari, o Chrome que todavía no decidió que es instalable):
    // instrucciones a mano, según lo que se puede inferir del user agent.
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
    const text = isIOS
      ? "Tocá el ícono de compartir (el cuadradito con la flecha hacia arriba) y elegí «Agregar a inicio»."
      : "Abrí el menú del navegador (⋮ o ⋯) y elegí «Instalar app» o «Agregar a la pantalla de inicio»."
    showDialog("Instalar la app", text, [{ label: "Entendido", primary: true }])
  }

  function showPause(wrap: HTMLElement) {
    if (!match || match.ended || dialog) return
    match.pause()
    closeDialog()
    const back = () => { closeDialog(); match?.resume() }
    const cp = cupPlaying
    const isDemo = demoPlaying
    const tp = trainingPlaying
    const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Pausa" },
      h("h2", { class: "fp-arcade" }, isDemo ? "DEMO EN PAUSA" : tp ? "ENTRENAMIENTO EN PAUSA" : "PAUSA"),
      h("button", { class: "fp-btn solid", "data-key": "resume", onclick: back }, "Continuar"),
      isDemo
        ? h("button", { class: "fp-btn cy", "data-key": "restart", onclick: () => startDemo() }, "Otro partido demo")
        : tp
        ? h("button", { class: "fp-btn cy", "data-key": "restart", onclick: () => startTraining(tp.goalie, tp.penalties) }, "Reiniciar entrenamiento")
        : h("button", { class: "fp-btn cy", "data-key": "restart", onclick: () => showDialog("¿Reiniciar el partido?", "Empiezas de nuevo con 0-0.", [
            { label: "Reiniciar", danger: true, onClick: () => (cp ? startCupMatch(cp.which, cp.home, cp.away) : startMatch()) },
            { label: "Cancelar", onClick: () => showPause(wrap) },
          ], wrap) }, "Reiniciar partido"),
      h("button", { class: "fp-btn rd", "data-key": "quit", onclick: () => showDialog(isDemo ? "¿Salir del modo demo?" : tp ? "¿Salir del entrenamiento?" : cp ? "¿Salir a la Copa?" : "¿Salir al menú?", isDemo ? "Se corta el partido demo." : tp ? "Se corta la práctica." : "Se pierde el partido en curso.", [
        { label: "Salir", danger: true, onClick: () => { stopMatch(); go(cp ? "cup" : tp ? "training" : "menu") } },
        { label: "Cancelar", onClick: () => showPause(wrap) },
      ], wrap) }, isDemo || tp ? "Salir al menú" : cp ? "Salir a la Copa" : "Salir al menú"),
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
  // Shift + 0-1-7-8-9 (en la pantalla de selección de equipos) desbloquea el modo entrenamiento
  // sin necesidad de ganar la Copa — es un atajo de prueba, no algo que se explique en pantalla.
  const TRAINING_CODE = "01789"
  let codeBuf = ""
  const onKey = (e: KeyboardEvent) => {
    const digit = digitFromCode(e.code)
    if (screen === "setup" && e.shiftKey && digit !== null) {
      // e.code y no e.key: con Shift, e.key es "!" ")" etc. y el código nunca coincidía
      codeBuf = (codeBuf + digit).slice(-TRAINING_CODE.length)
      if (codeBuf === TRAINING_CODE && !saved.settings.trainingUnlocked) {
        unlockTraining()
      }
      return
    }
    if (e.key !== "Escape") return
    if (screen === "match") {
      const wrap = view.querySelector<HTMLElement>(".fp-match")
      if (!wrap || !match || match.ended) return
      if (dialog && match.paused) { closeDialog(); match.resume() } else showPause(wrap)
    } else if (screen === "setup" || screen === "credits" || screen === "cup" || screen === "training") go("menu")
    else if (screen === "editor") go(editing ? "setup" : "menu")
  }
  document.addEventListener("keydown", onKey)

  // Arranca directo en modo demo (attract mode) en vez del menú — tocar la pantalla durante
  // este demo de arranque va al menú, no a un partido (eso sí pasa si abrís el demo desde el botón).
  startDemo(true)

  return {
    destroy() {
      destroyed = true
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", fitScrollPadding)
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
      stopMatch()
      root.replaceChildren()
      root.classList.remove("fp-root")
    },
    debug: { screen: () => screen, match: () => match, saved: () => saved },
  }
}
