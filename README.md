# Liga Funko-Patín Arcade

Hockey sobre patines arcade en una **pista reglamentaria de 40 × 20 m**, pensado para el teléfono en horizontal y para jugarse con **dos dedos**.

## Cómo se juega

| Dedo | Qué hace |
| --- | --- |
| **Izquierdo** (mitad izquierda de la pantalla) | Joystick flotante: nace donde tocas y mueve al jugador que lleva el puck. |
| **Derecho** (mitad derecha) | Un deslizamiento (*flick*) pasa o tira. La **dirección** del deslizamiento es la del pase; la **velocidad** es la potencia (roce suave = pase, latigazo = tiro). Un **toque** suelto es pase automático al mejor compañero. |

- Cuando un pase llega a un compañero, **el control salta a él sin soltar el dedo**.
- Mientras arrastras el dedo derecho se dibuja la trayectoria: verde si apunta a un compañero, amarilla si va a portería.
- Ajustes: modo zurdo (roles invertidos), sonido, nivel del rival (fácil / normal / difícil) y duración (1, 2, 3 o 5 min).
- En escritorio funciona con el mouse igual (mitad izquierda mueve, mitad derecha desliza). `Esc` pausa.
- Si giras el teléfono en vertical el partido se congela y pide girar; la pista es horizontal.

### Reglas

- **Faltas y tarjeta azul** valen igual para ti y para la IA: un golpe fuerte (`RULES.foulImpact`) en el que casi todo el cierre lo pone el agresor saca al infractor 25 s de juego. Máximo 2 expulsados por equipo y nunca menos de 2 patinadores en pista. Un choque de frente entre dos que corren no es falta.
- **Robo**: un rival que llega de frente al portador se lo quita; por la espalda no, el cuerpo protege el puck. Un golpe fuerte le hace soltar el puck.
- **Pases fuertes**: por encima de ~15 m/s el puck rebota en el receptor en vez de controlarse.
- **Pistas** (la del equipo local): madera (equilibrada), sintético (todo se desliza más) y cemento (frena rápido).
- **Plantillas**: 4 jugadores por equipo, cada uno *normal*, *pesado* (aguanta golpes, lento) o *veloz* (ágil, liviano). El primero es el capitán.

## Requisitos y comandos

Node 22 o superior y pnpm.

```bash
pnpm install
pnpm dev                # http://localhost:3000   ?time=20 = partido de 20 s · ?debug=1 = Hz de pantalla y pasos/frame
pnpm build && pnpm start
pnpm typecheck          # tsc --noEmit
pnpm test               # tests unitarios (node:test): motor, IA, reglas, entrada, equipos y guardado
pnpm build:standalone   # genera juego.html: TODO el juego en un solo archivo, sin Next (útil para probar en un teléfono)
pnpm e2e                # extremo a extremo en Chromium con dos dedos simulados
pnpm audit:ui           # auditoría de botones en 7 tamaños de pantalla
```

`pnpm e2e` y `pnpm audit:ui` necesitan Playwright, que no es dependencia del proyecto:
`pnpm add -D playwright && pnpm exec playwright install chromium`.

## Arquitectura

```
lib/engine   Motor puro (sin DOM): metros y segundos, paso fijo de 120 Hz, puck por sub-pasos, posesión,
             faltas, porteros, IA de equipo (ai.ts), ayuda de puntería (aim.ts) y cámara.
lib/game     Lo que toca el navegador durante un partido: entrada de dos dedos (input.ts), dibujo en canvas
             (draw.ts), sonido (sfx.ts) y el bucle del partido (match.ts).
lib/app      Menú, selección y editor de equipos, guardado en localStorage, pausa y pantalla final (app.ts).
             Sin framework: es un módulo que se monta en un <div>.
app/page.tsx Solo aloja lib/app en un <div> y lo limpia al desmontar.
scripts/     build-standalone.mjs · e2e.mjs · audit-ui.mjs
tests/       node:test. Se compilan con tsc a .test-build/ (no hay dependencias de test nuevas).
```

Decisiones que evitan los problemas del prototipo original:

- **La velocidad no depende de la pantalla.** El motor avanza en pasos fijos: a 30, 60 o 144 Hz se juega igual.
- **El puck no atraviesa nada.** Se mueve en sub-pasos, así que porterías y postes funcionan a cualquier velocidad.
- **Nada reinicia el puck por accidente.** El motor no vive dentro de React: ningún cambio de estado lo toca.
- **Los equipos se identifican por `id`, no por nombre**, y la plantilla se copia en profundidad al guardar.
- **Cada botón se puede alcanzar**: los diálogos dejan el fondo inerte, los objetivos táctiles miden 44 px o más y la barra fija de abajo no tapa lo que se enfoca con el teclado (lo comprueba `pnpm audit:ui`).

## Ajustar la sensación de juego

Todo está en `lib/engine/constants.ts`: velocidad y aceleración por tipo de jugador, fricción por pista, tamaño de la portería,
umbral de falta y castigo, portero y cámara. La potencia de los deslizamientos está en `powerFromFlick` (`lib/engine/aim.ts`)
y la dificultad del rival en `NIVEL_SKILL` (`lib/game/match.ts`).

## Estado de verificación

**Verificado** (al momento de esta reescritura):

- `pnpm test`: 82 tests, todos pasan.
- `pnpm e2e`: 25 comprobaciones en Chromium (menú, equipos, persistencia, pausa, salir, dos dedos, final y revancha), sin errores de consola.
- `pnpm audit:ui`: sin hallazgos en 7 tamaños de pantalla, de 320×568 a 1440×900.
- Los tipos de `app/page.tsx` y `app/layout.tsx` se comprobaron contra versiones simplificadas de React y Next.

**Sin verificar todavía**:

- `pnpm build` de Next: la reescritura se hizo sin red para instalar dependencias. Corre `pnpm install && pnpm typecheck && pnpm build` antes del primer despliegue.
- Un teléfono físico (dos dedos reales, iOS Safari: audio y pantalla completa; iPhone no ofrece pantalla completa y el botón se oculta a propósito).
- La dificultad de los tres niveles se calibró con un jugador simulado, no con personas.

## Pendiente

- **Dependencias sin uso.** Del prototipo original quedaron instaladas librerías de UI que ya nada importa. No se tocaron para no desincronizar `pnpm-lock.yaml`. Con red, se quitan con:

  ```bash
  pnpm remove @hookform/resolvers @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip class-variance-authority clsx cmdk date-fns embla-carousel-react input-otp lucide-react next-themes react-day-picker react-hook-form react-resizable-panels recharts sonner tailwind-merge vaul zod
  ```

  Después se puede simplificar `app/globals.css` (solo `app/layout.tsx` lo importa; el juego trae sus propios estilos).
- La IA rival no tiene árbitro visible: la regla simétrica de faltas lo reemplaza.
