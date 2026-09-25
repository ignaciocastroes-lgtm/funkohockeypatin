# Liga Funko-Patín Arcade

Hockey sobre patines (rink hockey) arcade, en una pista reglamentaria de **40 × 20 m**, pensado para
jugarse en el teléfono en horizontal con **dos dedos**. Incluye partido suelto y un modo **Copa** de
eliminación directa a 4 equipos.

## Ronda 39 — auditoría de UI/rendimiento + bocha, entrenamiento y arquero

Punto de partida: auditoría pedida sobre el tamaño/posición de los botones de pase y tiro, el marcador
tapando la jugada, dónde viven los ajustes de control, el modo entrenamiento, código muerto y
rendimiento en celulares. De ahí salieron pedidos concretos de gameplay (bocha por peso, arquero,
compañeros IA, sonido de barandas). Todo lo de abajo está **compilado limpio** (`tsc --noEmit`; sin
`node_modules` no hay forma de instalar los tipos de `node`/`react`/`next`, así que quedan errores de
"no encuentro el módulo" en `app/*.tsx` y en los tests — pero ninguno de esos errores está en el
código que se tocó, se filtraron línea por línea) y **pasa los 233 tests existentes** (`pnpm test`, corridos con `node --test` sobre el build de
`tsc -p tsconfig.test.json`, sin necesitar `node_modules`). Lo que NO se hizo, honestamente: abrir la
app en un navegador real — este entorno no tiene uno. Todo lo visual (los botones NES-style, el
marcador corriéndose, el paso del arquero) está verificado por lectura de código y por los tests, no
por haberlo visto en pantalla. Antes de dar esto por bueno de verdad: `pnpm install && pnpm dev` y
jugar unas partidas con las manos.

**Motor (`lib/engine`)**
- **Tres bochas por peso** (`PuckKind`: `pesada` / `normal` / `liviana`, en `constants.ts` como
  `PUCK_KINDS`): multiplican velocidad máxima, frenado y rebote. Pesada = más lenta y previsible;
  liviana = más rápida y con más rebote. Mismo eje que usan después el partido normal y el
  entrenamiento — no son dos sistemas separados. Restitución con tope en 0.95 (ni la más liviana pierde
  la energía de una pelota de goma para siempre).
- **Arquero — despeje activo con el palo**: antes, una atajada (no-combo) era un rebote elástico puro,
  "a lo que caiga". Ahora se le suma un empuje extra hacia el costado y hacia afuera del propio arco
  (`GOALIE.clearSpeed`), más fuerte cuanto más fuerte llegó el tiro — un arquero de verdad saca la
  bocha de encima, no la deja picar.
- **Arquero — el bug real de "se cuelan porque no alcanzan a girar"**: encontrado en `updateGoalies` —
  cuando la bocha se desvía (poste, patinador) estando ya "entrando", el arquero seguía apuntando hacia
  donde iba ANTES del desvío (el retardo de reacción solo se disparaba en el primer flanco de
  "entrando", nunca de nuevo). Ahora se detecta el cambio brusco de ángulo de vuelo y se le da un
  instante corto para regirar (`GOALIE.deflectionDelay`, más corto que el retardo de reacción inicial
  porque ya estaba alerta, no arranca de cero).
- **Camera.zoom eliminado**: código muerto real, confirmado sin ninguna referencia en todo el proyecto
  — el campo y su rango quedaban de un pellizco de zoom que ya se había sacado hace rondas.
- **Compañeros IA y sonido de barandas — auditado, no tocado**: ya funcionaban como se pidió. El
  control salta automático al compañero que agarra la bocha (`selectControlled`), así que la IA nunca
  dispara "por vos" — solo lo hace mientras vos seguís controlando a otro. El evento `board` ya tiene
  sonido conectado (`sfx.ts` → `case "board"`). Se dejaron así para no arriesgar algo que ya andaba.

**Juego (`lib/game`)**
- **Marcador y botones PASE/TIRO se atenúan cerca de la jugada**: si la pelota (o tu jugador) quedan
  bajo esa esquina, el marcador se corre a la derecha y se atenúa (con inercia, no un salto), y los
  botones de acción bajan de opacidad — sin moverlos, porque mover un botón de acción debajo del
  pulgar sería peor que dejarlo fijo.
- **Botones PASE/TIRO — estética "mando de NES"**: 74px → **96px**, con degradé + sombra (cuerpo
  abombado, no un círculo plano) y hundimiento visual al presionar.
- **Arquero — paso ruso**: marca de patín lateral bajo los pies (coordenadas de mundo, no gira con el
  cuerpo), que pulsa más rápido cuanto más rápido se mueve de costado.
- **Rendimiento**: el aura de "compañero" (gradiente radial) se creaba de cero 60 veces por segundo
  por cada compañero en pantalla — ahora se cachea por color/radio. La tribuna de público pasó de un
  `beginPath/arc/fill` (y a veces `font`) por hincha, cada cuadro, a agrupar por color y franja de
  opacidad en un `Path2D` por grupo: de ~cientos de `fill()` por cuadro a ~40. Switch "Rendimiento:
  Alta/Ahorro" nuevo en el diálogo de pausa — en modo ahorro, menos densidad de tribuna y sin
  banderitas (lo más caro de dibujar ahí), en vivo sin reiniciar el partido.
- **`app/lab/` eliminado**: carpeta de ruta de Next.js vacía, sin usar.

**App (`lib/app`)**
- Selector de bocha ("Pesada/Normal/Liviana") en la pantalla de armado de partido, persistido en
  `Settings.puckKind`.
- **Entrenamiento rediseñado como progresión real**: Básico (sin arquero, bocha pesada) → Medio (con
  arquero, bocha normal) → Experto (con arquero, bocha liviana) — antes era un selector suelto de
  arquero sin relación con dificultad. La práctica de penales queda igual (ya estaba bien).
- Switch de rendimiento en pausa (ver arriba), persistido en `Settings.graphicsSaver`.
- `storage.ts` sanitiza los campos nuevos (`puckKind`, `graphicsSaver`) al cargar partidas guardadas
  de versiones anteriores que no los tenían — no revienta con datos viejos.

**Archivos tocados**: `lib/engine/{types,constants,world,camera}.ts`, `lib/game/{match,draw}.ts`,
`lib/app/{app,storage}.ts`. Nada en `lib/engine/ai.ts`, `lib/game/sfx.ts` ni `tests/` (se auditaron,
no hicieron falta cambios).

## Ronda 40 — cuerpo con hombros/brazo/mano, patines y bocha imantada

A pedido: que el jugador deje de leerse como un solo punto girando sobre la cabeza. Todo esto es
**capa de dibujo pura** (`lib/game/draw.ts`) — cero cambios en `lib/engine`, la física/colisión
sigue viendo exactamente el mismo círculo que antes. Verificado igual que siempre: compila limpio y
pasa los 233 tests (encontré y arreglé un bug propio en el camino — ver abajo).

- **Patines**: un par asomando bajo el cuerpo (look Funko: cuerpo grande, pies chicos), con zancada
  alternada mientras se mueve. Sin estado nuevo en el motor: la fase sale de `performance.now()`
  mezclado con la velocidad — **pero solo por encima de cierta velocidad**; parado no anima nada.
- **Hombro → mano → palo**: antes el palo salía flotando del centro del cuerpo. Ahora hay un brazo
  (color piel) desde el borde del cuerpo hasta una mano sobre el palo, y de ahí sale la pala.
- **Mano izquierda o derecha, y revés/derecho, sin código nuevo para eso**: el lado del brazo sale
  de reusar `sin(heading - stickAngle)` — el mismo cálculo que ya decidía de qué lado viene el
  acompañamiento del golpe. Como el tiro (`kick()`) nunca estuvo atado a un lado fijo, esto ya
  alcanza para que el brazo y el swing concuerden solos: si la bocha quedó a la izquierda heredé un
  tiro de revés desde ese lado, a la derecha uno de derecho — no hizo falta enseñarle nada nuevo al
  motor, solo dibujar lo que ya calculaba.
- **Imán**: un resplandor celeste suave alrededor de la bocha mientras `puck.carrierId` existe, para
  que se lea pegada al palo en vez de apoyada.
- **Bug propio encontrado y arreglado**: los patines animaban con el reloj real incluso con el
  jugador parado quieto, lo que rompía el test `dibujo: el pelo es estable...` (que exige que dos
  cuadros del mismo jugador quieto salgan byte-a-byte idénticos). Se corrigió gateando toda la
  animación por velocidad — de paso, mejor UX: sin jitter de pies en reposo.

**Archivos tocados**: solo `lib/game/draw.ts`.

## Valoración como juego arcade

