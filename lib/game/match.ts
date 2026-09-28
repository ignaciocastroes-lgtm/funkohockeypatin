import {
  Camera,
  FixedStepper,
  GOALS,
  RINK,
  SKATER,
  STAMINA,
  SUPER_SHOT_COST,
  TeamAI,
  assistAim,
  awardPenalty,
  bestPassTarget,
  createWorld,
  drainEvents,
  findSkater,
  kick,
  passSpeedFor,
  powerFromFlick,
  selectControlled,
  setInput,
  startSuddenDeath,
  stepWorld,
  tackle,
  teammateAtPoint,
} from "../engine"
import type { GameEvent } from "../engine"
import type { ActionEvent } from "./input"
import { applyShootoutAttempt, initialShootout } from "./shootout"
import type { ShootoutResult, ShootoutState } from "./shootout"
export type { ShootoutResult } from "./shootout"
import type { SkaterKind, PuckKind, Side, Surface, World } from "../engine"
import { EDGE_CHIP_R, drawHud, drawScene, teammateEdgeChips } from "./draw"
import type { GoalieSaveFX, Venue } from "./draw"
import { canvasFontFamily, plateSize } from "./cues"
import { Confetti, ReplayBuffer, SuperTrail, drawFlash, replayFrameAt, replayWorld } from "./effects"
import type { Flash, GoalReplay } from "./effects"
import { tr } from "./i18n"
import { BTN_POWER, performButton } from "./actions"
import type { GuestSession, HostSession } from "../net/session"
import { applySnapshot, makeSnapshot } from "../net/snapshot"
import { TouchInput, isShootKey, keyboardVector } from "./input"
import { actionLayout } from "./action-layout"
import { Crowd } from "./crowd"
import { DemoTutor } from "./demo-tutor"
import { DemoDirector } from "./demo-director"
import type { MusicLevel } from "./crowd"
import { Sfx } from "./sfx"

export type Nivel = "facil" | "normal" | "dificil"
export const NIVEL_SKILL: Record<Nivel, number> = { facil: 0.3, normal: 0.6, dificil: 0.9 }

export interface MatchTeam {
  name: string
  color: string
  /** Color del pantalón, si el equipo tiene uno distinto al de la camiseta. */
  pantsColor?: string
  crest: string
  kinds: SkaterKind[]
  names: string[]
}

export interface MatchOptions {
  /** [local (humano), visita (IA)] */
  teams: [MatchTeam, MatchTeam]
  /** Pista: la del equipo local (localía). */
  surface: Surface
  /** Venue especial (Aldo Cantoni) — cosmético, ver `Venue` en draw.ts. Por defecto "generic". */
  venue?: Venue
  /** Peso de la bocha (por defecto "normal") — ver `PUCK_KINDS` en el motor. Pesada = más lenta y
   *  previsible; liviana = más rápida y rebota más. */
  puckKind?: PuckKind
  nivel: Nivel
  /** Fuerza el nivel de la IA en los DOS lados, ignorando `nivel`/el 0.7 fijo de siempre — para
   *  el modo Dios vs Dios (partido nivel maestro, para mirar rebotes y pases de verdad). */
  aiSkill?: [number, number]
  /** Segundos. */
  duration: number
  leftHanded?: boolean
  sound?: boolean
  /** Música de fondo (fiesta de las gradas). Por defecto "on". */
  music?: MusicLevel
  /** Modo ahorro: menos densidad de público y sin las banderitas de la tribuna, para que ande mejor
   *  en celulares de gama baja. Se puede prender/apagar en vivo con `MatchHandle.setGraphicsSaver`. */
  graphicsSaver?: boolean
  debug?: boolean
  /** Semilla de la IA (por defecto aleatoria). */
  seed?: number
  /** Attract mode: la IA controla los DOS lados, no hay jugador humano. El demo tiene que ENSEÑAR
   *  antes de vender (ver `DemoTutor`): antes de narrar sus 4 jugadas no muestra nada más, y recién
   *  ahí un toque o una tecla cortan el demo (`onDemoTap`) — es la señal de "quiero jugar". No usar
   *  esto para un espectador que decidió mirar a propósito (Dios vs Dios): eso es `spectator`. */
  demo?: boolean
  /** Solo en modo demo: se llama la PRIMERA vez que el usuario toca la pantalla o aprieta una
   *  tecla — es la señal de "quiero jugar", para cortar el demo y arrancar un partido de verdad. */
  onDemoTap?: () => void
  /** Espectador: igual que `demo` en que la IA controla los DOS lados (nadie juega), pero para
   *  cuando quien mira lo eligió a propósito (Dios vs Dios) — no es un cartel de arcade tratando
   *  de venderle un partido a quien pasa. Sin `DemoTutor`, sin "TOCÁ PARA JUGAR": un toque en la
   *  cancha pausa como en un partido de verdad (dispara `onAutoPause`, igual que ocultar la
   *  pestaña), no se traga en silencio ni corta a ningún lado. Se sale por el menú de pausa, como
   *  cualquier partido — no por un toque cualquiera. No combinar con `demo`: si ambos vienen en
   *  true, `demo` manda (el attract mode conserva su comportamiento de siempre). */
  spectator?: boolean
  /** Modo entrenamiento: sin equipo rival (la IA no controla nada del lado visita, queda quieto),
   *  arquero configurable por lado, para practicar tiros libremente. `penalties`: en vez de tiros
   *  libres, arma un penal tras otro contra el arquero rival (mano a mano, con el tanque de energía
   *  siempre lleno) — practicar penales y súper tiros sin depender de llegar cansado o de un partido. */
  training?: { goalie: "local" | "visita" | "ninguno"; penalties?: boolean }
  /** Tanda de penales para desempatar la Copa: 3 por lado, alternados (mano a mano, arquero
   *  centrado — el mismo mecanismo que el penal de 3 faltas). Si siguen empatados después de los
   *  3, se sigue una ronda más a la vez hasta que se decida. Reemplaza a la muerte súbita para esto. */
  shootout?: boolean
  /** Se llama una vez cuando termina la tanda de penales (solo con `shootout: true`). */
  onShootoutEnd?: (r: ShootoutResult) => void
  /** 2P online. `host`: este dispositivo SIMULA (equipo local = lado 0) y el invitado juega el lado 1.
   *  `guest`: no simula nada — dibuja lo que manda el host y le devuelve su stick y sus botones. */
  net?: { role: "host"; session: HostSession } | { role: "guest"; session: GuestSession }
  /** Se cortó la conexión con el otro jugador (solo con `net`). */
  onNetClosed?: () => void
  /** Se llama una vez cuando suena el final. */
  onEnd?: (r: MatchResult) => void
  /** La pestaña se ocultó: el partido se pausó solo. */
  onAutoPause?: () => void
}

export interface MatchResult {
  score: [number, number]
  fouls: [number, number]
  steals: [number, number]
  passes: [number, number]
  shots: [number, number]
}

export type ViewMode = "auto" | "full" | "three-quarter"

/** Pone el rótulo de un botón redondo y achica la letra según la palabra más larga (en portugués
 *  "DESARMAR" no entra a 11 px en un círculo de 68 px). */
export function fitLabel(span: HTMLElement, text: string) {
  span.textContent = text
  const longest = Math.max(1, ...text.split("\n").map((line) => line.replace(/[^\p{L}]/gu, "").length))
  span.style.fontSize = longest >= 8 ? "9px" : longest >= 6 ? "10px" : ""
  span.style.letterSpacing = longest >= 6 ? "0" : ""
}

