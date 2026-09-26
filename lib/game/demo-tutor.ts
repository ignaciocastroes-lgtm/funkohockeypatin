import type { GameEvent } from "../engine/types"

export type DemoStage = "pass" | "golazo" | "super" | "defense"

const STAGE_ORDER: DemoStage[] = ["pass", "golazo", "super", "defense"]

const STAGE_LABEL: Record<DemoStage, string> = {
  pass: "TOQUE · el control salta",
  golazo: "TOQUE · TOQUE · TOQUE · GOLAZO",
  super: "SÚPER TIRO",
  defense: "TOQUE · TOQUE · TOQUE · ARQUERO",
}

export interface DemoCaption { stage: DemoStage; text: string; until: number }

/**
 * El demo (attract mode, IA vs IA) tiene que ENSEÑAR antes de vender: un toque y el usuario caía
 * al menú sin haber visto honda, combo ni súper tiro. Esta clase mira, en vivo, la misma cadena
 * de eventos que ya emite el motor (pickup/kick/combo/goal/save) y reconoce las 4 jugadas que
 * enseñan el juego, en el orden que las enseña:
 *
 *   1) Pase de un toque   — pickup y kick del mismo jugador casi en el mismo instante.
 *   2) Toque·toque·toque·GOLAZO — la cadena de ataque llega a 3 y el gol siguiente es "combo".
 *   3) Súper tiro         — un kick marcado `superShot`.
 *   4) Defensa            — la cadena de despejes llega a 3 y la atajada siguiente es "combo"
 *                            (la atajada garantizada, la "de transmisión").
 *
 * No pausa nada ni reordena el partido: solo dispara un sello de una línea, como el GOL/GOLAZO
 * de la placa, la PRIMERA vez que ve cada una. `done` se pone en true recién cuando ya narró las
 * 4 — es la señal de que el "TOCÁ PARA JUGAR" ya puede aparecer.
 */
export class DemoTutor {
  private seen = new Set<DemoStage>()
  private pickupAtMs = new Map<string, number>()
  private attackComboArmed = false
  private defComboArmed = false
  caption: DemoCaption | null = null

  get done(): boolean {
    return STAGE_ORDER.every((s) => this.seen.has(s))
  }

  private fire(stage: DemoStage, nowMs: number) {
    if (this.seen.has(stage)) return
    this.seen.add(stage)
    this.caption = { stage, text: STAGE_LABEL[stage], until: nowMs + 2200 }
  }

  /** Llamar por cada evento que emite el motor durante el paso fijo, con el reloj del frame (ms). */
  onEvent(ev: GameEvent, nowMs: number) {
    switch (ev.type) {
      case "pickup":
        this.pickupAtMs.set(ev.id, nowMs)
        break
      case "kick": {
        if (ev.superShot) { this.fire("super", nowMs); break }
        const picked = this.pickupAtMs.get(ev.id)
        if (picked !== undefined && nowMs - picked < 350) this.fire("pass", nowMs)
        this.pickupAtMs.delete(ev.id)
        break
      }
      case "combo":
        if (ev.kind === "attack") this.attackComboArmed = true
        else this.defComboArmed = true
        break
      case "goal":
        if (ev.combo && this.attackComboArmed) this.fire("golazo", nowMs)
        this.attackComboArmed = false
        break
      case "save":
        if (ev.combo && this.defComboArmed) this.fire("defense", nowMs)
        this.defComboArmed = false
        break
      case "kickoff":
        this.attackComboArmed = false
        this.defComboArmed = false
        break
      default:
        break
    }
  }

  /** Llamar una vez por frame (no por evento) para apagar el sello vencido. */
  tick(nowMs: number) {
    if (this.caption && nowMs > this.caption.until) this.caption = null
  }
}