Pedido explícito: opinar como alguien que conoce el género, no solo listar lo que se hizo. Esto es
una lectura de todo el código a lo largo de esta sesión (motor, IA, audio, HUD), no de haberlo
jugado con las manos (ver "Estado de verificación") — la opinión sobre **sensación** de juego tiene
ese límite y hay que tomarla con esa reserva.

**Lo que está realmente bien, para el estándar del género:**
- **La energía como límite del supertiro, no un cooldown de reloj**: gastás estamina de verdad
  acelerando, no por existir — así que jugar "a lo loco" te cansa y un supertiro cuesta la mitad del
  tanque. Es una decisión de diseño más fina que la de la mayoría de los arcades de este tamaño, que
  suelen usar una barra que se llena sola con el tiempo.
- **El combo de 3 toques (ataque) y 3 despejes (defensa) da un ritmo de "arma la jugada" real**, sin
  ser un QTE ni un minijuego aparte — vive en la física normal.
- **Dos esquemas de control pensados de verdad** (honda tipo Angry Birds vs. botones arcade clásico)
  con el mismo motor de tiro/pase abajo — no es un reskin, son dos formas distintas de razonar la
  misma acción, y las dos tienen ayuda de puntería (`assistAim`) calibrada.
- **El público reacciona con capas de audio que se mezclan según la excitación del partido**
  (`crowd-mix.ts`), no un loop fijo — para un juego que cabe en un solo HTML es un nivel de
  producción de sonido poco común.
- **El sistema de faltas es simétrico y matemático** (impacto ≥ umbral + quién puso el cierre), no
  "el rival nunca comete falta" como en tantos arcades deportivos baratos.

**Lo que lo frena, en orden de impacto:**
1. **No hay un segundo jugador humano.** Es la ausencia más grande para el género: los clásicos de
   arcade deportivo (NHL Arcade, Sensible Soccer, Rocket League en su núcleo) viven y mueren por el
   1v1 en el sillón. Hoy es un solo humano contra IA, siempre — ni local de a dos ni online. Es la
   mejora de mayor impacto si el objetivo es "un lujo arcade" de verdad, y probablemente la más cara
   de construir (necesita un segundo esquema de entrada completo, o red).
2. **La Copa es un bracket fijo de 4 equipos.** Como metajuego de "una sesión" está bien, pero no
   hay progresión de más largo aliento (liga, más equipos, desbloqueables más allá del entrenamiento)
   que te haga volver mañana. Ya está anotado en "Pendiente".
3. **"Banda de la galería" sin hacer** — hoy la ambientación es multitud + tambores de estadio, pero
   falta la música/banda propiamente dicha que le daría identidad sonora al arranque de cada
   partido, no solo al ambiente.
4. **Vista de penal sin cámara dedicada** (la idea "tipo Duck Hunt" que quedó en el pendiente): un
   penal usa el mismo gesto que un tiro cualquiera. En un juego donde el penal ya es un momento
   dramático (mano a mano, mismo mecanismo que la falta de 3), una cámara/interfaz propia para ese
   momento sería la clase de detalle que separa "bueno" de "de lujo".
5. **Todo lo visual de esta sesión (cuerpo, patines, brazo, imán, botones NES) nunca se vio en una
   pantalla real** — compila y pasa tests, pero "se siente bien" es un juicio que falta validar con
   las manos. Antes de pulir más, jugar.

**Comparado con qué**: como base técnica (motor determinista, tests de física reales, IA con
dificultad por skill, sonido dinámico) está por encima de la mayoría de los juegos deportivos
arcade hechos para web — ahí es sólido de verdad. Como experiencia completa de arcade "de lujo" le
falta lo que más engancha del género: jugar contra alguien al lado, y una razón para volver mañana
más allá de mejorar el propio puntaje. Si tuviera que elegir UNA cosa para la próxima ronda, sería
el punto 1.

## Cómo se juega

Dos esquemas de control, elegibles en Ajustes (`Settings.controlScheme`, por defecto "honda"):

**Honda (Angry Birds)** — el de siempre, rediseñado en esta ronda:

| Dedo | Qué hace |
| --- | --- |
| **Izquierdo** (mitad izquierda de la pantalla) | Joystick flotante: nace donde tocás y mueve al jugador que lleva el puck. **Un toque rápido sobre un compañero le pasa a él** (pase de un dedo: no hace falta el otro pulgar). |
| **Derecho** (mitad derecha) | Como una honda: tocás y **estirás lejos** de hacia dónde querés tirar, soltás y sale para el lado **contrario** — no hay que deslizar HACIA el objetivo. Cuánto estiraste es la potencia (poco = pase, bien estirado = tiro fuerte). Un **toque** suelto (sin estirar) es pase automático al mejor compañero. |

- **Bug real y grave, encontrado insistiendo — "mover y tirar juntos no andaba"**: tenía razón, y no
  era un problema de su teléfono. El código tenía un pellizco de dos dedos para hacer zoom con la
  cámara — pero se disparaba apenas tocaba un SEGUNDO dedo la pantalla, sin importar la intención. Como
  el control de honda NECESITA los dos pulgares a la vez (uno mueve, el otro tira), cada vez que se
  intentaba usar los dos juntos, el pellizco cancelaba el joystick del primero y nunca llegaba a
  registrar el tiro del segundo. Mi primera respuesta (simular la lógica pura de `input.ts`) no lo
  encontró porque el bug vivía una capa más arriba, en cómo `match.ts` conecta los eventos táctiles del
  navegador — ahí es donde hacía falta mirar. Se sacó el pellizco entero: el botón de vista (SEG/TOT/3/4)
  ya cubre "ver más cancha" sin ese riesgo.
- **Se rediseñó el gesto entero en esta ronda**: antes había que deslizar el dedo HACIA donde se quería
  tirar, midiendo la VELOCIDAD de salida (con una ventana de tiempo). Eso se sacó por completo: ahora es
  puramente estirar-y-soltar, la potencia depende de cuánto se estiró (no de qué tan rápido), y la
  dirección es la opuesta al estirón — como una honda de verdad. Mientras se sostiene el dedo se ven DOS
  líneas: una punteada blanca (la banda, de dónde tocaste a dónde estiraste) y la de tiro de siempre
  (verde a compañero, amarilla a portería), ahora apuntando para el lado correcto.
- **El supertiro se ve venir, en los dos esquemas**: confirmé con números que un estirón/carga a fondo
  SÍ llega a velocidad de supertiro (30 m/s, por encima del umbral de 24 — antes de tocar nada lo revisé
  en `constants.ts`, no lo asumí). Le sumé una señal visual que faltaba: la línea de tiro de la honda (y
  el relleno del botón TIRO en el esquema de botones) se ponen **naranjas** apenas el estirón/carga
  alcanza el punto donde el tiro ya califica como supertiro — antes solo se sabía después de soltar, ya
  tarde para corregir. El umbral se calcula solo a partir de `STAMINA.superShotMinSpeed` y
  `powerFromFlick()`, no es un número suelto: si cualquiera de las dos cambia, la señal se recalcula sola.
- **Pase de un dedo**: un toque rápido (corto, sin arrastrar) sobre un compañero —o sobre su flecha de borde si
  está fuera de cuadro— le pasa a ESE compañero, con cualquiera de los dos dedos. El toque del dedo izquierdo
  que no cae sobre nadie no hace nada (así un toquecito para arrancar no regala la pelota); el toque suelto
  del dedo derecho conserva su pase automático al mejor. Si el jugador más cercano al toque es un rival, no se
  pasa (`teammateAtPoint()` en `aim.ts`). La zona tocable mide al menos ~40 px de radio aunque se vea chico.
  El pase va DIRECTO al elegido (adelantándose a donde va), sin que la ayuda de puntería lo cambie por otro.

**Botones (arcade clásico)** — nuevo, a pedido:

| Control | Qué hace |
| --- | --- |
| **Cualquier dedo, en cualquier lugar** | Stick de movimiento (no hay más zona de acción — toda la pantalla mueve). |
| **Botón PASE** (círculo verde, abajo a la derecha) | Mantenido: carga potencia (0 a 1 en ~1.1s, se ve en el relleno del botón). Soltar pasa al mejor compañero, a 0.7x-1.3x la velocidad automática según cuánto se cargó. |
| **Botón TIRO** (círculo amarillo, al lado) | Igual, pero tira hacia donde MIRA el jugador (no hay gesto de apuntado en este esquema), con la misma escala de potencia que un estirón de la honda. |

- Los botones son elementos reales (no dibujados en el canvas) — no los pude ver renderizados en este
  entorno (no hay navegador; ver "Estado de verificación"), solo confirmé que compilan y no rompen nada.