export interface MatchHandle {
  destroy(): void
  pause(): void
  resume(): void
  setSound(on: boolean): void
  /** Prende/atenúa/apaga la música de fondo (sin afectar efectos ni al resto del público). */
  setMusic(level: MusicLevel): void
  /** Desempate de Copa: arranca (o repite) un período de muerte súbita de `seconds` (gol de oro). */
  startSuddenDeath(seconds: number): void
  /** Botón de un toque: pasa a la siguiente vista de cámara (seguir → cancha completa → 3/4 → seguir). */
  cycleView(): void
  /** Botón de un toque: pasa el control al siguiente compañero (la selección automática sigue de
   *  base — esto es para cuando esa elección no es la que se quiere). No hace nada en el demo. */
  cyclePlayer(): void
  /** Diestro/zurdo, en vivo, sin reiniciar el partido (desde la pausa) — solo cambia de qué lado de
   *  la pantalla sale cada rol, los botones están en el DOM, armados una sola vez al montar el partido. */
  setLeftHanded(v: boolean): void
  /** Modo ahorro en vivo (ver `MatchOptions.graphicsSaver`), sin reiniciar el partido. */
  setGraphicsSaver(v: boolean): void
  readonly viewMode: ViewMode
  readonly paused: boolean
  readonly ended: boolean
  readonly world: World
  readonly input: TouchInput
  /** Solo para pruebas automáticas. */
  readonly stats: { frames: number; steps: number; controlledId: string | null }
  /** Cámara actual (solo lectura): sirve para saber dónde cae cada jugador en pantalla en pruebas e2e. */
  readonly camera: Camera
  /** Estado del público (para pruebas e2e): null en el entrenamiento, que no tiene. */
  readonly audio: { status: string; excitement: number; layers: number; master: number } | null
}

