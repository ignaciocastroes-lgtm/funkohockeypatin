import type { Cup } from "./cup"

/**
 * ¿Toca mostrar el tutorial de controles? Solo al ARRANCAR una Copa: en el primer cruce, mientras no se
 * haya jugado ninguno, y una sola vez por Copa (si reiniciás el mismo cruce no vuelve a aparecer).
 * "No volver a mostrar" (`optOut`) lo apaga para siempre. El partido suelto no lo muestra: ahí alcanza
 * con el cartel chico de abajo, que se va solo con la primera acción.
 */
export function shouldShowCupTutorial(optOut: boolean, cup: Cup, shownForCupId: string | null): boolean {
  if (optOut) return false
  if (shownForCupId === cup.id) return false
  return !cup.semis[0].played && !cup.semis[1].played && !cup.final.played
}