- Son dos esquemas de verdad separados: cambiar de uno a otro en Ajustes no toca el motor de tiro/pase
  (`kick()`, `assistAim()`, `passSpeedFor()`) — los dos convergen en el mismo lugar (`applyAction()` en
  `match.ts`), solo cambia cómo se arma el gesto.
- Cuando un pase sale, el control salta al receptor y **se queda ahí mientras la pelota vuela**
  (`lockReceiver()` en `match.ts`; se suelta cuando alguien agarra la pelota o a los 2.2 s). Antes se
  reasignaba al compañero más cercano a donde estará la pelota, que en un pase largo solía ser otro.
- En escritorio: **WASD o flechas mueven** (independiente del mouse), el mouse (en toda la pantalla, ya
  no solo la mitad derecha) sigue sirviendo para el flick de pase/tiro, y **Espacio** es pase automático.
  `Esc` pausa.
- **Tutorial de controles: sale AL ARRANCAR LA COPA** (primer cruce, una vez por Copa; reiniciar el mismo
  cruce no lo repite). Trae "Entendido" (vuelve a salir en la próxima Copa) y "No volver a mostrar"
  (`Settings.tutorialOptOut`, se guarda). El partido suelto y el demo no lo muestran (regla en
  `lib/app/tutorial.ts`; `seenTutorial` de versiones anteriores migra a `tutorialOptOut`). Mientras el
  equipo humano no hizo su primera acción, hay un hint chico abajo de la pantalla recordando el control.
- **La app SIEMPRE abre en el demo** (IA vs IA); tocar la pantalla o apretar una tecla lo corta y lleva al menú.
- Si girás el teléfono a vertical el partido se congela y pide girar: la pista es horizontal.
- Ajustes: esquema de control (honda / botones), modo zurdo, sonido, nivel del rival (fácil / normal /
  difícil) y duración (1, 2, 3 o 5 min).

### Reglas y física

- **El palo acompaña el golpe, no empuja de frente**: investigué la técnica real antes de tocar nada
  (varias fuentes coinciden: la bola se juega ligeramente atrás y al costado del cuerpo, y el jugador
  gira tronco y hombros acompañando la dirección del tiro — no hay una "técnica de empuje recto" en
  hockey de verdad). El tiro en sí sigue siendo instantáneo en la física (no hay un estado de "cargando"
  antes de patear), pero el palo ahora tiene un **seguimiento visual después del golpe**: pasa de largo
  el ángulo del tiro un instante y se asienta, como el *follow-through* de un golpe real — reusando
  `pickupCooldown` (que ya existe, cuenta para abajo después de patear) para la animación, sin agregar
  ningún estado nuevo al motor.
- **Patinadores sin casco, arquero con casco.** Es hockey sobre patines, no hielo: los jugadores de línea
  van con el pelo al aire (visto desde arriba); el arquero es el único con casco, rejilla y hombreras.
- **Crease.** Ningún patinador puede pararse dentro de un semicírculo de 1.75 m frente a cada portería
  (el semicírculo mira SOLO hacia la cancha: por detrás de la red no bloquea nada, ahí se puede envolver
  el arco): no hay tiros a quemarropa parado en la boca del arco, hay que tirar desde más lejos.
- **Arquero con ángulos, no solo reflejos.** Además de moverse en el eje de la portería, sale a cerrar el
  ángulo cuando el atacante se acerca (hasta 0.55 m más adelante de su posición base) y por defecto se
  para sobre la línea imaginaria puck→centro de la portería, no solo detrás del disco.
- **Faltas y tarjeta azul** valen igual para el jugador humano y para la IA: un golpe fuerte donde casi
  todo el cierre lo pone el agresor saca al infractor 25 s de juego. Máximo 2 expulsados por equipo y
  nunca menos de 2 patinadores en pista. Un choque de frente entre dos que corren no es falta.
- **Robo**: un rival que llega dentro de un cono de ~110° delante del portador se lo quita; por la espalda
  no (fuera de ese cono), el cuerpo protege el puck (ahí lo que corresponde es un golpe que se lo hace
  soltar, no un robo limpio). Es una regla explícita de ángulo, no un efecto lateral de la geometría.
- **Pases fuertes**: por encima de ~15 m/s el puck rebota en el receptor en vez de controlarse — y a
  quien le rebota no lo puede atrapar de inmediato (`SKATER.deflectCooldown`), aunque la física ya lo
  haya frenado un instante después.
- **Peso de la pelota**: un roce incidental (no un tiro deliberado) casi no la mueve
  (`PUCK.skaterRestitution` bajo a propósito); el tiro deliberado no pasa por acá, va directo por
  velocidad en `kick()`.
- **Trayectoria semi-curva**: un tiro (no un pase, no el golazo de combo) tomado con el patinador
  moviéndose de costado sale con efecto — cuanto más lateral la carrera al tirar, más curva — y se
  apaga con el vuelo, así un tiro largo no da una vuelta imposible (`lib/engine/constants.ts`, `CURVE`).
- **Defensa cubre línea de tiro, no al cuerpo**: el defensor sin balón se para entre el rival y su
  propia portería, más cerca cuanto más peligroso (cerca del arco) está ese rival.
- **Quién la lleva se lee distinto**: el que tiene la bocha patina 0.92x (`SKATER.carrySpeedMul`, ya
  existía), muestra un anillo naranja sólido (no confundir con "vos lo controlás", que ahora es
  amarillo — pueden aparecer juntos) y deja un rastro punteado de rueda al moverse — no la línea
  continua de una cuchilla de hielo. Solo dibujo, no toca físicas.
- **"Vos lo controlás"**: beacon pulsante en el piso + aro punteado grueso + flecha arriba. Es amarillo
  (`#facc15`) **salvo que el equipo sea amarillo/naranja** (Brasil, Angola): ahí pasa a blanco
  (`pickCueColor()` en `lib/game/cues.ts`). Antes se afirmaba que ningún equipo usaba ese amarillo; medido
  con `colorDistance`, Brasil (49) y Angola (88) sí lo hacían y el marcador se perdía contra el propio cuerpo.
- **Aura de compañero** (`lib/game/cues.ts` + `drawSkater`): el color de equipo era solo un aro fino (la
  cabeza tapa el 74 % del cuerpo). Cada compañero del humano lleva un resplandor ESTÁTICO del color del
  equipo más un anillo claro y fino; los rivales no llevan nada. El color del resplandor se aclara hacia
  blanco solo lo necesario para separarse del piso (`auraColor()`; EE.UU. sobre sintético estaba a 29 de
  ~765). No aparece en el demo (no hay humano: `DrawOptions.humanSide = null`).
- **Mira de pase**: mientras el humano lleva la bocha, el compañero al que iría el toque suelto
  (`bestPassTarget`) muestra 4 arcos verdes que giran y un hilo punteado desde el portador. Verde = pase,
  igual que la línea de puntería.
- **Flechas de borde**: SIEMPRE (con o sin la bocha) los compañeros fuera de cuadro aparecen como un chip
  del **color del equipo** con su dorsal y un aro claro, pegado al borde y apuntando hacia ellos
  (`drawTeammateEdges`, `edgeAnchor` y `slideOffRects` en `cues.ts`; se corren para no tapar la placa ni los
  botones). Un compañero que asoma a medias por el borde se ve y no recibe flecha. Si llevás la bocha, la
  flecha del pase automático lleva aro verde. El aura es solo del equipo del jugador (no de los rivales).
- **La bocha ya no lee como pelota de básquet**: es más chica (62% del radio de render anterior) y sin
  el borde negro grueso que la hacía ver como una pelota de básquet — ahora es un brillo angosto y
  compacto, más densa/dura. El radio de físicas (`PUCK.radius`) no se tocó, esto es solo dibujo.
- **4 peinados distintos, dibujados con hachurado de trazos por material** (`drawHair()` en `draw.ts`),
  siguiendo fotos de referencia de la coronilla vista desde arriba: (0) corto con remolino en la coronilla
  y puntas sueltas, (1) rulos apretados hechos de anillitos, (2) rapado con cuero cabelludo a la vista,
  sombra de pelo y un diseño rasurado más claro, (3) largo con raya al medio y brillo. Se elige por hash
  del id; los trazos salen de una semilla por jugador, así que no titilan cuadro a cuadro. Como en las
  fotos: **sin ojos** (con ojos, el pelo "atrás" se leía como barba cuando el jugador miraba hacia arriba),
  con frente, **nariz al frente** (marca hacia dónde mira) y **orejas**. La cabeza no se achicó. Los trazos
  no bajan de ~1 px aunque se aleje el zoom.
