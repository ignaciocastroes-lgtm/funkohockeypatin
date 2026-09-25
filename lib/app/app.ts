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
import type { SkaterKind, PuckKind, Surface } from "../engine"

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

/** Tres bochas de distinto peso (ver `PUCK_KINDS` en el motor): además de variedad en partido
 *  normal, es el mismo eje que usa el entrenamiento para la progresión Básico/Medio/Experto. */
const PUCK_KIND_OPTIONS: Array<{ value: PuckKind; label: string }> = [
  { value: "pesada", label: "Pesada" },
  { value: "normal", label: "Normal" },
  { value: "liviana", label: "Liviana" },
]
const PUCK_KIND_HINT: Record<PuckKind, string> = {
  pesada: "Más lenta y previsible: frena rápido y casi no rebota. Buena para arrancar.",
  normal: "El equilibrio de siempre — sin cambios.",
  liviana: "Más rápida y rebota más: exige más precisión y reflejos.",
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** El ícono real de la PWA (`public/icon.svg`), sin el fondo cuadrado — el círculo de `.fp-bolt` ya
 *  pone su propio fondo. Es el mismo arco+red+rayo que ve cualquiera que instale la app. */
/** La insignia real del juego (arte de Ignacio) — 160x160, comprimida e incrustada en base64
 *  para que funcione igual en el build de Next como en el juego.html de un solo archivo. */
const GAME_ICON = "data:image/jpeg;base64,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"

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
    return h("main", { class: "fp-screen fp-menu" },
      ...corners(),
      logoBrand(),
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
        segmented<"honda" | "botones">("Control", "control-scheme", [
          { value: "honda", label: "Honda (estirar y soltar)" },
          { value: "botones", label: "Botones (stick + pase/tiro)" },
        ], s.controlScheme, (v) => { s.controlScheme = v; persist(); render() }),
        segmented<string>("Sonido", "snd", [{ value: "on", label: "Con sonido" }, { value: "off", label: "Silencio" }], s.sound ? "on" : "off", (v) => { s.sound = v === "on"; persist(); render() }),
        segmented<Settings["music"]>("Música de fondo", "music", [{ value: "on", label: "Prendida" }, { value: "low", label: "Atenuada" }, { value: "off", label: "Apagada" }], s.music, (v) => { s.music = v; persist(); render() }),
        segmented<PuckKind>("Bocha", "puck-kind", PUCK_KIND_OPTIONS, s.puckKind, (v) => { s.puckKind = v; persist(); render() }),
        h("p", { class: "fp-note" }, PUCK_KIND_HINT[s.puckKind]),
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
    showDialog("¡MODO ENTRENAMIENTO DESBLOQUEADO!", "Entrenamiento y práctica de penales, ya están en el menú principal.", [{ label: "Genial", primary: true }])
  }

  // ---------- atajo secreto por toques en el logo (como el modo desarrollador de Android) ----------
  // Reemplaza al de mantener apretado: ese dependía de un gesto sostenido de varios segundos, con
  // demasiados puntos donde el sistema podía interferir (ver la nota vieja en el README). Tocar
  // rápido varias veces es un gesto mucho más chico y mucho más difícil de que el sistema confunda.
  const LOGO_TAPS_NEEDED = 7
  const LOGO_TAP_WINDOW = 1500
  let logoTaps = 0
  let logoLastTapAt = 0
  let logoHintTimer = 0

  function logoBrand(): HTMLElement {
    const bolt = h("div", { class: "fp-bolt" })
    bolt.appendChild(h("img", { src: GAME_ICON, alt: "", "aria-hidden": "true", draggable: "false" }))
    const hint = h("div", { class: "fp-tap-hint" })
    if (!saved.settings.trainingUnlocked) {
      bolt.addEventListener("click", () => {
        const now = performance.now()
        if (now - logoLastTapAt > LOGO_TAP_WINDOW) logoTaps = 0
        logoLastTapAt = now
        logoTaps++
        if (logoTaps >= LOGO_TAPS_NEEDED) {
          logoTaps = 0
          hint.textContent = ""
          unlockTraining()
          return
        }
        const left = LOGO_TAPS_NEEDED - logoTaps
        if (logoTaps >= 3) hint.textContent = left === 1 ? "¡un toque más!" : `${left} toques más...`
        window.clearTimeout(logoHintTimer)
        logoHintTimer = window.setTimeout(() => { hint.textContent = ""; logoTaps = 0 }, LOGO_TAP_WINDOW)
      })
    }
    return h("div", { class: "fp-brand" },
      bolt,
      h("h1", { class: "fp-h1 fp-arcade" }, "Liga Funko-Patín"),
      h("div", { class: "fp-sub fp-arcade" }, h("i"), "ARCADE", h("i")),
      hint,
    )
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
  function teamMatchOptions(localId: string, visitId: string): Pick<MatchOptions, "teams" | "surface" | "puckKind" | "nivel" | "duration" | "leftHanded" | "controlScheme" | "sound" | "music" | "graphicsSaver" | "debug"> {
    const s = saved.settings
    const local = teamById(localId)
    const visit = teamById(visitId)
    const [lc, vc] = distinctColors(local.color, visit.color)
    const mk = (t: Team, color: string) => ({ name: t.name, color, pantsColor: t.pantsColor, crest: t.crest, kinds: t.roster.map((p) => p.kind), names: t.roster.map((p) => p.name) })
    return {
      teams: [mk(local, lc), mk(visit, vc)],
      surface: local.surface,
      puckKind: s.puckKind,
      nivel: s.nivel,
      duration: opts.durationOverride ?? s.duration,
      leftHanded: s.leftHanded,
      controlScheme: s.controlScheme,
      sound: s.sound,
      music: s.music,
      graphicsSaver: s.graphicsSaver,
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
      h("button", { class: "fp-btn", "aria-label": "Cambiar de jugador", "data-key": "cycle-player", onclick: () => m.cyclePlayer() }, "🔄"),
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
  let trainingPlaying: { goalie: "local" | "visita" | "ninguno"; penalties?: boolean; puckKind?: PuckKind } | null = null
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
  /** Tres niveles para aprender de a poco: cada uno combina arquero + peso de bocha (mismo eje que
   *  usa el partido normal) en una progresión con sentido, no perillas sueltas. */
  const TRAINING_LEVELS: Array<{
    value: "basico" | "medio" | "experto"
    label: string
    goalie: "local" | "visita" | "ninguno"
    puckKind: PuckKind
    hint: string
  }> = [
    { value: "basico", label: "Básico", goalie: "ninguno", puckKind: "pesada", hint: "Sin arquero y bocha pesada (lenta, casi no rebota): para agarrarle la mano al patinaje y al control." },
    { value: "medio", label: "Medio", goalie: "visita", puckKind: "normal", hint: "Con arquero y bocha normal: a definir de verdad frente al arco." },
    { value: "experto", label: "Experto", goalie: "visita", puckKind: "liviana", hint: "Con arquero y bocha liviana (rápida, rebota más): exige reflejos y precisión." },
  ]
  let trainingLevel: "basico" | "medio" | "experto" = "basico"
  let trainingSurface: Surface = teamById(saved.settings.localId).surface

  function trainingScreen(): HTMLElement {
    const lvl = TRAINING_LEVELS.find((l) => l.value === trainingLevel) ?? TRAINING_LEVELS[0]
    return h("main", { class: "fp-screen fp-scroll" }, h("div", { class: "fp-col" },
      topBar("ENTRENAMIENTO", "#9ca3af", () => go("menu")),
      h("section", { class: "fp-panel" },
        segmented<Surface>("Pista", "train-surf", SURFACES.map((v) => ({ value: v, label: SURFACE_LABEL[v] })), trainingSurface, (v) => { trainingSurface = v; render() }),
      ),
      h("section", { class: "fp-panel" },
        h("p", { class: "fp-note" }, "Practicá tiros solo, sin rival. Elegí el nivel: cada uno suma arquero y una bocha distinta."),
        segmented<"basico" | "medio" | "experto">("Nivel", "train-level", TRAINING_LEVELS.map((l) => ({ value: l.value, label: l.label })), trainingLevel, (v) => { trainingLevel = v; render() }),
        h("p", { class: "fp-note" }, lvl.hint),
        h("div", { class: "fp-actions" },
          h("button", { class: "fp-btn solid", "data-key": "train-start", onclick: () => startTraining(lvl.goalie, false, lvl.puckKind) }, `Entrenar — ${lvl.label}`),
        ),
      ),
      h("section", { class: "fp-panel" },
        h("h3", {}, "Penales · súper tiros"),
        h("p", { class: "fp-note" }, "Mano a mano contra el arquero rival, un penal tras otro, siempre con el tanque de energía lleno — para practicar la puntería y el súper tiro sin depender del cansancio."),
        h("div", { class: "fp-actions" },
          h("button", { class: "fp-btn ye", "data-key": "train-penalties", onclick: () => startTraining("visita", true, "normal") }, "Practicar penales"),
        ),
      ),
    ))
  }

  function startTraining(goalie: "local" | "visita" | "ninguno", penalties = false, puckKind: PuckKind = "normal") {
    stopMatch()
    maybeAutoFullscreen()
    trainingPlaying = { goalie, penalties, puckKind }
    screen = "match"
    const wrap = h("div", { class: "fp-match" })
    view.replaceChildren(wrap)
    const mo = matchOptions()
    const m = mountMatch(wrap, {
      ...mo,
      surface: trainingSurface,
      puckKind,
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

  /** Ajustes de control desde la pausa: diestro/zurdo se aplica EN VIVO (no hace falta reiniciar).
   *  Honda/botones sí reinicia — el esquema de botones tiene sus propios botones armados en el DOM
   *  solo al montar el partido, no hay forma de aparecerlos/sacarlos sin volver a montar. */
  function showControlSettings(wrap: HTMLElement) {
    if (!match) return
    const s = saved.settings
    const cp = cupPlaying
    const isDemo = demoPlaying
    const tp = trainingPlaying
    const restartWithNewScheme = () => {
      if (isDemo) startDemo()
      else if (tp) startTraining(tp.goalie, tp.penalties, tp.puckKind)
      else if (cp) startCupMatch(cp.which, cp.home, cp.away)
      else startMatch()
    }
    const box = h("div", { class: "fp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Ajustes de control" },
      h("h2", { class: "fp-arcade" }, "CONTROL"),
      segmented<string>("Dedos", "hand-pause", [{ value: "r", label: "Diestro (mover a la izquierda)" }, { value: "l", label: "Zurdo (mover a la derecha)" }], s.leftHanded ? "l" : "r", (v) => {
        s.leftHanded = v === "l"
        persist()
        match?.setLeftHanded(s.leftHanded)
      }),
      segmented<"honda" | "botones">("Esquema", "scheme-pause", [
        { value: "honda", label: "Honda (estirar y soltar)" },
        { value: "botones", label: "Botones (stick + pase/tiro)" },
      ], s.controlScheme, (v) => {
        if (v === s.controlScheme) return
        showDialog("¿Cambiar de esquema de control?", "Esto reinicia el partido — no hay forma de cambiar los botones en pantalla sin volver a armar la cancha.", [
          { label: "Cambiar y reiniciar", danger: true, onClick: () => { s.controlScheme = v; persist(); restartWithNewScheme() } },
          { label: "Cancelar", onClick: () => showControlSettings(wrap) },
        ], wrap)
      }),
      segmented<string>("Rendimiento", "perf-pause", [{ value: "alta", label: "Alta calidad" }, { value: "ahorro", label: "Ahorro (celulares lentos)" }], s.graphicsSaver ? "ahorro" : "alta", (v) => {
        s.graphicsSaver = v === "ahorro"
        persist()
        match?.setGraphicsSaver(s.graphicsSaver)
      }),
      h("button", { class: "fp-btn solid", "data-key": "back-pause", onclick: () => showPause(wrap) }, "‹ Volver a pausa"),
    )
    openModal(wrap, h("div", { class: "fp-overlay" }, box))
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
      isDemo ? null : h("button", { class: "fp-btn", "data-key": "control-settings", onclick: () => showControlSettings(wrap) }, "⚙️ Ajustes de control"),
      isDemo
        ? h("button", { class: "fp-btn cy", "data-key": "restart", onclick: () => startDemo() }, "Otro partido demo")
        : tp
        ? h("button", { class: "fp-btn cy", "data-key": "restart", onclick: () => startTraining(tp.goalie, tp.penalties, tp.puckKind) }, "Reiniciar entrenamiento")
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
