# Club chileno real en el juego — estado y pedido de permiso

**Club elegido: Club de Hockey de Huachipato** (zona Concepción/Talcahuano, Chile).
Dato verificado el 28-sep-2026 en el sitio de la Liga Sur de Hockey Patín (hockeyligasur.cl,
sección «Clubes y Equipos»): fundado en 1963, pilar del hockey patín del sur de Chile, referentes
en la selección chilena, compite en la Liga Sur.

Alternativas reales que aparecen en la misma fuente: Everton de Viña del Mar (tradición hockey
desde 1942, renació en 2020), Rangers de Talca, Colegio Concepción de Linares, Nuevo Pacífico.
Ojo con Everton: comparte nombre con un club de fútbol muy conocido.

## Qué hay hoy en el juego (`CLUB_TEAMS` en `lib/app/teams.ts`)
- Solo el **nombre** «HUACHIPATO». Sin escudo oficial (emoji del set), colores provisorios
  (azul/negro, a confirmar) y **plantilla 100 % inventada** (apodos sueltos, ningún jugador real).
- `real.permiso = "pendiente"`. Cuando el club conteste que sí, pasar a `"ok"` y (con su OK)
  reemplazar colores/escudo por los oficiales.
- Si contestan que no: borrar la entrada de `CLUB_TEAMS`; un test avisa si falta el club chileno.

## Mensaje para pedir el favor (borrador, para mandar por el canal del club)
> Hola, somos un equipo chico que hizo un juego arcade gratuito de hockey sobre patines. Nos
> gustaría incluir al Club de Hockey de Huachipato como equipo jugable, solo con el nombre y sin
> jugadores reales (plantilla inventada). Si tienen escudo y colores oficiales que prefieran que
> usemos, nos los pueden mandar; y si prefieren que no aparezcan, lo sacamos sin problema. Gracias
> por el hockey patín del sur.

## Contexto para la fecha
Chile figura en el grupo del Mundial femenino de Asunción 2026, pero quedó afuera del Sub-19 por
problemas presupuestarios (según la prensa de Argentina Amateur Deporte, 28-jul-2026).