- **El arquero también lleva palo** (`drawScene`): en hockey patín el guardameta juega con stick y es el
  MISMO reglamentario que el de los jugadores — Art. 16.6 del Reglamento Técnico de World Skate (citado en
  el comunicado CERS-RH FG-021/2017 sobre equipamiento irregular de arqueros): madera o plástico sin
  metal, base plana, de **90 a 115 cm**, debe pasar por un aro de 5 cm y pesar hasta 500 g. Por eso NO
  lleva la paleta ancha del hockey hielo. Se dibuja con el mismo largo que el de un patinador (~0.9 m desde
  la mano) y **sigue a la pelota** sin girar más de ~66° de hacia donde mira (`goalieStickAngle()` en
  `cues.ts`). Solo dibujo: no cambia la física ni el alcance del arquero.
- **Arquero un poco más grande** (`GOALIE.radius` 0.5→0.58): usa equipo (careta, guantes, pads), abulta
  el radio real. Es un cambio físico, no solo de dibujo — tapa algo más de arco que antes, a propósito
  (un test de balance se retocó para reflejarlo, sin cambiar el diseño).
- **Palo más largo** (de r+0.42 a r+0.62 en el dibujo, ~1 m real): solo visual, no toca `stickReach`
  (la física del tiro no cambió).
- **Piso con hash de material** en vez de paleta plana: cada tabla de madera, losa de cemento o baldosa
  sintética tiene su propio tono (`matHash()` en `draw.ts`, determinístico por celda) — lee más a
  material real, no a color RGB liso repetido.
- **Falta con pantallazo propio**: reusa el mismo mecanismo de "flash" que ya tenía el gol (color de
  equipo, breve), ahora también en azul para la tarjeta — sin agregar texto grande en el medio de la
  pista, coherente con cómo ya se resolvió el festejo de gol.
- **Gol**: se detecta tanto si el puck cruza la línea en movimiento libre como si queda colocado dentro de
  la boca (por ejemplo, tras un rebote que lo deja del otro lado), sin depender de en qué frame exacto
  pasó. La crease empuja al portador demasiado lejos de la línea como para empujarlo con el palo hasta el
  fondo: hoy el gol siempre sale de un tiro o de un rebote, nunca de "caminarlo" adentro.
- **Recogida del puck**: si dos patinadores llegan a la vez, se la queda el que está más cerca del disco,
  no el primero en una lista interna.
- **Reloj**: cuando llega a 0:00 con el puck suelto o volando, hay 1.5 s de gracia antes de pitar el final,
  para que una jugada ya en marcha (un tiro, un rebote) pueda terminar en vez de cortarse en seco.
- **Pistas** (la del equipo local manda): madera (equilibrada), sintético (todo se desliza más) y cemento (frena rápido).
- **Plantillas**: 4 jugadores por equipo, cada uno *normal*, *pesado* (aguanta golpes, lento) o *veloz* (ágil, liviano). El primero es el capitán.

### Marcador (HUD): placa chica en la esquina, no una barra que tape la cancha

- **Cambio grande, a pedido explícito**: la barra de lado a lado (de la Ronda 11) tapaba demasiada
  pantalla. Ahora es una placa chica arriba a la izquierda (~190-260px de ancho, tope 86px de alto),
  con el look de la placa de transmisión de ardisport.cl: fondo negro, cajas de dos cifras y **dígitos
  verdes gruesos** (`#a6e19f`, el verde de la foto). Arriba: escudo · reloj · escudo. Abajo: puntos ·
  `FALTA` · `FALTA` · puntos. Cada caja de puntos lleva una franja del color del equipo en la cancha.
  Combo en lámparas debajo de la placa. La cancha se ve casi entera.
- **Marca "ARDISPORT.CL"**: una tira fina arriba de la placa (`PLATE_BRAND_H` = 10 px, incluida en
  `plateSize()`), dibujada con los mismos glifos gruesos y el mismo verde, más tenue. Y al pie del menú,
  como texto (`.fp-foot`); a propósito NO es un link: un enlace de ese tamaño rompería el mínimo de 44 px
  que exige `audit:ui`. Para que entrara en 320×568 con el entrenamiento desbloqueado, ese tamaño de
  pantalla compacta el logo y oculta las esquinas decorativas de abajo (que ya se montaban sobre "Créditos").
- **Los números y letras del marcador se DIBUJAN a trazo** (`lib/game/glyphs.ts`: dígitos, `:`, y las
  letras de FALTA/GOL/GOLAZO/FIN), no con `ctx.font`. Motivo, encontrado auditando: el canvas **no
  entiende `var(--font-orbitron)`** — asignar esa fuente a `ctx.font` se ignora entera y todo el texto
  del HUD (marcador, cartel de ayuda, banner, "TOCÁ PARA JUGAR") salía en `10px sans-serif` sin importar
  el tamaño calculado: por eso se veía chico y flaco. Además `match.ts` ahora resuelve la variable a la
  familia real al montar (`canvasFontFamily()` en `cues.ts`), así el resto del texto del canvas también
  recibe su tamaño. Puntos y faltas se topan en 99.
- El "GOL"/"GOLAZO"/"FIN" y el destello de quien anotó ahora viven DENTRO de la placa, no en toda la
  pantalla — mismo criterio de siempre (nunca tapar el hielo), aplicado a una placa mucho más chica.
- **Se sacaron los chips de expulsados** (tarjeta azul con cuenta atrás) que sí tenía la barra vieja —
  no entraban con dignidad en una placa de este tamaño. El conteo de faltas por equipo (`falta N`)
  se mantiene; el detalle de "quién y cuántos segundos le quedan" quedó afuera. Si hace falta, es su
  propia ronda chica.
- El marcador de ardisport.cl (el de la foto que mandaste, con escudo/reloj/faltas/período en formato
  de transmisión completo) queda referenciado en los créditos como el diseño real detrás de esto —
  no se reprodujo 1:1 adentro del juego porque es un layout pensado para pantalla completa, no para un
  widget de esquina durante el partido.

### Penal (regla nueva, investigada antes de tocar código)

- **Cada 3 faltas acumuladas de un equipo** (`RULES.foulsPerPenalty`), el rival cobra un penal — tu
  regla, no la oficial (el reglamento real de hockey patín usa 10 y después cada 5; lo investigué y
  documenté la diferencia). El conteo por equipo es independiente de la tarjeta azul individual: las
  dos sanciones pueden darse en la misma falta.
- El penal es mano a mano de verdad: el capitán del equipo no infractor con la pelota, parado en el
  punto de penal (7.4 m de la línea, la misma distancia del reglamento real), arquero rival centrado
  en su línea, **los otros 6 patinadores lejos** (los dos equipos) — nadie estorba.
- No es una fase nueva del motor: reusa exactamente el mecanismo del saque (`awardPenalty()` en
  `world.ts`), así que después del tiro (entre o no) el juego sigue solo, sin lógica de "fin de
  penal" separada — es el mismo camino que un saque normal, con otra formación.
- Sonido y aviso: silbato + `¡PENAL para [equipo]!` (`match.ts`/`sfx.ts`), reusando el mismo mecanismo
  de "pantallazo" que ya tenían el gol y la falta.
- **Siempre con el tanque lleno**: `awardPenalty()` le resetea la energía al tirador a 100 — así el
  penal siempre puede ser un supertiro de verdad, sin que el cansancio del partido (o de intentos
  anteriores, en la tanda de la Copa) se lo impida.
- **Bug real, encontrado jugando de verdad**: "los penales nunca son goles" — cierto, y no era de
  puntería. Simulé cientos de intentos (`node` directo contra el motor compilado, no solo tests) y until
  un supertiro bien colocado a la esquina (0.9m del centro) daba **0% de goles**. La causa: el arquero
  vive con un `standoff` (se adelanta de la línea para "cerrarle el ángulo" al atacante, como un
  arquero de verdad en juego abierto) — pero a los 7.4m fijos del penal, ese mismo adelanto alcanza
  para tapar CASI TODO el arco sin necesitar reaccionar ni moverse un centímetro. En un penal real, el
  arquero tiene que quedarse parado en la línea hasta que se patea — nuestro arquero no lo sabía.
  Ahora `World.penaltyActive` se lo dice: mientras dura el penal, `updateGoalies()` fuerza el
  `standoff` al radio del propio arquero (el dorso toca la línea, no el centro — poner el centro
  justo en la línea lo hacía solaparse con el arco y la física lo empujaba sola, otro bug menor en
  el camino) en vez de adelantarse. La bandera se apaga sola en el próximo saque normal.
  **Resultado, con el mismo supertiro a la esquina: 70-100% de goles.** Un tiro al medio del arco
  sigue atajado siempre — no se volvió gratis, solo dejó de ser imposible. 3 tests nuevos en
  `possession.test.ts` blindan esto (el arquero no se adelanta durante el penal, la esquina entra la
  mayoría de las veces, el medio sigue atajado siempre).

