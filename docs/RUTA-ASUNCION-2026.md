# Ruta a Asunción 2026 — una fecha, no un milagro

Estado al **28-sep-2026**. Asunción 2026 = **World Skate Games, del 2 al 18 de octubre** (apertura el 2,
clausura el 18). Fuentes consultadas hoy: World Skate (worldskate.org, sorteo del hockey patín) y prensa
argentina/paraguaya. **Las fechas exactas del hockey varían entre fuentes; confirmalas en worldskate.org.**

| Ventana | Qué juega | Fuente |
|---|---|---|
| 2 oct | Apertura de los Games | Prensa Mercosur / World Skate |
| 3–10 oct | Mundial **Femenino** y **Sub-19** (final el 10) | World Skate |
| 10–18 oct | Mundial **Masculino** (finales 17–18) | World Skate |
| (12 oct) | Una nota de Tiempo de San Juan da el inicio del hockey el 12; AAD dice 11–18 | ⚠ discrepan: verificar |

Contexto: **Chile** está en el grupo del Mundial femenino, pero quedó afuera del Sub-19 por problemas
presupuestarios (Argentina Amateur Deporte, 28-jul-2026).

## Lo que ya está hecho y verificado (hoy)
- Un solo esquema de control (stick + 4 botones, ataque/defensa), sin honda. Tests: 290+.
- Portugués (Portugal) y español. Selector ES/PT en el menú, detecta el idioma del navegador.
- QR de ardisport.cl (Créditos y pantalla de Ardisport del Cantoni), decodificado con lector real.
- Club chileno real cargado: **Club de Hockey de Huachipato** (permiso pendiente, ver `CLUB-CHILENO.md`).
- 2P anónimo con código: relay + protocolo + sala + partido, probado con **dos Chromium reales**.

## Lo que falta y solo lo pueden hacer personas (en orden)
1. **Publicar el relay en `wss://`** y apuntar el juego a él (`docs/RELAY.md`). Es el único bloqueo real del 2P.
2. **Probar con dos teléfonos reales** (Android + iPhone, datos móviles + WiFi). Sin esto no se anuncia.
3. **Mandar el pedido a Huachipato** (borrador en `CLUB-CHILENO.md`). Si contestan que no, se saca la entrada.
4. **Que una persona de Portugal/Angola lea el portugués.** Lo traduje yo: es correcto pero puede sonar raro.
5. Publicar el juego y verlo **a ojo en un celular**: nada visual se vio antes en un aparato real (solo en
   Chromium de escritorio con pantalla de 844×390).

## Hitos con fecha (propuesta)
| Cuándo | Meta | Criterio para darlo por cumplido |
|---|---|---|
| **antes del 2-oct** | Relay publicado + prueba de 2 teléfonos | Un partido completo Android↔iPhone sin cortes |
| **3–10 oct** | «Lanzamiento suave»: amigos, clubes, ardisport.cl | 10 partidos 2P jugados; lista de bugs reales |
| **10–16 oct** | Arreglos con lo que salga + pulido del portugués | Cero cortes por causa nuestra en las pruebas |
| **17–18 oct** | Finales del masculino: difusión principal | El juego se puede compartir con un link o QR y entrar sin instalar nada |

## Qué NO prometer para esta fecha
Cuentas, ranking online, emparejamiento con desconocidos, espectadores, reconexión, torneos online. Todo
eso es posible después; nada de eso hace falta para «dos amigos juegan con un código».

## Riesgos honestos
- **Hosting que se duerme** → la sala no encuentra el relay. Elegir uno que no se duerma.
- **iPhone con pantalla que se apaga** cortando el socket (sobre todo el host). Se pide `wakeLock`, pero no está probado en un aparato real.
- **Redes móviles con NAT/proxy** raras: el relay por WebSocket es el camino más robusto (no usa P2P),
  pero no está medido en redes reales.
- **Marca:** «World Skate Games / Asunción 2026» es una marca de terceros. El juego solo puede *mencionar*
  la fecha; no usar su logo, mascota ni nombre como si fuera oficial sin permiso.
- **Club real:** usar el nombre de Huachipato sin OK es un riesgo; por eso figura como «pendiente».
