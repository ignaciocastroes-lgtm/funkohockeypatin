# Liga Funko-Patín Arcade

Hockey sobre patines (rink hockey) arcade, en una pista reglamentaria de **40 × 20 m**, pensado para
jugarse en el teléfono en horizontal con **dos dedos**. Incluye partido suelto y un modo **Copa** de
eliminación directa a 4 equipos.

## Cómo se juega

| Dedo | Qué hace |
| --- | --- |
| **Izquierdo** (mitad izquierda de la pantalla) | Joystick flotante: nace donde tocás y mueve al jugador que lleva el puck. |
| **Derecho** (mitad derecha) | Un deslizamiento (*flick*) pasa o tira. La **dirección** del deslizamiento es la del pase; la **velocidad** es la potencia (roce suave = pase, latigazo = tiro). Un **toque** suelto es pase automático al mejor compañero. |

- Cuando un pase llega a un compañero, el control salta a él sin soltar el dedo.
- Mientras arrastrás el dedo derecho se dibuja la trayectoria: verde si apunta a un compañero, amarilla si va a portería.
- En escritorio funciona igual con el mouse (mitad izquierda mueve, mitad derecha desliza). `Esc` pausa.
- Si girás el teléfono a vertical el partido se congela y pide girar: la pista es horizontal.
- Ajustes: modo zurdo, sonido, nivel del rival (fácil / normal / difícil) y duración (1, 2, 3 o 5 min).

### Reglas y física

- **Patinadores sin casco, arquero con casco.** Es hockey sobre patines, no hielo: los jugadores de línea
  van con el pelo al aire (visto desde arriba); el arquero es el único con casco, rejilla y hombreras.
- **Crease.** Ningún patinador puede pararse dentro de un semicírculo de 1.75 m frente a cada portería:
  no hay tiros a quemarropa parado en la boca del arco, hay que tirar desde más lejos.
- **Arquero con ángulos, no solo reflejos.** Además de moverse en el eje de la portería, sale a cerrar el
  ángulo cuando el atacante se acerca (hasta 0.55 m más adelante de su posición base) y por defecto se
  para sobre la línea imaginaria puck→centro de la portería, no solo detrás del disco.
- **Faltas y tarjeta azul** valen igual para el jugador humano y para la IA: un golpe fuerte donde casi
  todo el cierre lo pone el agresor saca al infractor 25 s de juego. Máximo 2 expulsados por equipo y
  nunca menos de 2 patinadores en pista. Un choque de frente entre dos que corren no es falta.
- **Robo**: un rival que llega de frente al portador se lo quita; por la espalda no, el cuerpo protege el
  puck (ahí lo que corresponde es un golpe que se lo hace soltar, no un robo limpio).
- **Pases fuertes**: por encima de ~15 m/s el puck rebota en el receptor en vez de controlarse.
- **Gol**: se detecta tanto si el puck cruza la línea en movimiento libre como si queda colocado dentro de
  la boca (por ejemplo, al llevarlo con el palo hasta el fondo), sin depender de en qué frame exacto pasó.
- **Recogida del puck**: si dos patinadores llegan a la vez, se la queda el que está más cerca del disco,
  no el primero en una lista interna.
- **Reloj**: cuando llega a 0:00 con el puck suelto o volando, hay 1.5 s de gracia antes de pitar el final,
  para que una jugada ya en marcha (un tiro, un rebote) pueda terminar en vez de cortarse en seco.
- **Pistas** (la del equipo local manda): madera (equilibrada), sintético (todo se desliza más) y cemento (frena rápido).
- **Plantillas**: 4 jugadores por equipo, cada uno *normal*, *pesado* (aguanta golpes, lento) o *veloz* (ágil, liviano). El primero es el capitán.

### Al meter un gol

- Pantallazo del color de quien anotó.
- Confeti disparado desde la boca de la portería.
- Replay de ~2 s en cámara lenta de la jugada que terminó en gol, con los mismos gráficos del partido
  (no una versión simplificada), durante la pausa de festejo.

### Modo Copa

- Elegís 4 equipos (de fábrica o creados por vos); el sorteo arma las dos semifinales al azar.
- Eliminación directa: semifinal 1, semifinal 2, final. La Copa **no admite empates**: si un cruce
  termina igualado hay que jugarlo de nuevo, no avanza nadie.
- El progreso queda guardado (`localStorage`): se puede cerrar la app a mitad de la Copa y seguir después.
- Desde la pausa de un partido de Copa, "reiniciar" repite ese mismo cruce y "salir" vuelve a la llave
  (no al menú de partido suelto).