### Posesión: al que le hacen el gol, sale con la pelota

- El saque después de un gol ya no es neutral: el equipo que **recibió** el gol sale con la pelota
  (`World.nextKickoffSide`, consumido una vez por `placeKickoff()`). Antes quedaba suelta al medio, a
  ver quién llegaba primero. El saque inicial del partido sí es neutral (nadie recibió un gol).
- Verificado de punta a punta (`tests/engine/kickoff-after-goal.test.ts`): si te hacen el gol, sacás vos
  con la pelota en el centro y **podés pasar en el primer instante** (el pase sale sin esperar y el
  compañero la recibe; también se puede elegir tocándolo); si se lo hacen al rival, saca el rival y la
  IA de verdad pasa o tira en pocos segundos (4 semillas), no se queda parada. El derecho de saque se
  consume: no se repite.

- Últimos 10s: el reloj de la placa parpadea en rojo — la placa no se mueve, solo el número.
- Los botones de pausa/vista/pantalla/sonido están **arriba a la derecha** (`.fp-hud` en `styles.ts`).
  Antes estaban abajo a la izquierda: tapaban jugadores y quedaban justo donde descansa el pulgar del
  joystick flotante (un toque de más = pausa). `hudAvoidRects()` en `cues.ts` conoce la ubicación de la
  placa y de los botones para que las flechas de borde no los pisen.
- **Bug real, reportado como "no veo el botón de vista"**: hice el cálculo con los anchos reales del
  CSS (hasta 5 botones de 46px + la placa del marcador, ambos en la esquina superior) y en pantallas
  angostas se llegan a tocar por unos pocos píxeles — el botón de vista, en el medio de la fila, es el
  más fácil de terminar tapado o cortado. No pude reproducirlo exacto (no tengo cómo ver el DOM real
  desde acá, solo lo que dibuja el canvas), así que en vez de correr el margen until un número que
  funcione en ESTE caso, hice que la fila **nunca pueda superponerse**: `flex-wrap` + un ancho máximo
  — si no entra una fila entera, pasa el botón que sobra a una segunda fila, abajo de la primera, en
  vez de superponerse a la placa. Sigue sin verificar con un DOM real.
- **Ajustes de control desde la pausa**: botón "⚙️ Ajustes de control" en el menú de pausa — antes
  solo se podían cambiar desde la pantalla de Equipos y ajustes, fuera del partido. Diestro/zurdo se
  aplica EN VIVO (`match.setLeftHanded()`, no hace falta reiniciar). Honda/botones en cambio SÍ
  reinicia el partido — avisado con un diálogo antes de aplicar: el esquema de botones tiene sus
  propios botones armados en el DOM una sola vez al montar el partido, no hay forma de
  aparecerlos/sacarlos en vivo sin volver a armar toda la pantalla.
- **Combo y energía también se sienten en el cuerpo del jugador**, no solo en el HUD: el que arma el
  combo (portador con `attackCombo` de su lado, o el arquero con `defCombo` armado en defensa) muestra
  un aro que crece y late con los toques; y cualquier patinador cansado se ve más apagado — el color de
  equipo se mezcla con gris en proporción a cuánto le queda de tanque, sin agregar ningún widget nuevo.
- El diálogo del tutorial de la Copa se demora ~0.9s antes de pausar: antes tapaba el saque inicial en el
  mismo frame en que arrancaba el partido.

### Al meter un gol

- El número del equipo que anotó, adentro de la placa, **pega un golpe** (escala 1 → 1.35 → 1 en los
  primeros ~0.4s, derivado del propio `phaseTimer` del mundo — sin estado nuevo en `match.ts`).
- La placa entera **flashea** del color de quien anotó, un instante.
- `GOL` o `GOLAZO` aparece en la fila chica de la placa (donde van las faltas) — nunca texto grande en
  el centro de la pista. Al terminar el partido, dice `FIN` ahí mismo.
- Pantallazo del color de quien anotó (el de toda la pantalla, aparte de la placa — se mantiene).
- Confeti disparado desde la boca de la portería, en cada gol (no solo el del combo).
- **Festejo de partido ganado**: un estallido de confeti más grande, aparte del de cada gol — desde
  arriba de la pantalla, con los colores del equipo humano, cuando el partido termina ganado (no en el
  demo ni en entrenamiento, ahí no hay "ganar" real).
- **Banderas en la tribuna**: la tribuna de puntitos de colores (`drawCrowdStands`) ahora tiene una
  fracción chica (10%) de esos puntos reemplazados por el emoji de bandera de cada selección (los
  mismos `crests` del marcador) — no todos, para no recargar la vista.
- Replay de ~2 s en cámara lenta de la jugada que terminó en gol, con los mismos gráficos del partido
  (no una versión simplificada), durante la pausa de festejo.

### Equipos: 12 selecciones nacionales (sin los de club de fábrica)

- Los equipos de fábrica ya **no** incluyen los 4 de club inventados (Halcones, Tiburones, Cobras,
  Dragones) — se sacaron a pedido, junto con `CLUB_TEAMS` en `teams.ts`. `DEFAULT_TEAMS` ahora es
  exactamente `NATIONAL_TEAMS`: España, Portugal, Argentina, Chile, Italia, Francia, Brasil, Alemania,
  Andorra, Angola, México, Estados Unidos.
- Los 12 son "builtin": siempre están disponibles, no cuentan contra el cupo de 12 equipos propios
  (`MAX_CUSTOM_TEAMS`), y no se pueden editar ni borrar.
- El escudo de cada selección es la bandera del país (emoji, del set `CRESTS`) — no hay assets
  externos, se dibuja igual que cualquier otro escudo.
- Los nombres de la plantilla son apodos ficticios (Matador, Gaucho, Azzurro...), no jugadores reales.
- Categoría (`category`: mixto/masculino/femenino) es una etiqueta editable por equipo, no cambia nada
  del motor ni del balance.
- **Camiseta + pantalón, no un solo color**: `Team.pantsColor` (opcional, nuevo) — se ve como una banda
  en la parte de abajo del cuerpo, recortada al mismo círculo. Bug real encontrado: Chile tenía el AZUL
  como color PRINCIPAL (tenía que ser rojo, con el pantalón azul); se corrigió junto con España (roja,
  pantalón amarillo — ya estaba bien de camiseta, le faltaba el pantalón). Sumé pantalón también a
  Argentina (celeste/negro), Brasil (amarillo/azul) y Alemania (blanco/negro), bastante conocidos; el
  resto de las selecciones se dejaron sin este segundo color por no tener la certeza de cuál es —
  mejor sin dato que con uno inventado.

### Público de las gradas (audio)

Grabaciones reales de estadio, no síntesis (decisión de la Ronda 23: para el público las muestras suenan
mucho más reales; la síntesis se reserva para efectos y, más adelante, la banda).

- **Bug real, reportado jugando: la música y el silbato real nunca se escuchaban, solo lo sintetizado.**
  La pista: si un sonido sintetizado (osciladores puros) SÍ se oye pero uno grabado NO, el AudioContext
  funciona bien — el problema tiene que estar en TRAER el archivo, no en reproducirlo. En el build de un
  solo archivo (`juego.html`) el audio va incrustado como `data:` URI en base64, y se estaba trayendo con
  `fetch()` — que sobre una `data:` URI tiene antecedentes reales de fallar en navegadores/WebViews
  móviles (encontré casos documentados, aunque no pude confirmar que sea exactamente esto sin probarlo en
  el celular). Se cambió a `fetchAudioBytes()` (`sfx.ts`): si la URL empieza con `data:`, decodifica el
  base64 directo con `atob()`, sin pasar por `fetch()` para nada; si es una ruta real (`/audio/...`, el
  build de Next), sigue usando `fetch()` normal. 3 tests nuevos (`sfx.test.ts`) prueban el decodificado
  byte a byte, el caso de un `data:` URI sin base64 (rechaza, no devuelve basura), y que una URL normal
  siga yendo por `fetch()`. **Esto queda para que Ignacio lo confirme jugando de nuevo** — es la hipótesis
  más probable, no una certeza verificada.

- **Capas** (`lib/game/crowd.ts`, motor; `lib/game/crowd-mix.ts`, lógica pura y testeada): dos
  **murmullos** de fondo en bucle (siempre suenan), un bucle de **público entusiasmado** que entra al subir
  la tensión, **ovaciones de gol** (2 variantes, nunca la misma dos veces seguidas) y una **reacción corta**
  para tiros al palo / atajadas / tiro fuerte.
