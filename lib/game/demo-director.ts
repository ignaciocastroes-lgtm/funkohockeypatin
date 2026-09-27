import { GOALS, RINK, STAMINA, kick } from "../engine"
import type { Side, Skater, World } from "../engine"
import type { DemoStage } from "./demo-tutor"

/**
 * Guioniza el attract mode: en vez de esperar a que la IA arme por las suyas una de las 4 jugadas
 * que enseña el demo (pase de un toque, golazo de combo, súper tiro, atajada de combo — ver
 * `DemoTutor`), las empuja a propósito apenas hay ocasión. No toca física ni reglas nuevas: todo lo
 * que hace ya es API pública del motor — arma `attackCombo`/`defCombo` (campos del `World`, los
 * mismos que arma el juego real cuando alguien encadena 3 toques) o dispara un `kick()` apenas
 * alguien tiene la pelota, en vez de dejar que la IA decida cuándo. Deja de intervenir en una
 * lección en cuanto `DemoTutor` ya la narró — de ahí en más el partido sigue solo, sin trucos.
 *
 * Solo para el attract mode (`MatchOptions.demo`): un espectador que eligió mirar a propósito
 * (Dios vs Dios, `MatchOptions.spectator`) quiere ver a la IA jugar de verdad, no un partido armado.
 */
export class DemoDirector {
  /** Última vez (ms) que se forzó cada jugada — para no perseguirla en cada cuadro sin parar si
   *  la IA todavía no volvió a quedar en una posición creíble para intentarla de nuevo. */
  private lastNudgeAt: Partial<Record<DemoStage, number>> = {}
  private readonly cooldownMs = 2200

  private cool(stage: DemoStage, nowMs: number): boolean {
    const last = this.lastNudgeAt[stage]
    if (last !== undefined && nowMs - last < this.cooldownMs) return false
    this.lastNudgeAt[stage] = nowMs
    return true
  }

  /** Llamar una vez por paso fijo, ANTES de `stepWorld` (para que lo que arma/dispara acá ya lo
   *  simule el paso que sigue). `has` es `DemoTutor.has`: qué lecciones ya narró. */
  step(w: World, has: (stage: DemoStage) => boolean, nowMs: number) {
    if (w.phase !== "play" && w.phase !== "timeOn") return
    const carrier = w.puck.carrierId ? w.skaters.find((s) => s.id === w.puck.carrierId) : undefined

    if (!has("pass")) this.forcePass(w, carrier, nowMs)
    if (!has("golazo")) { this.armAttackCombo(w, carrier); this.forceGolazo(w, carrier, nowMs) }
    if (!has("super")) this.forceSuperShot(w, carrier, nowMs)
    if (!has("defense")) this.forceDefenseSave(w, carrier, nowMs)
  }

  /** Pase de un toque: apenas alguien tiene la pelota, se la da de una al compañero libre más
   *  cercano — como el "pickup + kick en <350ms" que ya reconoce `DemoTutor`, pero sin esperar a
   *  que la IA decida hacerlo por su cuenta. Pase suave (no un tiro): nunca pasa por súper tiro. */
  private forcePass(w: World, carrier: Skater | undefined, nowMs: number) {
    if (!carrier) return
    const mate = w.skaters
      .filter((s) => s.side === carrier.side && s.id !== carrier.id)
      .sort((a, b) => Math.hypot(a.x - carrier.x, a.y - carrier.y) - Math.hypot(b.x - carrier.x, b.y - carrier.y))[0]
    if (!mate) return
    // El chequeo del enfriamiento va AL FINAL a propósito: si no hay con quién (no debería pasar,
    // pero por las dudas) no hay que "gastar" la ventana de 2.2s sin haber pateado nada.
    if (!this.cool("pass", nowMs)) return
    kick(w, carrier.id, Math.atan2(mate.y - carrier.y, mate.x - carrier.x), 9)
  }

  /** Golazo de combo: arma directamente los "3 toques" del equipo que tiene la pelota (el mismo
   *  campo que ya usa el motor cuando los arma de verdad) — el próximo tiro con algo de fuerza de
   *  ESE equipo entra solo, sin arquero (ver `kick()`/`comboGoal` en world.ts). Sintetiza también el
   *  evento "combo" para que el cartelito de "combo armado" salga igual que en un partido real. */
  private armAttackCombo(w: World, carrier: Skater | undefined) {
    if (!carrier) return
    if (w.attackCombo?.side === carrier.side && w.attackCombo.touches >= 3) return
    w.attackCombo = { side: carrier.side, touches: 3 }
    w.events.push({ type: "combo", side: carrier.side, touches: 3, kind: "attack" })
  }