// Familia para el canvas. NO puede ser `var(--font-orbitron)` (el canvas la ignora): se resuelve al montar.
let FONT = canvasFontFamily(null)
const sideOf = (id: string): Side => (id[0] === "L" ? 0 : 1)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function mountMatch(container: HTMLElement, o: MatchOptions): MatchHandle {
  FONT = canvasFontFamily(getComputedStyle(container).getPropertyValue("--font-orbitron"))
  const canvas = document.createElement("canvas")
  canvas.setAttribute("role", "img")
  canvas.setAttribute("aria-label", "Cancha de hockey sobre patines")
  canvas.style.cssText = "position:absolute;inset:0;display:block;touch-action:none;width:100%;height:100%"
  container.appendChild(canvas)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D no disponible")

  const colors: [string, string] = [o.teams[0].color, o.teams[1].color]
  const pantsColors: [string | undefined, string | undefined] = [o.teams[0].pantsColor, o.teams[1].pantsColor]
  const names: [string, string] = [o.teams[0].name, o.teams[1].name]
  const crests: [string, string] = [o.teams[0].crest, o.teams[1].crest]
  const world = createWorld({
    surface: o.surface,
    puckKind: o.puckKind,
    duration: o.duration,
    goalies: o.training ? [o.training.goalie === "local", o.training.goalie === "visita"] : undefined,
    kinds: [o.teams[0].kinds, o.teams[1].kinds],
    names: [o.teams[0].names, o.teams[1].names],
  })
  // ---------- 2P online ----------
  const netHost = o.net?.role === "host" ? o.net.session : null
  const netGuest = o.net?.role === "guest" ? o.net.session : null
  /** El lado que juega ESTE dispositivo: el invitado juega la derecha (lado 1). */
  const mySide: Side = netGuest ? 1 : 0
  /** Host: qué patinador maneja el invitado (lo elige el host con la misma regla que al humano local). */
  let guestCtl: string | null = null
  const outEvents: GameEvent[] = []
  let lastSnapAt = 0
  let lastStickAt = 0
  let snapAt = 0
  const SNAP_MS = 50 // el host manda ~20 snapshots por segundo
  const ai = new TeamAI({ skill: o.aiSkill ?? [0.7, NIVEL_SKILL[o.nivel]], seed: o.seed ?? ((Math.random() * 1e9) | 0) })
  const stepper = new FixedStepper()
  const cam = new Camera()
  const input = new TouchInput({ width: 1, height: 1, leftHanded: o.leftHanded })
  const sfx = new Sfx()
  sfx.muted = o.sound === false
  // Público de las gradas (murmullo, ovaciones, reacciones). El entrenamiento es práctica en soledad: sin público.
  // En el demo (IA vs IA) no hay equipo "propio": festeja parejo.
  const crowd = o.training ? null : new Crowd(sfx, (o.demo || o.spectator) ? null : mySide)
  crowd?.setMusic(o.music ?? "on")
  // Solo en modo demo: reconoce en vivo las 4 jugadas que enseñan el juego (toque, golazo,
  // súper tiro, defensa) y recién cuando ya narró las 4 deja pasar el "TOCÁ PARA JUGAR".
  const demoTutor = o.demo ? new DemoTutor() : null
  // Guioniza las 4 lecciones del demo (ver DemoDirector) — nunca en Dios vs Dios (`spectator`),
  // que quiere mostrar a la IA jugando de verdad, no un partido armado.
  const demoDirector = o.demo ? new DemoDirector() : null
  const confetti = new Confetti()
  const replayBuf = new ReplayBuffer(2.4)
  const superTrail = new SuperTrail()
  // Última atajada de cada arquero (por lado), para animar la pierna de despeje en drawScene.
  const saveFX: (GoalieSaveFX | null)[] = [null, null]
  let flash: Flash | null = null
  let viewMode: ViewMode = "auto"
  let goalReplay: GoalReplay | null = null
  const stats = { frames: 0, steps: 0, controlledId: null as string | null }

  // ---------- tanda de penales (desempate de Copa) ----------
  // 3 por lado, alternados; si siguen empatados después de las 3, una ronda más a la vez hasta que
  // se decida. Reusa exactamente el mecanismo del penal de 3 faltas (awardPenalty): mano a mano,
  // arquero centrado, el resto lejos. No es una fase nueva del motor — el reloj se sube para que el
  // "clock<=0 con la pelota pegada al palo termina el partido" no dispare a mitad de la tanda. La
  // lógica de turnos/rondas/decisión es pura (`./shootout`, testeada aparte); acá solo se conecta.
  let shootout: ShootoutState | null = null
  let shootoutAwaitingKickoff = false
  let shootoutDeadline = 0
  if (o.shootout) {
    world.clock = 300 // no cuenta nada real (el reloj no corre en la tanda), solo evita el
    // "clock<=0 con la pelota pegada al palo termina el partido" — 5:00 se lee mejor que 16:39
    shootout = initialShootout()
    shootoutDeadline = performance.now() + 6000
    awardPenalty(world, shootout.turn)
  }
  function resolveShootoutAttempt(scored: boolean) {
    if (!shootout) return
    const { state, result } = applyShootoutAttempt(shootout, scored)
    shootout = result ? null : state
    if (result) o.onShootoutEnd?.(result)
  }

  // ---------- entrenamiento de penales / súper tiros ----------
  // Mismo mecanismo que la tanda de penales (mano a mano, mismo `awardPenalty`), pero sin turnos ni
  // marcador: apenas se resuelve un intento (gol, atajada o el plazo vence sin definición) arma el
  // siguiente solo. Siempre dispara el lado 0 (el humano); el arquero rival es obligatorio para esto.
  let penaltyTrainingAwaitingKickoff = false
  let penaltyTrainingDeadline = 0
  if (o.training?.penalties) {
    penaltyTrainingDeadline = performance.now() + 6000
    awardPenalty(world, 0)
  }
  const result: MatchResult = { score: [0, 0], fouls: [0, 0], steals: [0, 0], passes: [0, 0], shots: [0, 0] }

  let controlledId: string | null = netGuest ? null : selectControlled(world, 0, null)
  let cssW = 1
  let cssH = 1
  let dpr = 1
  let paused = false
  let graphicsSaver = !!o.graphicsSaver
  let ended = false
  let destroyed = false
  let banner: { text: string; until: number } | null = null
  let lastGoalCombo = false
  let firstActionDone = false
  let lastKick: { id: string } | null = null
  const pending: ActionEvent[] = []
  let receiverLock: { id: string; until: number } | null = null
  // 0..1 suavizado: qué tanto el marcador (arriba-izquierda) está corrido a la derecha/atenuado
  // porque la pelota (y el jugador controlado) están tapados por esa esquina. Con inercia (como la
  // cámara) para que sea un deslizamiento, no un salto — ver `scorePanelShift` más abajo.
  let scorePanelShift = 0
  // Mismo criterio, para los botones PASE/TIRO (esquema "botones"): se atenúan (no se mueven —
  // mover un botón de acción debajo del pulgar sería peor) cuando la pelota o el jugador controlado
  // están en esa esquina, para no competir visualmente con la jugada que está pasando ahí mismo.
  let actionButtonsShift = 0

  // Vertical: la cancha (horizontal por naturaleza, 40x20 m) se dibuja rotada 90° para llenar la
  // pantalla del teléfono en mano. `portraitNow()` decide en base al tamaño real del contenedor;
  // el "espacio virtual" (vw,vh) es siempre el de una cancha horizontal — todo el resto del motor
  // de dibujo/HUD/cámara sigue pensando en horizontal, solo se rota el canvas al final.
  const portraitNow = () => cssH > cssW * 1.05

  const resize = () => {
    cssW = Math.max(1, container.clientWidth)
    cssH = Math.max(1, container.clientHeight)
    dpr = Math.min(2.5, window.devicePixelRatio || 1)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    input.resize(portraitNow() ? cssH : cssW, portraitNow() ? cssW : cssH)
  }
  resize()
  window.addEventListener("resize", resize)
  window.visualViewport?.addEventListener("resize", resize)
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(resize); ro.observe(container) }

  // ---------- entrada ----------
  const rectPos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { rx: e.clientX - r.left, ry: e.clientY - r.top }
  }
  // Traduce un punto real de pantalla al espacio virtual horizontal (ver portraitNow arriba).
  const toVirtual = (rx: number, ry: number) => (portraitNow() ? { x: ry, y: cssW - rx } : { x: rx, y: ry })
  const pos = (e: PointerEvent) => { const p = rectPos(e); return toVirtual(p.rx, p.ry) }
  // Inversa de `toVirtual`: un punto del espacio virtual (donde vive la cámara) a pantalla real
  // (donde vive el marcador, que siempre se dibuja derecho). Se usa para saber si la pelota quedó
  // debajo del marcador, sin importar la rotación de portrait.
  const virtualToScreen = (vx: number, vy: number) => (portraitNow() ? { x: cssW - vy, y: vx } : { x: vx, y: vy })

  // NO hay pellizco de dos dedos para el zoom, A PROPÓSITO — hubo uno acá y era un bug grave: el
  // control NECESITA los dos pulgares a la vez (uno en el stick, el otro en los botones), y un
  // pellizco-para-zoom dispara apenas toca el SEGUNDO dedo, sin importar la intención — cancelaba
  // el joystick del primer dedo y jamás llegaba a registrar el botón del segundo. Si algún día se quiere zoom táctil, tiene que convivir con el control de dos dedos
  // (por ejemplo, solo con un tercer dedo), no disparar con cualquier segundo toque. El botón de
  // vista (SEG/TOT/3/4) ya cubre "ver más cancha" sin este riesgo.
  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    sfx.unlock()
    if (o.demo) { o.onDemoTap?.(); return } // "attract mode": cualquier toque corta el demo y arranca a jugar
    if (o.spectator) { if (!paused && !ended) { pause(); o.onAutoPause?.() } return } // espectador: el toque pausa como en un partido real, nunca se traga en silencio
    try { canvas.setPointerCapture(e.pointerId) } catch { /* ok */ }
    if (paused || ended) return
    const p = pos(e)
    input.down(e.pointerId, p.x, p.y, e.timeStamp / 1000)
  }
  const onMove = (e: PointerEvent) => {
    e.preventDefault()
    if (paused || ended) return
    const p = pos(e)
    input.move(e.pointerId, p.x, p.y, e.timeStamp / 1000)
  }
  const onUp = (e: PointerEvent) => {
    e.preventDefault()
    sfx.unlock()
    const p = pos(e)
    const ev = input.up(e.pointerId, p.x, p.y, e.timeStamp / 1000)
    if (ev && !paused && !ended && !o.demo && !o.spectator) pending.push(ev)
  }
  const onCancel = (e: PointerEvent) => {
    input.cancel(e.pointerId)
  }
  const noMenu = (e: Event) => e.preventDefault()
  canvas.addEventListener("pointerdown", onDown, { passive: false })
  canvas.addEventListener("pointermove", onMove, { passive: false })
  canvas.addEventListener("pointerup", onUp, { passive: false })
  canvas.addEventListener("pointercancel", onCancel)
  canvas.addEventListener("contextmenu", noMenu)

  // Tamaño de los botones en el esquema "botones" — declarado afuera del bloque que arma los
  // botones porque el cálculo de si tapan la jugada (más abajo, en el loop de cuadro) también lo
  // necesita. `CHARGE_MS` también sale de acá: los atajos de teclado (J/K/L/I, más abajo) usan el
  // MISMO medidor de potencia que los botones táctiles, no uno propio. `ACTION_BOX` es el lado del
  // cuadrado que contiene el rombo de 4 botones (2 botones + 1 espacio, de punta a punta).
  const ACTION_BTN_SIZE = 68
  const ACTION_GAP = 12
  // Rombo SIN solapar: los centros de botones vecinos quedan a `diag`, que tiene que ser > ACTION_BTN_SIZE.
  // Antes era (74+14)/2*sqrt2 = 62 px < 74 px de diámetro → SÚPER tapaba a FUERTE.
  const AL = actionLayout(ACTION_BTN_SIZE, ACTION_GAP)
  const ACTION_DIAG = Math.ceil(ACTION_BTN_SIZE + ACTION_GAP)
  const ACTION_BOX = AL.box

  // ---------- esquema "botones": 4 botones (pase / pase fuerte / tiro / tiro fuerte) ----------
  // Sin gesto de arrastre ni medidor: apretar dispara al instante con potencia fija (BTN_POWER). Van por la misma cola
  // `pending` que el resto, para quedar sincronizados con el paso fijo de física.
  // Estética "vidrio esmerilado": relleno semitransparente + `backdrop-filter` + un solo resplandor
  // de color, en vez de la pila de sombras 3D de antes — más liviano de pintar (menos capas) y, a
  // la vez, más prolijo: no compite con el arte de la cancha, se ve como parte de la interfaz, no
  // como un mando de plástico pegado encima. Acomodados en rombo (como el de un control de consola
  // — PASE abajo, TIRO a la derecha, FUERTE a la izquierda, TIRO FUERTE arriba) en vez de una fila:
  // una fila de 4 no entra cómoda en el ancho de un celular en vertical, un rombo sí.
  let actionButtons: HTMLElement | null = null
  const leftHandedNow = () => input.leftHanded
  let superFlashBtn: HTMLElement | null = null
  let superReady = false
  // Botones por posición, para cambiarles el rótulo según ataque (con la pelota) o defensa (sin ella).
  let ctxBtns: { pase: HTMLElement; fuerte: HTMLElement; tiro: HTMLElement; top: HTMLElement } | null = null
  let defenseLabels = false
  function flashSuperButton() {
    if (!superFlashBtn) return
    superFlashBtn.style.animation = "none"
    // fuerza un reflow para que el navegador "olvide" la animación anterior y la vuelva a tocar
    // desde cero — si no, dos súper tiros seguidos podían no re-disparar el flash.
    void superFlashBtn.offsetWidth
    superFlashBtn.style.animation = "fp-superflash 550ms ease-out"
    superReady = !superReady // fuerza a re-evaluar la estrella en el próximo cuadro (el súper gastó la mitad del tanque)
    setTimeout(() => { if (superFlashBtn) superFlashBtn.style.animation = "none" }, 560)
  }
  {
    const glassColor = (hex: string, a: number): string => {
      const n = parseInt(hex.slice(1), 16)
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
    }
    const BTN_SIZE = ACTION_BTN_SIZE
    const mkButton = (label: string, action: "pase" | "pase-fuerte" | "tiro" | "tiro-fuerte", color: string) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("aria-label",
        action === "tiro" ? "Tiro"
          : action === "tiro-fuerte" ? "Tiro fuerte (se vuelve súper tiro cuando hay estrella)"
          : action === "pase-fuerte" ? "Pase fuerte — directo al mejor compañero, más rápido y más difícil de cortar"
          : "Pase")
      btn.style.cssText = `position:absolute;overflow:hidden;width:${BTN_SIZE}px;height:${BTN_SIZE}px;border-radius:50%;` +
        `background:${glassColor(color, 0.22)};backdrop-filter:blur(9px) saturate(160%);-webkit-backdrop-filter:blur(9px) saturate(160%);` +
        `border:1.5px solid ${glassColor(color, 0.65)};` +
        `box-shadow:0 0 14px ${glassColor(color, 0.35)}, inset 0 1px 2px rgba(255,255,255,.25), inset 0 -6px 10px rgba(0,0,0,.18);` +
        `color:#f8fafc;text-shadow:0 1px 3px rgba(0,0,0,.6);font-family:inherit;font-weight:800;font-size:11px;line-height:1.1;letter-spacing:.03em;touch-action:none;-webkit-touch-callout:none;` +
        `transition:transform 70ms ease,box-shadow 70ms ease`
      const span = document.createElement("span")
      span.style.cssText = "position:relative;pointer-events:none;white-space:pre-line"
      fitLabel(span, tr(label))
      btn.appendChild(span)
      const idle = () => {
        btn.style.transform = ""
        btn.style.boxShadow = `0 0 14px ${glassColor(color, 0.35)}, inset 0 1px 2px rgba(255,255,255,.25), inset 0 -6px 10px rgba(0,0,0,.18)`
      }
      // Sin medidor: apretar = patear YA (pase/tiro de una). Un solo toque, una sola acción.
      const press = (e: PointerEvent) => {
        e.preventDefault()
        sfx.unlock()
        btn.style.transform = "scale(0.91)"
        btn.style.boxShadow = `0 0 22px ${glassColor(color, 0.6)}, inset 0 1px 2px rgba(255,255,255,.3), inset 0 -6px 10px rgba(0,0,0,.22)`
        if (!paused && !ended && !o.demo && !o.spectator) pending.push({ kind: "button", action, power: BTN_POWER[action] })
      }
      btn.addEventListener("pointerdown", press, { passive: false })
      btn.addEventListener("pointerup", idle)
      btn.addEventListener("pointercancel", idle)
      btn.addEventListener("pointerleave", idle)
      return btn
    }
    // Rombo real (sin solapar): centro del contenedor + 4 puntos a `d` px en cruz.
    const place = (el: HTMLElement, [cx, cy]: [number, number]) => { el.style.left = `${cx - BTN_SIZE / 2}px`; el.style.top = `${cy - BTN_SIZE / 2}px` }
    actionButtons = document.createElement("div")
    actionButtons.style.cssText = `position:absolute;${o.leftHanded ? "left" : "right"}:14px;bottom:14px;width:${ACTION_BOX}px;height:${ACTION_BOX}px;z-index:5;transition:opacity 150ms linear`
    const btnPase = mkButton("PASE", "pase", "#4ade80")
    const btnFuerte = mkButton("PASE\nFUERTE", "pase-fuerte", "#38bdf8")
    const btnTiro = mkButton("TIRO", "tiro", "#facc15")
    const btnSuper = mkButton("TIRO\nFUERTE", "tiro-fuerte", "#f97316")
    place(btnFuerte, AL.centers.left)
    place(btnSuper, AL.centers.top)
    place(btnTiro, AL.centers.right)
    place(btnPase, AL.centers.bottom)
    actionButtons.append(btnFuerte, btnSuper, btnTiro, btnPase)
    superFlashBtn = btnSuper
    ctxBtns = { pase: btnPase, fuerte: btnFuerte, tiro: btnTiro, top: btnSuper }
    container.appendChild(actionButtons)
  }

  // ---------- teclado en escritorio: WASD/flechas mueven, Espacio pasa, Q/J/K/L el resto --------
  // Independiente del mouse: en escritorio ya no hace falta arrastrar para moverse, el
  // mouse queda libre.
  // Q cambia de jugador (como el botón de la pausa). J/K/L son pase corto / tiro / pase largo —
  // MISMA potencia fija que los botones táctiles (apretar = patear ya): no son un gesto aparte, van
  // por la misma cola `pending` que todo lo demás. Un atajo de teclado, no depende de la pantalla.
  const KEY_ACTION: Partial<Record<string, "pase" | "tiro" | "pase-fuerte" | "tiro-fuerte">> = {
    KeyJ: "pase",
    KeyK: "tiro",
    KeyL: "pase-fuerte",
    KeyI: "tiro-fuerte",
  }
  const pressedKeys = new Set<string>()
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
    if (o.demo) { if (!e.repeat) o.onDemoTap?.(); return } // cualquier tecla también cuenta como "quiero jugar"
    if (o.spectator) { if (!e.repeat && !paused && !ended) { pause(); o.onAutoPause?.() } return }
    pressedKeys.add(e.code)
    if (isShootKey(e.code)) {
      e.preventDefault() // que Espacio no scrollee la página
      if (!e.repeat && !paused && !ended && !o.demo && !o.spectator) pending.push({ kind: "tap" })
      return
    }
    if (e.code === "KeyQ") {
      e.preventDefault()
      if (!e.repeat && !paused && !ended) cyclePlayer()
      return
    }
    const act = KEY_ACTION[e.code]
    if (act) {
      e.preventDefault()
      // Sin medidor: al apretar sale YA (pase/tiro de una). `repeat` se ignora para que dejar la
      // tecla apretada no dispare una ráfaga ni acumule fuerza.
      if (!e.repeat && !paused && !ended) pending.push({ kind: "button", action: act, power: BTN_POWER[act] })
    }
  }
  const onKeyUp = (e: KeyboardEvent) => { pressedKeys.delete(e.code) }
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)

  const onVisibility = () => {
    if (o.net) return // 2P: el otro juega en vivo, no se puede congelar la cancha
    if (document.hidden && !paused && !ended) { pause(); o.onAutoPause?.() }
  }
  document.addEventListener("visibilitychange", onVisibility)

  function releaseFingers() {
    // suelta cualquier dedo apoyado para que al reanudar no quede el joystick "pegado"
    for (const id of [1, 2, 3, 4, 5]) input.cancel(id)
    input.moveX = 0
    input.moveY = 0
    pending.length = 0
    pressedKeys.clear()
  }

  function pause() {
    if (paused || ended) return
    if (o.net) { releaseFingers(); return } // 2P: el menú de pausa se muestra encima, la cancha sigue en vivo
    paused = true
    releaseFingers()
  }
  function resume() {
    if (!paused) return
    paused = false
    stepper.reset()
    last = 0
    sfx.unlock()
  }

  /** Compañero al que apunta un toque en pantalla: primero las flechas de borde, después los jugadores en cancha. */
  function tappedTeammate(carrierId: string, sx: number, sy: number): string | null {
    for (const c of teammateEdgeChips(world, cam, 0, controlledId, 1)) {
      if (Math.hypot(c.x - sx, c.y - sy) <= EDGE_CHIP_R + 14) return c.id
    }
    const wp = cam.toWorld(sx, sy)
    // zona tocable: al menos ~40 px de radio, aunque el jugador se vea chico (vista completa)
    return teammateAtPoint(world, carrierId, wp.x, wp.y, Math.max(1.0, 40 / cam.ppm))
  }

  /** Convierte un gesto en patada. Solo el portador del equipo humano puede patear. */
  function applyAction(ev: ActionEvent) {
    if (ev.kind === "button") {
      const res = performButton(world, 0, controlledId, ev.action, ev.power, padAngle())
      if (res.lockReceiverId) lockReceiver(res.lockReceiverId)
      if (res.switchTo && !o.demo && !o.spectator) controlledId = res.switchTo
      if (res.superShot) flashSuperButton()
      return
    }
    const cid = world.puck.carrierId
    const s = cid ? findSkater(world, cid) : undefined
    if (!s || s.side !== 0) return
    {
      // Pase de un dedo: si el toque cae sobre un compañero (o su flecha de borde), va a ese; si no,
      // el toque suelto del dedo de acción sigue siendo pase automático al mejor. El toque del dedo de
      // movimiento (`strict`) que no cae sobre nadie no hace nada: no regala la pelota por accidente.
      let tid: string | null = ev.x !== undefined && ev.y !== undefined ? tappedTeammate(s.id, ev.x, ev.y) : null
      if (!tid) {
        if (ev.strict) return
        tid = bestPassTarget(world, s.id)
      }
      const t = tid ? findSkater(world, tid) : undefined
      if (!t) return
      // Apunta DIRECTO al elegido, adelantándose a donde va: la ayuda de puntería (`assistAim`) puede
      // cambiar el receptor por otro compañero dentro de su cono, y si tocaste a alguien es a él.
      const d0 = Math.hypot(t.x - s.x, t.y - s.y)
      const flight = Math.min(0.8, d0 / 10)
      const tx = t.x + t.vx * flight
      const ty = t.y + t.vy * flight
      const speed = passSpeedFor(Math.hypot(tx - s.x, ty - s.y))
      if (kick(world, s.id, Math.atan2(ty - s.y, tx - s.x), speed)) lockReceiver(t.id)
    }
  }

  /**
   * Tras un pase el control salta al receptor y SE QUEDA ahí mientras la pelota vuela: sin esto,
   * `selectControlled` lo reasigna al compañero más cercano a donde estará la pelota, que en un pase
   * largo suele ser otro. Se suelta cuando alguien agarra la pelota, a los 2.2 s, o si se corta el juego.
   */
  function lockReceiver(id: string) {
    receiverLock = { id, until: world.time + 2.2 }
    controlledId = id
  }

  /** Cambio manual de jugador: pasa al siguiente compañero en cancha (orden estable por id), sin
   *  tocar la selección automática de base — `selectControlled` sigue corriendo cada cuadro, esto
   *  solo le da un punto de partida distinto (la propia histéresis de 1m lo mantiene mientras la
   *  pelota no esté bastante más cerca de otro). No reusa `receiverLock` a propósito: ese se suelta
   *  apenas alguien agarra la pelota (pensado para un pase en el aire), y esto tiene que aguantar
   *  todo el juego abierto, no solo mientras la pelota vuela. */
  /** Dirección del pad (stick táctil o WASD/flechas) en el espacio del mundo, o null si está suelto.
   *  El pad ES la dirección del tiro (y apunta el pase): sin tocarlo, se usa hacia dónde mira el jugador. */
  function padAngle(): number | null {
    const kb = keyboardVector(pressedKeys)
    const useKb = kb.x !== 0 || kb.y !== 0
    const x = useKb ? kb.x : input.moveX
    const y = useKb ? kb.y : input.moveY
    return Math.hypot(x, y) >= 0.25 ? Math.atan2(y, x) : null
  }

  function cyclePlayer() {
    if (o.demo || o.spectator || netGuest) return
    const onIce = world.skaters.filter((s) => s.side === 0).sort((a, b) => a.id.localeCompare(b.id))
    if (onIce.length === 0) return
    const idx = onIce.findIndex((s) => s.id === controlledId)
    controlledId = onIce[(idx + 1) % onIce.length].id
  }

  function countEvent(ev: ReturnType<typeof drainEvents>[number]) {
    if (ev.type === "kick") {
      const s = findSkater(world, ev.id)
      if (s) {
        if (s.side === 0) firstActionDone = true
        const g = GOALS[s.side === 0 ? 1 : 0]
        const u = s.side === 0 ? 1 : -1
        const toGoal = Math.atan2(g.cy - s.y, g.lineX - s.x)
        const dir = Math.atan2(world.puck.vy, world.puck.vx)
        let diff = Math.abs(dir - toGoal)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        if (ev.speed >= 16 && (g.lineX - s.x) * u > 0 && Math.abs(g.lineX - s.x) < 18 && diff < 0.5) result.shots[s.side]++
      }
      lastKick = { id: ev.id }
    } else if (ev.type === "pickup") {
      if (lastKick && lastKick.id !== ev.id && sideOf(lastKick.id) === sideOf(ev.id)) result.passes[sideOf(ev.id)]++
      lastKick = null
    } else if (ev.type === "steal") {
      result.steals[sideOf(ev.id)]++
      lastKick = null
    }
  }

  // ---------- bucle ----------
  let raf = 0
  let last = 0
  let fpsSmooth = 60
  // Red de contención para vista fija (completa / 3-4): si los cuadros por segundo caen y se quedan
  // abajo, se activa solo el modo ahorro de tribuna (sin tocar el ajuste del jugador). Vuelve a
  // apagarse al cambiar de vista. Es lo único que se puede hacer sin medir la GPU real del aparato.
  let autoSaver = false
  let lowFpsFrames = 0
  let stepsThisFrame = 0

  /** Reacciona a UN evento del motor (sonido, cartel, festejo...). Lo usan el host (eventos propios) y el invitado (los que le llegan). */
  function handleEvent(ev: GameEvent, now: number) {
    countEvent(ev)
    sfx.play(ev)
    crowd?.onEvent(ev, world, cam.cx, cam.width)
    demoTutor?.onEvent(ev, now)
    if (ev.type === "foul") {
      banner = { text: `¡FALTA! Tarjeta azul ${names[ev.side]} #${ev.id.slice(1)}`, until: now + 1900 }
      flash = { color: "#3b82f6", startedAt: now, durationMs: 260 }
      navigator.vibrate?.(60)
    } else if (ev.type === "combo") {
      banner = { text: `${names[ev.side]} — combo ${ev.kind === "attack" ? "de ataque" : "defensivo"} armado`, until: now + 1400 }
      navigator.vibrate?.(30)
    } else if (ev.type === "goalieClear") {
      saveFX[ev.side] = { startedAt: now, ny: ev.ny }
    } else if (ev.type === "save") {
      // Solo dibujo: la pierna de despeje del arquero se anima leyendo esto en drawScene
      // (ver GOALIE_KICK_MS) — no hay nada nuevo que simular, ya pasó.
      saveFX[ev.side] = { startedAt: now, ny: ev.ny }
    } else if (ev.type === "sub") {
      // Antes esto era solo un cartelito de texto (1.4s, fácil de perderse con la jugada
      // en marcha) y encima no decía QUIÉN salía. El pedido es que el cambio automático
      // por cansancio se VEA: ahora banda más larga con entra/sale, un chispazo del color
      // del equipo en el punto exacto de la pista donde entró el fresco, y vibración corta
      // — el mismo lenguaje visual que ya usa un gol, pero más chico.
      banner = { text: `Cambio ${names[ev.side]}: sale #${ev.outId.slice(1)} · entra #${ev.inId.slice(1)}`, until: now + 2200 }
      const fresh = world.skaters.find((sk) => sk.id === ev.inId)
      if (fresh) {
        const scr = cam.toScreen(fresh.x, fresh.y)
        confetti.spawn(scr.x, scr.y, [colors[ev.side], "#ffffff"], 26)
      }
      navigator.vibrate?.(40)
    } else if (ev.type === "penalty") {
      banner = { text: `¡PENAL para ${names[ev.side]}!`, until: now + 2200 }
      flash = { color: "#facc15", startedAt: now, durationMs: 260 }
      navigator.vibrate?.([40, 60, 40])
    } else if (ev.type === "goal") {
      navigator.vibrate?.(120)
      flash = { color: colors[ev.side], startedAt: now, durationMs: 220 }
      lastGoalCombo = !!ev.combo
      const conceded = GOALS[ev.side === 0 ? 1 : 0]
      const scr = cam.toScreen(conceded.lineX, conceded.cy)
      confetti.spawn(scr.x, scr.y, [colors[ev.side], "#ffd23f", "#ffffff"], 110)
      goalReplay = { frames: replayBuf.freeze(), scorerSide: ev.side, startedAt: now, speed: 0.55 }
      if (shootout && ev.side === shootout.turn) {
        shootoutAwaitingKickoff = true
        resolveShootoutAttempt(true)
      }
      if (o.training?.penalties && ev.side === 0) penaltyTrainingAwaitingKickoff = true
    } else if (ev.type === "end" && !ended) {
      ended = true
      releaseFingers()
      result.score = [world.score[0], world.score[1]]
      result.fouls = [world.fouls[0], world.fouls[1]]
      // Festejo de partido ganado: un estallido de confeti más grande, desde el medio de la
      // pantalla — aparte del que ya tira cada gol individual.
      if (!o.demo && !o.spectator && !o.training && world.score[mySide] > world.score[mySide === 0 ? 1 : 0]) {
        confetti.spawn(cssW / 2, cssH * 0.35, [colors[0], "#ffd23f", "#ffffff", "#4ade80"], 220)
      }
      o.onEnd?.({ ...result })
    }
  }

  if (netGuest) {
    const take = (sn: NonNullable<typeof netGuest.latest>) => { if (applySnapshot(world, sn)) snapAt = performance.now() }
    netGuest.onSnapshot = take
    if (netGuest.latest) take(netGuest.latest)
    netGuest.onClosed = () => { if (!ended && !destroyed) o.onNetClosed?.() }
  }
  // 2P: que la pantalla no se apague sola (si el host la bloquea, el navegador congela el juego para los dos).
  let wakeLock: { release(): Promise<void> } | null = null
  const grabWakeLock = () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock
      wl?.request("screen").then((l) => { if (destroyed) l.release().catch(() => {}); else wakeLock = l }).catch(() => {})
    } catch { /* sin wakeLock: se juega igual */ }
  }
  const onVisibleAgain = () => { if (!document.hidden && o.net) grabWakeLock() } // el navegador lo suelta al ocultar la pestaña
  if (o.net) { grabWakeLock(); document.addEventListener("visibilitychange", onVisibleAgain) }
  if (netHost) {
    netHost.onClosed = () => { if (!ended && !destroyed) banner = { text: "El rival se fue: sigue la IA", until: performance.now() + 3000 } }
  }

  const frame = (now: number) => {
    if (destroyed) return
    raf = requestAnimationFrame(frame)
    if (!last) last = now
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    stats.frames++
    if (dt > 0) fpsSmooth += (1 / dt - fpsSmooth) * 0.05
    if (viewMode !== "auto" && !paused && !autoSaver) {
      lowFpsFrames = fpsSmooth < 42 ? lowFpsFrames + 1 : 0
      if (lowFpsFrames > 90) autoSaver = true // ~1.5 s seguidos por debajo de 42 fps
    }

    const portrait = portraitNow()
    const vw = portrait ? cssH : cssW
    const vh = portrait ? cssW : cssH
    stepsThisFrame = 0
    let alpha = 1
    if (netGuest) {
      // INVITADO: no simula. Recibe fotos del host (ver onSnapshot), reacciona a sus eventos y le devuelve
      // el stick y los botones. `alpha` interpola entre la foto anterior y la última.
      for (const ev of netGuest.takeEvents()) handleEvent(ev, now)
      while (pending.length) { const a = pending.shift() as ActionEvent; if (a.kind === "button") netGuest.sendButton(a.action) }
      if (now - lastStickAt >= 33) {
        lastStickAt = now
        const kb = keyboardVector(pressedKeys)
        const useKb = kb.x !== 0 || kb.y !== 0
        netGuest.sendStick(useKb ? kb.x : input.moveX, useKb ? kb.y : input.moveY)
      }
      alpha = snapAt ? Math.min(1, (now - snapAt) / SNAP_MS) : 1
      controlledId = netGuest.latest ? netGuest.latest.ctl[1] : null
    } else if (!paused) {
      alpha = stepper.advance(dt, (fixed) => {
        if (receiverLock && (world.puck.carrierId !== null || world.time > receiverLock.until || world.phase !== "play" || !findSkater(world, receiverLock.id))) receiverLock = null
        controlledId = (o.demo || o.spectator) ? null : receiverLock ? receiverLock.id : selectControlled(world, 0, controlledId)
        const twoHumans = !!netHost && netHost.guestJoined
        guestCtl = twoHumans ? selectControlled(world, 1, guestCtl) : null
        if (o.training) ai.update(world, controlledId, fixed, [0]) // en entrenamiento, solo los compañeros (lado 0) se mueven solos — no hay rival de verdad
        else if (twoHumans) { ai.update(world, controlledId, fixed, [0]); ai.update(world, guestCtl, fixed, [1]) } // 2P: la IA solo mueve a los compañeros de cada humano
        else ai.update(world, controlledId, fixed)
        if (controlledId) {
          const kb = keyboardVector(pressedKeys)
          const useKb = kb.x !== 0 || kb.y !== 0
          setInput(world, controlledId, useKb ? kb.x : input.moveX, useKb ? kb.y : input.moveY)
        }
        if (twoHumans && netHost) {
          const gs = netHost.guestStick
          if (guestCtl) setInput(world, guestCtl, gs.x, gs.y)
          const gpad = Math.hypot(gs.x, gs.y) >= 0.25 ? Math.atan2(gs.y, gs.x) : null
          for (const a of netHost.takeButtons()) {
            const res = performButton(world, 1, guestCtl, a, BTN_POWER[a], gpad)
            if (res.switchTo) guestCtl = res.switchTo
          }
        }
        while (pending.length) applyAction(pending.shift() as ActionEvent)
        if (demoDirector && demoTutor && !demoTutor.done) demoDirector.step(world, (stage) => demoTutor.has(stage), now)
        stepWorld(world, fixed)
        stepsThisFrame++
        stats.steps++
        if (world.puck.superShot && !world.puck.carrierId) superTrail.mark(world.puck.x, world.puck.y, now)
        if (world.phase === "play" || world.phase === "timeOn") replayBuf.push(world)
        if (world.events.length) {
          for (const ev of drainEvents(world)) {
            handleEvent(ev, now)
            if (netHost) outEvents.push(ev)
          }
        }
      })
    }
    stats.controlledId = controlledId
    if (netHost && netHost.guestJoined) {
      // Snapshot primero (así el marcador del invitado ya es el nuevo cuando le llega el evento del gol/fin).
      if (outEvents.length || now - lastSnapAt >= SNAP_MS) {
        lastSnapAt = now
        netHost.sendSnapshot(makeSnapshot(world, netHost.nextSeq(), [controlledId, guestCtl]))
      }
      if (outEvents.length) netHost.sendEvents(outEvents.splice(0))
    } else outEvents.length = 0

    // Si nadie convirtió antes del plazo, es fallo: se corta directo al siguiente (sin la pausa de
    // festejo, que es solo para goles). Si SÍ convirtió, se espera a que la pausa normal termine y
    // el motor haga su propio saque — recién ahí se pisa esa formación con el próximo penal.
    if (shootout) {
      if (world.clock < 30) world.clock = 300 // piso de seguridad: nunca deja que llegue a 0
      if (!shootoutAwaitingKickoff && now >= shootoutDeadline) {
        resolveShootoutAttempt(false)
        if (shootout) {
          awardPenalty(world, shootout.turn)
          shootoutDeadline = now + 6000
        }
      } else if (shootoutAwaitingKickoff && world.phase === "play") {
        shootoutAwaitingKickoff = false
        awardPenalty(world, shootout.turn)
        shootoutDeadline = now + 6000
      }
    }
    if (o.training?.penalties) {
      if (!penaltyTrainingAwaitingKickoff && now >= penaltyTrainingDeadline) {
        awardPenalty(world, 0)
        penaltyTrainingDeadline = now + 6000
      } else if (penaltyTrainingAwaitingKickoff && world.phase === "play") {
        penaltyTrainingAwaitingKickoff = false
        awardPenalty(world, 0)
        penaltyTrainingDeadline = now + 6000
      }
    }
    if (crowd) { crowd.setPaused(paused); crowd.update(world, dt) }

    if (viewMode === "auto") {
      cam.update(dt, world, controlledId, vw, vh)
    } else {
      const aspect = vw / vh
      const margin = 2.2
      const fullW = Math.max(RINK.length + margin * 2, (RINK.width + margin * 2) * aspect)
      cam.frame(vw, vh, viewMode === "full" ? fullW : fullW * 0.62, RINK.length / 2, RINK.width / 2)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Gol: mientras dura la pausa de festejo, se reproduce en cámara lenta lo que pasó
    // justo antes (en vez de la escena congelada). Si ya salimos de esa fase, se corta.
    let sceneWorld: World = world
    let sceneAlpha = alpha
    if (goalReplay && world.phase === "goal") {
      const rf = replayFrameAt(goalReplay, now)
      if (rf) { sceneWorld = replayWorld(world, rf.prev, rf.curr); sceneAlpha = rf.alpha }
    } else if (goalReplay) {
      goalReplay = null
    }
    const opts = {
      controlledId, humanSide: ((o.demo || o.spectator) ? null : mySide) as Side | null, colors, pantsColors, names, crests, alpha: sceneAlpha, fontFamily: FONT, crowdExcitement: crowd?.info.excitement, graphicsSaver: graphicsSaver || autoSaver,
      superTrail: superTrail.live(now), goalieSave: saveFX, venue: o.venue,
    }

    // Cancha, joystick y línea de apuntado: viven en el espacio "virtual" horizontal y se rotan 90°
    // en vertical (junto con el toque, que se traduce al mismo espacio — ver toVirtual arriba).
    ctx.save()
    if (portrait) { ctx.translate(cssW, 0); ctx.rotate(Math.PI / 2) }
    drawScene(ctx, sceneWorld, cam, opts)
    confetti.update(dt)
    confetti.draw(ctx, vw, vh)
    drawTouchOverlay(ctx, world, cam, input, controlledId, padAngle(), mySide)
    ctx.restore()

    // Marcador, banners y texto: SIEMPRE derechos, nunca rotados — un cartel de puntaje girado 90°
    // no se lee. Se dibujan aparte, ya sin la rotación, usando el tamaño real de la pantalla.
    if (flash) {
      drawFlash(ctx, flash, now, cssW, cssH)
      if (now - flash.startedAt > flash.durationMs) flash = null
    }
    // ¿La pelota (o el jugador que controlo) quedó bajo el marcador? Si sí, lo corremos a la
    // derecha y lo atenuamos (con inercia, para que sea un deslizamiento suave). `plateSize` es la
    // misma función que usa `drawHud` para el tamaño de la placa, así el rectángulo coincide.
    {
      const { boxW, boxH } = plateSize(cssW, cssH)
      const plateR = boxW + 26 // margen: que empiece a correrse un poco antes de que la tape del todo
      const plateB = boxH + 34
      const underPlate = (vx: number, vy: number) => {
        const p = virtualToScreen(vx, vy)
        return p.x <= plateR && p.y <= plateB
      }
      const puckScreen = cam.toScreen(lerp(world.puck.px, world.puck.x, alpha), lerp(world.puck.py, world.puck.y, alpha))
      const ctrl = controlledId ? world.skaters.find((sk) => sk.id === controlledId) : undefined
      const ctrlScreen = ctrl ? cam.toScreen(lerp(ctrl.px, ctrl.x, alpha), lerp(ctrl.py, ctrl.y, alpha)) : null
      const target = underPlate(puckScreen.x, puckScreen.y) || (ctrlScreen && underPlate(ctrlScreen.x, ctrlScreen.y)) ? 1 : 0
      const k = 1 - Math.exp(-6 * dt)
      scorePanelShift += (target - scorePanelShift) * k

      if (superFlashBtn && ctxBtns) {
        const carrier = world.puck.carrierId ? world.skaters.find((sk) => sk.id === world.puck.carrierId) : undefined
        const defending = !(carrier && carrier.side === mySide)
        const setLbl = (b: HTMLElement, t: string) => { const l = b.querySelector("span"); if (l) fitLabel(l as HTMLElement, tr(t)) }
        if (defending !== defenseLabels) {
          defenseLabels = defending
          superReady = false // se re-evalúa la estrella en el próximo cuadro
          if (defending) {
            setLbl(ctxBtns.pase, "QUITAR")
            setLbl(ctxBtns.fuerte, "QUITAR\nFUERTE")
            setLbl(ctxBtns.tiro, "◀\nCAMBIO")
            setLbl(ctxBtns.top, "CAMBIO\n▶")
            superFlashBtn.style.borderColor = ""
            superFlashBtn.style.animation = "none"
          } else {
            setLbl(ctxBtns.pase, "PASE")
            setLbl(ctxBtns.fuerte, "PASE\nFUERTE")
            setLbl(ctxBtns.tiro, "TIRO")
            setLbl(ctxBtns.top, "TIRO\nFUERTE")
          }
        }
        if (!defending && controlledId) {
          const cs = world.skaters.find((sk) => sk.id === controlledId)
          const star = !!cs && cs.stamina >= SUPER_SHOT_COST
          if (star !== superReady) {
            superReady = star
            superFlashBtn.style.borderColor = star ? "rgba(253,224,71,.95)" : ""
            superFlashBtn.style.animation = star ? "fp-superstar 900ms ease-in-out infinite" : "none"
            setLbl(superFlashBtn, star ? "★ SÚPER\nTIRO" : "TIRO\nFUERTE")
          }
        }
      }
      if (actionButtons) {
        // Zona real (pantalla, sin rotar) que ocupa el rombo de botones: ver el
        // `right:14px;bottom:14px` con el que se arma más abajo (`ACTION_BOX` = lado del cuadrado).
        const btnL = leftHandedNow() ? 14 : cssW - 14 - ACTION_BOX
        const btnT = cssH - 14 - ACTION_BOX
        const underButtons = (vx: number, vy: number) => {
          const p = virtualToScreen(vx, vy)
          return p.x >= btnL - 20 && p.x <= btnL + ACTION_BOX + 20 && p.y >= btnT - 20
        }
        const bTarget = underButtons(puckScreen.x, puckScreen.y) || (ctrlScreen && underButtons(ctrlScreen.x, ctrlScreen.y)) ? 1 : 0
        actionButtonsShift += (bTarget - actionButtonsShift) * k
        actionButtons.style.opacity = String(1 - 0.62 * actionButtonsShift)
      }
    }
    demoTutor?.tick(now)
    drawHud(ctx, world, {
      ...opts, alpha, comboGoal: lastGoalCombo, showHint: !firstActionDone && !o.demo && !o.spectator, demo: o.demo,
      demoCaption: demoTutor?.caption ?? null, demoReady: demoTutor ? demoTutor.done : true,
      scorePanelShift,
    }, cssW, cssH)
    if (banner && now < banner.until) drawBanner(ctx, banner.text, cssW, cssH)
    if (o.debug) drawDebug(ctx, fpsSmooth, stepsThisFrame, world)
  }
  raf = requestAnimationFrame(frame)

  return {
    get world() { return world },
    get paused() { return paused },
    get ended() { return ended },
    input,
    stats,
    get camera() { return cam },
    get audio() { return crowd ? crowd.info : null },
    pause,
    resume,
    setSound(on: boolean) { sfx.muted = !on },
    setMusic(level: MusicLevel) { crowd?.setMusic(level) },
    startSuddenDeath(seconds: number) {
      ended = false
      paused = false
      startSuddenDeath(world, seconds)
      stepper.reset()
      last = 0
      banner = { text: "¡Muerte súbita! Gol de oro", until: performance.now() + 2600 }
      sfx.unlock()
    },
    cycleView() {
      viewMode = viewMode === "auto" ? "full" : viewMode === "full" ? "three-quarter" : "auto"
      if (viewMode === "auto") cam.reset()
      autoSaver = false; lowFpsFrames = 0; fpsSmooth = 60
    },
    cyclePlayer,
    setLeftHanded(v: boolean) {
      input.leftHanded = v
      if (actionButtons) { actionButtons.style.left = v ? "14px" : ""; actionButtons.style.right = v ? "" : "14px" }
    },
    setGraphicsSaver(v: boolean) { graphicsSaver = v },
    get viewMode() { return viewMode },
    destroy() {
      destroyed = true
      netHost?.close()
      netGuest?.close()
      document.removeEventListener("visibilitychange", onVisibleAgain)
      wakeLock?.release().catch(() => {})
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.visualViewport?.removeEventListener("resize", resize)
      ro?.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onCancel)
      canvas.removeEventListener("contextmenu", noMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      crowd?.stop()
      sfx.close()
      canvas.remove()
      actionButtons?.remove()
    },
  }
}