- **El entusiasmo** (0..1) sube rápido (1 s) y baja lento (3.5 s). Su objetivo (`pressure()`): pelota cerca
  de una portería, últimos 10 s, muerte súbita, combo armado. Los eventos suman un "golpe" que decae solo
  (`reactionFor()`): el gol propio se festeja más que el del rival, el golazo más que el gol común.
- **Silbato**: falta, penal, saque y final bajan al público un instante para que el silbato se escuche.
- **Música de fondo (`crowd-fiesta`)**: casi 80 segundos, no un recorte corto. La primera versión la
  cortó a 6s pensando que era "otro efecto más" — Ignacio la había probado ya y avisó que sonaba mucho
  mejor entera ("funcionaba genial"), un loop tan corto se siente repetitivo enseguida en música de
  fondo. Quedó recuperada del zip del proyecto (el original de 82s/960KB nunca se subió suelto a este
  entorno, pero seguía intacto dentro del zip ya subido) y reprocesada igual que el resto (nivelada,
  con fundidos, límite de pico) — 622 KB a 64kbps mono, con su propio tope en el test de assets (750KB,
  contra 200KB del resto: son las dos pistas pensadas para no repetirse, el resto son efectos cortos).
- **Banda de la galería (`crowd-band`), lo que faltaba en Pendiente, ya no falta**: 77 segundos de
  batucada real (bombo, redoblante) — recorte de 1:41 en adelante del mismo archivo que ya tenía
  procesado como `crowd-victory` (Ignacio indicó el corte exacto). No suena todo el partido como la
  música de fondo: es una capa aparte que **solo entra en el pico de tensión** (`bandGain()` en
  `crowd-mix.ts`, pasado ~65% de entusiasmo — últimos segundos, muerte súbita, combo armado), arriba
  del bucle de "entusiasmado". Mismo tope de 750KB que la música de fondo, por la misma razón.
- **Paneo**: la ovación llega del lado de la portería donde entró el gol, según hacia dónde mira la cámara
  (`panFor()`); la reacción corta, del lado de la pelota.
- **Bucles sin empalme grabado**: cada vuelta se solapa con la anterior 1.4 s con un fundido en cruz de
  potencia constante, al reproducirla. Así no depende de cómo cada navegador trate el silencio de los bordes
  del MP3. Cada murmullo arranca en un punto al azar.
- **Dónde suena**: partido suelto, Copa y demo (en el demo callado hasta el primer toque: el navegador lo
  exige). **No** en el entrenamiento (práctica en soledad). Obedece el botón de sonido y la pausa (también al
  girar el teléfono a vertical y al ocultar la pestaña).
- **Archivos**: `public/audio/crowd-*.mp3` (6 archivos, ~510 KB en total). En el build de Next se sirven desde
  `/audio/`; en `juego.html` van **incrustados** como `data:` URI (`window.__FP_AUDIO__`, lo arma
  `build-standalone.mjs`), así sigue siendo un solo archivo (~930 KB en total). Se cargan solo después del
  primer gesto y si el jugador no silenció el juego; si fallan, el juego sigue sin público.
- **Cómo se hicieron**: `scripts/build-crowd-audio.py --src <carpeta con las 4 grabaciones>` (necesita
  ffmpeg y numpy): recorta el tramo útil de cada grabación, **nivela** la deriva de volumen, limita los
  recortes que traían y recodifica a MP3 (96 kbps; 64 kbps la reacción, mono). Cada pieza sale de una sola
  grabación y no se solapan dentro de la misma.
- **Licencia**: las 4 grabaciones parecen de Pixabay por el formato del nombre (`usuario-título-id`);
  **confirmar la fuente y la licencia de cada una**. Bajo la Licencia de Contenido de Pixabay el uso es libre,
  sin atribución obligatoria y se puede modificar, pero **no se puede redistribuir el archivo tal cual**
  ("standalone"). Por eso el proyecto lleva SOLO las versiones procesadas y un test
  (`tests/game/crowd.test.ts`) falla si aparece un original en el árbol. Los autores figuran en Créditos
  como cortesía.
- **Medido, no escuchado**: en Chromium, con un analizador en la salida real, el murmullo suena a ~-34/-39 dB
  (RMS), sube unos 8 dB con el arco en peligro y la ovación de gol sobresale ~+17 dB, sin saturar; silenciar y
  pausar dejan la salida en silencio. **Cómo suena lo decide el oído**: los niveles se ajustan en `CROWD`
  (`crowd-mix.ts`: `master`, `bedMax`, `energyMax`, `roarMax`, `reactMax`, tiempos de subida/bajada).

### Modo Copa

- **Elegís UN equipo** (el tuyo) y el nivel de los rivales; los otros 3 salen al azar. Antes se elegían
  4 equipos sueltos, sin ningún concepto de "el mío" — y tenía un bug real: el ganador de la semifinal 1
  siempre quedaba "local" en la final, así que si tu equipo salía de la semifinal 2, en la final
  terminabas controlando al equipo EQUIVOCADO. Se arregló con un truco simple: tu equipo siempre va
  primero en `teamIds` (`newCup`), así el bracket ya garantiza que seas local en cada cruce que juegues
  — sin tocar nada de la lógica en `cup.ts`.
- **Bracket visual de verdad** (SVG con líneas conectoras, no una lista apilada de "vs"): las 4 hojas,
  las dos semis, la final y el trofeo cuando hay campeón — tu equipo con un aro dorado en cada casillero
  donde aparece. Encontré y corregí un bug real armándolo: las columnas quedaban superpuestas (sin
  espacio para las líneas) hasta que lo verifiqué con una imagen renderizada de verdad, no solo leyendo
  el código.
- Eliminación directa: semifinal 1, semifinal 2, final. La Copa **no admite empates de verdad**: si un
  cruce termina igualado, se define por **penales — 3 por lado, alternados, mano a mano** (mismo
  mecanismo que el penal de 3 faltas). Si siguen empatados después de los 3, se sigue una ronda más a
  la vez hasta que se decida — nunca hace falta rejugar el partido completo. La lógica de turnos/rondas
  es pura y está en `lib/game/shootout.ts` (testeada aparte de todo lo que toca DOM/canvas).
- El progreso queda guardado (`localStorage`): se puede cerrar la app a mitad de la Copa y seguir después.
- Desde la pausa de un partido de Copa, "reiniciar" repite ese mismo cruce y "salir" vuelve a la llave
  (no al menú de partido suelto).

### Modo demo (IA vs IA)

- **La app arranca directo en demo**, no en el menú — es lo primero que ves al abrir el juego.
- Botón "Modo demo (IA vs IA)" en el menú (para volver a verlo a propósito): elige dos equipos al azar
  y las dos IA juegan solas, sin ningún jugador humano — un "attract mode" de arcade. Toque y teclado no
  mueven a nadie (`MatchOptions.demo` hace que `ai.update` reciba `humanId: null`, así la IA controla
  los dos lados).
- Cuando termina, arranca otro partido demo solo, con otro par de equipos al azar — es un loop.
- **Tocar la pantalla o apretar cualquier tecla corta el demo**. Si es el demo de ARRANQUE, va al menú
  (no querés caer en un partido sin haber elegido nada); si lo abriste vos desde el botón del menú,
  arranca un partido de verdad (con los equipos que tengas elegidos en ajustes) — como "press start" en
  un arcade. Mientras el demo corre, "TOCÁ PARA JUGAR" parpadea abajo para que se note.
- Se sale desde la pausa (mismo botón de siempre): "Otro partido demo" reinicia, "Salir al menú" corta.

### Vista de cámara (botón de un toque)

- Nuevo botón en la barra del partido (al lado de pausa), con un texto chico que va cambiando: **SEG**
  (seguir la jugada, la cámara dinámica de siempre) → **TOT** (cancha completa, fija, se ven las dos
  porterías) → **3/4** (fija, más cerca que la completa) → vuelve a SEG. Un toque, un solo ciclo.
- Las vistas fijas (`Camera.frame()`) no siguen al puck ni al jugador — están centradas en la cancha,
  con un ancho fijo. "Seguir" es el único modo dinámico, y es exactamente el comportamiento que ya
  existía (no se tocó su lógica).

### Modo entrenamiento

- **Pista elegible**: madera, sintético o cemento (`segmented<Surface>`), antes de arrancar — faltaba
  del todo, ahora está arriba de todo en la pantalla de entrenamiento. Por defecto arranca en la pista
  de localía del equipo que tengas elegido en Ajustes.