  /** Respaldo del golazo: si a los 12 segundos sigue sin salir solo (puede pasar — un tiro fuerte
   *  ajeno, como el de `forceSuperShot`, puede desarmar el combo antes de que alguien llegue a
   *  patear con él armado, o la pelota puede quedar rebotando fuerte un rato largo entre atajadas),
   *  no sigue esperando: para un atacante justo frente al arco rival, con la pelota ya "pegada al
   *  palo" (posesión directa, sin animación de recogida) y la patea — un golazo de manual, no de
   *  jugada larga, pero un golazo al fin. Mismo criterio que `forceDefenseSave`: una sola jugada
   *  deliberada de emergencia, no algo que compita en cada cuadro con las demás lecciones. */
  private forceGolazo(w: World, carrier: Skater | undefined, nowMs: number) {
    if (nowMs < 12000 || !this.cool("golazo", nowMs)) return
    const attacker = carrier ?? w.skaters[0]
    if (!attacker) return
    const oppGoal = GOALS[attacker.side === 0 ? 1 : 0]
    attacker.x = oppGoal.lineX - oppGoal.dir * 6
    attacker.y = oppGoal.cy
    attacker.vx = 0; attacker.vy = 0
    const px = attacker.x + oppGoal.dir * 0.3
    w.puck.x = px; w.puck.y = attacker.y
    w.puck.px = px; w.puck.py = attacker.y
    w.puck.vx = 0; w.puck.vy = 0
    w.puck.spin = 0
    w.puck.carrierId = attacker.id
    w.attackCombo = { side: attacker.side, touches: 3 }
    w.events.push({ type: "combo", side: attacker.side, touches: 3, kind: "attack" })
    kick(w, attacker.id, Math.atan2(oppGoal.cy - attacker.y, oppGoal.lineX - attacker.x), STAMINA.superShotMinSpeed * 0.75)
  }

  /** Súper tiro: si el que tiene la pelota ya cruzó a campo rival, le llena el tanque (para que le
   *  alcance para pagarlo) y le dispara un tiro de verdad al arco. Desarma primero el `attackCombo`
   *  propio y el `defCombo` rival: cualquiera de los dos, si sigue armado de una jugada anterior
   *  (`attackCombo` llega solo a 3 con el juego normal, no hace falta que lo arme `armAttackCombo`),
   *  se comería este tiro — como golazo de combo (si es el propio) o devuelto de un rebote a toda
   *  velocidad por el arquero rival premiado con su propio súper tiro (ver `world.ts`) — en vez de
   *  dejarlo salir como lo que tiene que ser: un súper tiro derecho viejo. */
  private forceSuperShot(w: World, carrier: Skater | undefined, nowMs: number) {
    if (!carrier) return
    const attackingHalf = carrier.side === 0 ? carrier.x > RINK.length / 2 : carrier.x < RINK.length / 2
    if (!attackingHalf) return
    // Mismo criterio que en `forcePass`: recién se "gasta" el enfriamiento cuando de verdad se va
    // a patear — si todavía no cruzó la mitad de cancha, tiene que poder reintentarlo apenas cruce,
    // no quedar esperando otros 2.2s porque el chequeo de posición cayó justo en la ventana.
    if (!this.cool("super", nowMs)) return
    const goal = GOALS[carrier.side === 0 ? 1 : 0]
    const oppSide: Side = carrier.side === 0 ? 1 : 0
    if (w.attackCombo?.side === carrier.side) w.attackCombo = null
    if (w.defCombo?.side === oppSide) w.defCombo = null
    carrier.stamina = STAMINA.max // que nunca le falte tanque para pagar el súper tiro
    kick(w, carrier.id, Math.atan2(goal.cy - carrier.y, goal.lineX - carrier.x), STAMINA.superShotMinSpeed + 3)
  }

  /** Atajada de combo: a los 6 segundos de no haber salido sola (una defensa que sabe cubrir la
   *  línea de tiro, la misma que audita `ai.ts`, suele interceptar con un patinador de campo antes
   *  de que el tiro llegue siquiera cerca del arco), pone la pelota a un paso del arquero,
   *  moviéndose hacia él: el instante justo antes de una atajada de verdad, no un tiro desde la
   *  mitad de cancha que cualquier defensor todavía podría cruzar a tapar. No arma `defCombo` antes
   *  de eso (a diferencia de `armAttackCombo`): dejarlo armado de fondo todo ese rato podría
   *  interceptar sin querer el tiro forzado de `forceSuperShot` y devolvérselo al arquero de
   *  origen — mejor una sola jugada deliberada que una de fondo que puede chocar con las demás. */
  private forceDefenseSave(w: World, carrier: Skater | undefined, nowMs: number) {
    if (nowMs < 6000 || !this.cool("defense", nowMs)) return
    const side: Side = carrier ? (carrier.side === 0 ? 1 : 0) : nowMs % 4400 < 2200 ? 0 : 1
    const goalie = w.goalies.find((g) => g.side === side)
    if (!goalie) return
    w.defCombo = { side, touches: 3 }
    w.events.push({ type: "combo", side, touches: 3, kind: "defense" })
    const geom = GOALS[side]
    const min = goalie.radius + w.puck.radius
    // Un punto a un paso del arquero, del lado de la cancha (no adentro del arco), moviéndose hacia él.
    const fromX = goalie.x - geom.dir * (min + 0.35)
    const speed = 13
    w.puck.carrierId = null
    w.puck.x = fromX; w.puck.y = goalie.y
    w.puck.px = fromX; w.puck.py = goalie.y
    w.puck.vx = geom.dir * speed
    w.puck.vy = 0
    w.puck.spin = 0
    w.puck.comboShot = false
    w.puck.superShot = false
  }
}