## Requisitos y comandos

Node 22 o superior y pnpm.

```bash
pnpm install
pnpm dev                # http://localhost:3000   ?time=20 = partido de 20 s · ?debug=1 = Hz de pantalla y pasos/frame
pnpm build && pnpm start
pnpm typecheck          # tsc --noEmit
pnpm test               # tests unitarios (node:test): motor, reglas, IA, Copa, entrada, equipos y guardado
pnpm build:standalone   # genera juego.html: TODO el juego en un solo archivo, sin Next (útil para probar en un teléfono)
pnpm e2e                # extremo a extremo en Chromium con dos dedos simulados
pnpm audit:ui           # auditoría de botones en 7 tamaños de pantalla
```

`pnpm e2e` y `pnpm audit:ui` necesitan Playwright, que no es dependencia del proyecto:
`pnpm add -D playwright && pnpm exec playwright install chromium`.

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

## Ajustar la sensación de juego

Casi todo vive en `lib/engine/constants.ts`: velocidad y aceleración por tipo de jugador, fricción por
pista, tamaño de la portería, radio de la crease (`CREASE_RADIUS`, en `geometry.ts`), umbral de falta y
castigo, comportamiento del arquero (`GOALIE`, incluye cuánto y desde dónde avanza a cerrar ángulo) y
cámara. La potencia de los deslizamientos está en `powerFromFlick` (`lib/engine/aim.ts`), la dificultad
del rival en `NIVEL_SKILL` (`lib/game/match.ts`), y la intensidad del confeti/pantallazo/replay en
`lib/game/effects.ts`.

## Estado de verificación

**Verificado en este entorno** (sin acceso a red, así que sin `pnpm install` real): se compiló todo el
código de `lib/` y `tests/` con `tsc` contra `tsconfig.test.json` y se corrió con `node --test` — **89
tests, todos pasan** (motor, reglas, IA, Copa, entrada, equipos y guardado).

**Sin verificar todavía**, porque este entorno no tiene navegador ni red para instalar Next/Playwright:

- `pnpm install && pnpm build` de Next — nunca se corrió acá.
- Nada de lo visual en un navegador real: el arte sin casco/con pelo de los patinadores, el arquero
  equipado, el confeti, el pantallazo y el replay en cámara lenta solo se revisaron leyendo el código y
  compilando tipos, no se vieron en pantalla.
- La pantalla de Copa (elegir equipos, ver la llave, jugar cada cruce) — la lógica de `cup.ts` tiene
  tests, pero la interfaz en `app.ts` nunca se abrió en un navegador.
- `pnpm e2e` y `pnpm audit:ui` (necesitan Playwright).
- Un teléfono físico (dos dedos reales, audio y pantalla completa en iOS Safari).
- La dificultad de los tres niveles y el nuevo comportamiento del arquero se ajustaron mirando números y
  tests, no jugando de verdad contra una persona.

Antes de dar por buena esta versión conviene correr, con red disponible:

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm dev
```

y abrir la Copa y un gol al menos una vez con las manos.

## Pendiente

- **Dependencias sin uso.** Siguen instaladas varias librerías de UI (Radix, etc.) que nada del código
  importa. No se tocaron para no desincronizar `pnpm-lock.yaml` sin poder correr `pnpm install`. Con red:

  ```bash
  pnpm remove @hookform/resolvers @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip class-variance-authority clsx cmdk date-fns embla-carousel-react input-otp lucide-react next-themes react-day-picker react-hook-form react-resizable-panels recharts sonner tailwind-merge vaul zod
  ```

  Después se puede simplificar `app/globals.css` (solo lo importa `app/layout.tsx`; el juego trae sus
  propios estilos) y revisar `app/lab/`, que está vacío.
- **Robo por la espalda**: la regla ("por la espalda no se puede robar") depende de que el cuerpo del
  patinador tape el puck porque el palo lo lleva delante; es un efecto emergente de la geometría, no una
  comprobación explícita de ángulo. Funciona, pero conviene revisarlo si se cambia `stickReach` o el
  tamaño de los patinadores.
- **Sin torneos de más de 4 equipos.** La Copa es a bracket fijo de 4 (2 semis + final); no hay liga,
  grupos, ni un número distinto de equipos todavía.
- **Sin desempate automático real**: un cruce de Copa empatado no ofrece penales ni muerte súbita, solo
  "jugar de nuevo" el partido completo.