- **Ahora con compañeros de verdad**: antes era plantilla de 1 (vos solo). Ahora es el equipo
  completo (4) de tu lado — `TeamAI.update()` ahora acepta qué lados mover (`sides`, nuevo parámetro,
  por defecto los dos); en entrenamiento se le pasa `[0]`: tus compañeros se mueven y posicionan solos
  como en un partido de verdad, el lado rival se queda quieto donde arrancó (no hay IA de rival de
  verdad en entrenamiento, a propósito — sigue siendo práctica libre, no un partido).
- Práctica de tiros libre, sin equipo rival (`MatchOptions.training`) — el otro lado queda quieto,
  no estorba.
- 3 configuraciones de arquero, elegibles antes de empezar: **arquero local**, **arquero visita**, o
  **sin arquero**. El motor ya soporta arquero por lado (`WorldConfig.goalies: [boolean, boolean]`,
  retrocompatible con el `boolean` de siempre — ambos o ninguno).
- **Se desbloquea ganando la Copa** (`saved.cup?.championId`), o con un atajo secreto: en escritorio,
  mantener Shift y tipear `0-1-7-8-9` desde la pantalla de equipos (se lee de la tecla física, `e.code`:
  con Shift, `e.key` es "!", ")"…); en celular, **tocar el logo del menú principal 7 veces seguidas**
  (menos de 1.5s entre toque y toque), como el "modo desarrollador" de Android — con una cuenta ("3
  toques más...") que aparece debajo del logo a partir del 3er toque. Los dos avisan con un diálogo.
- **El de celular pasó por DOS diseños que no funcionaban antes de este** — vale la pena dejarlo
  escrito para no repetir el error: primero mantener apretado 6s con un `setTimeout` (se perdía si el
  navegador reemplazaba el elemento a mitad de camino — pasa con cualquier re-render, manda
  `pointercancel`); después medir la duración real en vez del timer (mejor, pero seguía siendo un
  gesto sostenido de 6 segundos enteros, con el sistema operativo de por medio todo ese tiempo). El
  de toques repetidos es categóricamente más simple: cada toque es un evento chico y aislado, nada
  que sostener, nada que un re-render intermedio pueda arruinar a mitad de camino.
- **El logo del menú es la insignia real del juego** (arte de Ignacio, la del trofeo con los dos
  personajes y las banderas) — no un SVG simple de relleno que yo había dibujado antes. Se corrigió DOS
  veces: primero se reemplazó el rayo genérico por esta insignia, y encima se encontró que el ícono
  "maskable" (el que arma Android para el ícono adaptativo de la app instalada) tenía la insignia
  achicada con mucho margen oscuro alrededor — Android le agrega su PROPIO marco redondeado encima de
  eso, y el resultado era la insignia chica flotando dentro de un cuadrado, no un círculo limpio. Se
  regeneraron los 4 archivos de ícono desde el original en alta resolución (2048×2048): los normales
  tal cual, y el maskable agrandado 1.42x desde el centro antes de recortar, así el círculo se sale de
  los 4 bordes y no queda margen visible. Hay que reinstalar la PWA para verlo (el navegador cachea el
  ícono).
- Al desbloquearse, quedan disponibles a la vez el entrenamiento libre (elegir arquero) y "Practicar
  penales" (mano a mano contra el arquero rival, uno tras otro, siempre con el tanque lleno) — los dos
  viven en la misma pantalla de entrenamiento, así que un solo desbloqueo alcanza para los dos.
- Duración larga (10 min) pensada para practicar, no para competir; al terminar vuelve directo a elegir
  otra configuración, sin el diálogo de "¡GANASTE!/PERDISTE" (no tendría sentido, no hay rival).

## Requisitos y comandos

Node 22 o superior y pnpm.

```bash
pnpm install
pnpm dev                # http://localhost:3000   ?time=20 = partido de 20 s · ?debug=1 = Hz de pantalla y pasos/frame
pnpm build && pnpm start
pnpm typecheck          # tsc --noEmit
pnpm test               # tests unitarios (node:test): motor, reglas, IA, Copa, entrada, equipos y guardado
pnpm build:standalone   # genera juego.html: TODO el juego en un solo archivo, sin Next (útil para probar en un teléfono)
pnpm e2e                # extremo a extremo en Chromium (ver abajo)
pnpm audit:ui           # auditoría de botones en 7 tamaños de pantalla
```

`pnpm e2e` y `pnpm audit:ui` necesitan Playwright, que no es dependencia del proyecto:
`pnpm add -D playwright && pnpm exec playwright install chromium`. (No se dejó como `devDependency` porque
los archivos de bloqueo `package-lock.json` y `pnpm-lock.yaml` hay que regenerarlos con red; hacerlo a mano
los desincroniza y rompe `pnpm install --frozen-lockfile`.)

**Cómo funcionan los scripts** (`scripts/e2e-lib.mjs` es lo común): cada uno arma `juego.html`, y **cada
bloque abre una página NUEVA** (almacenamiento limpio) y arranca como un jugador — en el demo, toca, menú
(`bootToMenu`, que además verifica esos dos pasos). Si un bloque se cae, los demás igual corren, y el
proceso termina con código 1 si algo falló. `pnpm e2e` cubre: arranque/demo, menú, equipos (crear, editar,
borrar, persistir), partido suelto (sin tutorial, pausa, Esc, pestaña oculta, salir), dos dedos + final +
revancha, **pase de un dedo** (toque izquierdo, apoyo largo, vacío, lado derecho, flecha de borde),
**saque tras el gol** en los dos arcos, **tutorial de la Copa** (aparece, "Entendido", reiniciar no lo
repite, "No volver a mostrar", persiste) y los **dos atajos** del entrenamiento. `pnpm audit:ui` recorre
todas las pantallas (incluido el menú con el entrenamiento desbloqueado y el diálogo del tutorial) en 7
tamaños. Los toques se simulan con eventos de puntero: **no reemplazan probar con un pulgar real**. Ojo al
escribir tests con la IA en marcha: los compañeros que no controlás se mueven solos, así que hay que leer su
posición justo antes de tocarlos (los casos de geometría exacta viven en los tests unitarios).

## Arquitectura

```
lib/engine   Motor puro (sin DOM): metros y segundos, paso fijo de 120 Hz, puck por sub-pasos, crease,
             posesión, faltas, porteros (con corte de ángulo), IA de equipo (ai.ts), ayuda de puntería
             (aim.ts) y cámara.
lib/game     Lo que toca el navegador durante un partido: entrada de dos dedos (input.ts), dibujo en
             canvas (draw.ts), efectos de gol —pantallazo, confeti, replay en cámara lenta— (effects.ts),
             sonido (sfx.ts) y el bucle del partido (match.ts).
lib/app      Menú, selección y editor de equipos, modo Copa (cup.ts), guardado en localStorage
             (storage.ts), pausa y pantalla final (app.ts). Sin framework: es un módulo que se monta
             en un <div>.
app/page.tsx Solo aloja lib/app en un <div> y lo limpia al desmontar.
scripts/     build-standalone.mjs · e2e.mjs · audit-ui.mjs
tests/       node:test, organizados en engine/ · game/ · app/ (incluye cup.test.ts). Se compilan con
             tsc a .test-build/ (no hay dependencias de test nuevas).
```

Decisiones de diseño que vale la pena conocer antes de tocar el motor:

- **La velocidad no depende de la pantalla.** El motor avanza en pasos fijos de 120 Hz: a 30, 60 o 144 Hz
  de pantalla se juega igual (`FixedStepper` interpola para dibujar suave entre pasos).
- **El puck no atraviesa nada.** Se mueve en sub-pasos de como máximo `PUCK.maxSubstep` metros, así que
  porterías, postes y la crease funcionan a cualquier velocidad.
- **Un gol nunca depende de en qué instante exacto pasó algo.** Se detecta tanto por cruce de línea en
  movimiento como por posición (puck ya colocado dentro de la boca), para que teletransportar el puck al
  llevarlo con el palo no deje agujeros de reglas.
- **Todo lo que decide un empate o un contacto es simétrico**: la misma función de reglas corre para el
  jugador humano y para la IA.
- **El motor no vive dentro de React ni de ningún framework**: `lib/engine` no importa nada de `lib/app`
  ni del DOM, así que nada de eso puede reiniciarlo por accidente.
- **Los equipos se identifican por `id`, nunca por nombre**, y la plantilla se copia en profundidad al
  guardar (el formulario y el equipo guardado nunca comparten objetos).
- **Cada botón se puede alcanzar**: los diálogos dejan el fondo inerte, los objetivos táctiles miden 44 px
  o más y la barra fija de abajo no tapa lo que se enfoca con el teclado (lo comprueba `pnpm audit:ui`).
  El menú pasa a **dos columnas en horizontal bajo** (con el entrenamiento desbloqueado tiene 7 botones y en
  una columna se salía de la pantalla en 568×320) y compacta los espacios en vertical chico (320×568);
  `audit:ui` lo prueba también con el entrenamiento desbloqueado.

## Ajustar la sensación de juego

Casi todo vive en `lib/engine/constants.ts`: velocidad y aceleración por tipo de jugador, fricción por
pista, tamaño de la portería, radio de la crease (`CREASE_RADIUS`, en `geometry.ts`), umbral de falta y
castigo, comportamiento del arquero (`GOALIE`, incluye cuánto y desde dónde avanza a cerrar ángulo) y
cámara. La potencia de los deslizamientos está en `powerFromFlick` (`lib/engine/aim.ts`), la dificultad
del rival en `NIVEL_SKILL` (`lib/game/match.ts`), y la intensidad del confeti/pantallazo/replay en
`lib/game/effects.ts`.

## Estado de verificación

**Verificado con red real** (`pnpm install` funciona en este entorno desde hace varias rondas, no hizo
falta seguir asumiendo lo contrario): `tsc --noEmit` limpio, **217 tests, todos pasan**
(`node --test`, motor/reglas/IA/Copa/entrenamiento/entrada/equipos/guardado). El dibujo del HUD (marcador,
combo, energía en el cuerpo) también se verificó con capturas reales, no solo matemática: se instaló
`node-canvas` momentáneamente (nunca quedó como dependencia del proyecto) para renderizar `drawHud` y
`drawScene` fuera de un navegador y generar PNGs de verdad en 844×390 y 812×375.

`next build` llega hasta el final salvo por un solo punto: este sandbox bloquea específicamente
`fonts.googleapis.com` (403) — Orbitron y Press Start 2P no se pueden descargar acá. Todo lo demás del
build (Turbopack, tipos, bundling) corre limpio. Con red sin esa restricción específica debería compilar
entero.

**Sin verificar todavía**, porque este entorno no tiene navegador para abrir la app real:
- Nada de lo visual **interactivo** con dedos reales: gestos de dos dedos, WASD desde un teclado físico,
  gestos táctiles del modo demo. (Sí se verificaron en Chromium con capturas: la placa, el aura, las
  flechas, los peinados y los dos atajos secretos del entrenamiento.)
- Un teléfono físico (audio real, pantalla completa, iOS Safari en particular).
- La sensación de juego con las manos: energía, super tiro, combo, curva del tiro, el peso de la pelota
  — todo esto se ajustó mirando números y corridas instrumentadas, nunca jugando de verdad.
- Dedos y teléfono reales. `pnpm e2e` (74 chequeos) y `pnpm audit:ui` (sin hallazgos en 7 tamaños) se
  corrieron en Chromium de escritorio con toques simulados, no en un dispositivo.

Antes de dar por buena esta versión conviene correr, con red disponible:

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm dev
```

y jugar unas partidas de verdad — Copa, demo, entrenamiento, un gol de combo — con las manos.

## Pendiente

- **Segundo jugador humano, en otro celular (Android/iPhone)**: la mejora de mayor impacto según la
  valoración de arriba. Diseñada, no implementada — protocolo, arquitectura recomendada (relay
  WebSocket + física autoritativa en un solo lado) y qué archivos tocaría, en
  `docs/DEUDA-multijugador-2-dispositivos.txt`.
- **Los 3 puntos de la ronda de análisis, hechos, con un hallazgo real en el camino**:
  1. Hecho: la banda y la línea de tiro ahora parten del mismo origen (la posición actual del jugador
     en pantalla) — ya no se desfasan si el jugador se mueve mientras se apunta.
  2. Hecho: `SKATER.shotSideOffset` — la pelota sale corrida a un costado del cuerpo, no del centro
     (mismo lado que ya elige el seguimiento visual del palo, para que las dos cosas concuerden).
     **Encontré una interacción real en el camino**: el primer valor que probé (0.16m) volvía a tapar
     el penal a la esquina (0% de goles otra vez) — el corrimiento lateral, sumado a lo ajustado que
     ya está el margen del arquero parado en la línea, alcanzaba para devolver la pelota a su alcance.
     Medí varios valores contra el motor real: hay un salto brusco entre 0.10 (sigue entrando bien) y
     0.11 (vuelve a 0%) — no es un degradado suave, es un límite geométrico afilado. Se dejó en 0.08,
     con margen real por debajo de ese límite, no pegado al borde. Test nuevo que blinda esto en
     `possession.test.ts`.
  3. Hecho: botón "🔄 Cambiar de jugador" en la barra del partido — pasa al siguiente compañero en
     cancha. No reusa `receiverLock` (el mecanismo del pase en el aire) a propósito: ese se suelta
     apenas alguien agarra la pelota, y este botón tiene que aguantar todo el juego abierto. Sin
     verificar con DOM real (como el resto de los controles internos de `match.ts`).
- **Vista tipo Duck Hunt para apuntar penales de cerca**: idea de Ignacio para hacer más preciso apuntar
  a una esquina exacta durante un penal (hoy usa el mismo gesto que un tiro cualquiera). Se propuso como
  solución a "los penales nunca son goles" — esa parte ya se resolvió de raíz (era un bug de física del
  arquero, no de puntería, ver "Penal" en Reglas y física), así que esto ya no es urgente. Sigue siendo
  una buena mejora de precisión si se quiere retomar: una cámara/interfaz aparte, encarada al arco, solo
  para el momento del penal.
- **Pase de un dedo**: hecho (toque rápido sobre el compañero; ver "Cómo se juega"). Falta probarlo con
  el pulgar real en un teléfono: el umbral de "toque" (`TAP_MAX_DIST` 5 % de la altura, `TAP_MAX_TIME`
  0.3 s en `input.ts`) y la zona tocable (~40 px) son valores razonables, no ajustados jugando. Si un
  arranque del joystick se siente que "pasa solo", se bajan esos dos números.
- **Identificar compañero de mi propio equipo**: resuelto en lo esencial (aura, mira de pase, flechas de
  borde; ver arriba). Por decisión de diseño el aura es solo del equipo del jugador (los rivales oscuros
  sobre pista azul siguen con poco contraste). Sin probar con dedos reales en un teléfono.
- **Los botones arriba a la derecha** también pueden tapar a un jugador que pase por esa esquina (son
  semitransparentes); si molestan, la alternativa es dejar solo pausa y mover vista/pantalla/sonido a la
  pantalla de pausa.
- **Corrección de audio**: el archivo `...protest-02-58325.mp3` NO es abucheo/protesta (lo parecía por
  el nombre) — Ignacio confirmó que son tambores de estadio. Se reprocesó como `crowd-drums.mp3` y se
  conectó al momento de tensión del penal (`reactionFor` en `crowd-mix.ts`). El "abucheo cuando anota el
  rival" que se había armado sobre ese archivo se sacó: hoy el gol del rival apaga el entusiasmo del
  público (silencio), no hay ningún audio real de abucheo todavía. `...ja-ganhou-17080.mp3` tampoco es
  un cántico puntual — es público gritando, en general; se sigue usando igual para el festejo de
  partido ganado, pero la documentación ya no asume que dice algo específico.
- **Banda de la galería** (bombo, redoblante, trompetas, como un CONJUNTO musical): sin hacer. Los
  tambores de estadio ya están (recién agregados, ver arriba), pero eso es ambiente de multitud, no una
  banda tocando — falta decidir si se sintetiza o se usa música (los "MIDI clásicos" requieren un
  secuenciador y, por los derechos, versiones propias o de dominio público real).
- **Playwright**: no se suma como dependencia — a pedido de Ignacio, alcanza con el agradecimiento en
  los créditos.
- **Chips de expulsados** (tarjeta azul, con cuenta atrás de segundos) que sí tenía la barra vieja —
  no entraban en la placa chica nueva. El conteo de faltas por equipo se mantiene, el detalle de
  "quién y cuánto le queda" quedó afuera.
- **Trofeo de Copa + festejo especial al ser campeón**: hoy el premio de entrenamiento se desbloquea
  en silencio (`saved.cup?.championId`), sin ninguna gráfica ni aviso propio más allá del fin de
  partido de siempre.
- **Sin torneos de más de 4 equipos.** La Copa es a bracket fijo de 4 (2 semis + final); no hay liga,
  grupos, ni un número distinto de equipos todavía.
- `app/globals.css` se podría simplificar más (solo lo importa `app/layout.tsx`; el juego trae sus
  propios estilos) — sin tocar. `app/lab/` ya se eliminó (Ronda 39, estaba vacío).