// ---------- superposiciones de pantalla ----------
function drawTouchOverlay(ctx: CanvasRenderingContext2D, w: World, cam: Camera, input: TouchInput, controlledId: string | null, aimAngle: number | null, mySide: Side) {
  ctx.save()
  const st = input.stick
  if (st) {
    ctx.lineWidth = 3
    ctx.strokeStyle = "rgba(255,255,255,0.35)"
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    ctx.beginPath(); ctx.arc(st.ox, st.oy, st.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    const kx = st.ox + Math.max(-1, Math.min(1, (st.cx - st.ox) / st.radius)) * st.radius
    const ky = st.oy + Math.max(-1, Math.min(1, (st.cy - st.oy) / st.radius)) * st.radius
    ctx.fillStyle = "rgba(255,255,255,0.55)"
    ctx.beginPath(); ctx.arc(kx, ky, st.radius * 0.36, 0, Math.PI * 2); ctx.fill()
  } else {
    // Sin dedo abajo, el joystick "flotante" no tiene nada que dibujar — la pantalla se veía sin
    // ningún pad hasta tocarla. Este círculo fantasma, siempre visible, marca dónde vive el pad de
    // movimiento aunque no lo estés tocando; apenas apoyás el dedo, el de arriba (`st`) toma la posta.
    const r = input.radius
    const ax = input.leftHanded ? cam.vw - r * 1.6 : r * 1.6
    const ay = cam.vh - r * 1.8
    ctx.lineWidth = 2.5
    ctx.strokeStyle = "rgba(255,255,255,0.16)"
    ctx.fillStyle = "rgba(255,255,255,0.045)"
    ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = "rgba(255,255,255,0.22)"
    ctx.beginPath(); ctx.arc(ax, ay, r * 0.36, 0, Math.PI * 2); ctx.fill()
  }
  // El pad ES la dirección del tiro: con la pelota y el pad apretado, una guía punteada sale del
  // portador hacia donde va a ir (verde = compañero, amarillo = arco, blanco = espacio).
  const carrier = w.puck.carrierId ? findSkater(w, w.puck.carrierId) : undefined
  if (aimAngle !== null && carrier && carrier.side === mySide && controlledId === carrier.id) {
    const from = cam.toScreen(carrier.x, carrier.y)
    const r = assistAim(w, carrier.id, aimAngle, 14)
    const len = 9 * cam.ppm
    ctx.strokeStyle = r.target === "teammate" ? "#4ade80" : r.target === "goal" ? "#fde047" : "rgba(255,255,255,0.85)"
    ctx.lineWidth = 4
    ctx.lineCap = "round"
    ctx.setLineDash([2, 10])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(from.x + Math.cos(r.angle) * len, from.y + Math.sin(r.angle) * len)
    ctx.stroke()
  }
  ctx.restore()
}

function drawBanner(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  ctx.save()
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  let fs = Math.max(14, Math.min(26, H * 0.055))
  text = tr(text)
  ctx.font = `700 ${fs}px ${FONT}`
  // En un celular vertical el texto (nombres largos, portugués) no entra: se achica la letra en vez de cortarlo.
  const natural = ctx.measureText(text).width + fs * 1.6
  if (natural > W - 12) { fs = Math.max(9, fs * ((W - 12) / natural)); ctx.font = `700 ${fs}px ${FONT}` }
  const tw = ctx.measureText(text).width + fs * 1.6
  const bx = W / 2 - tw / 2
  const by = H * 0.22
  ctx.fillStyle = "rgba(0,0,0,0.7)"
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(bx, by, tw, fs * 2, fs); else ctx.rect(bx, by, tw, fs * 2)
  ctx.fill()
  ctx.fillStyle = "#93c5fd"
  ctx.fillText(text, W / 2, by + fs)
  ctx.restore()
}

function drawDebug(ctx: CanvasRenderingContext2D, fps: number, steps: number, w: World) {
  ctx.save()
  ctx.font = "12px ui-monospace, monospace"
  ctx.textAlign = "left"
  ctx.fillStyle = "rgba(0,0,0,0.6)"
  ctx.fillRect(6, 6, 200, 50)
  ctx.fillStyle = "#a7f3d0"
  ctx.fillText(`pantalla ${fps.toFixed(0)} Hz · ${steps} pasos/frame`, 12, 24)
  ctx.fillText(`sim 120 Hz · t=${w.time.toFixed(1)}s · puck ${Math.hypot(w.puck.vx, w.puck.vy).toFixed(1)} m/s`, 12, 42)
  ctx.restore()
}
