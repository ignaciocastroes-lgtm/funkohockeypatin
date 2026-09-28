# Relay del 2 jugadores — cómo publicarlo

El 2P anónimo (sala con código de 5 caracteres, sin cuentas ni Google) necesita **un** servidor chico
que junte a los dos celulares. No sabe nada del juego: por cada sala reenvía lo que manda un jugador al
otro. Es `relay/server.cjs`: **solo Node, cero dependencias**.

## Qué está probado y qué no
- Probado en este repo (`npm test`): protocolo y validación, snapshots, sesiones host/invitado y el relay
  **real** por loopback con WebSocket nativo de Node.
- Probado con `npm run e2e:2p`: **dos navegadores Chromium reales** contra el relay local: crear sala →
  unirse con el código → los dos entran al partido → cada uno ve sus botones → si el host se va, el
  invitado se entera. Cero errores de página.
- **NO probado**: dos teléfonos de verdad (Android + iPhone) por internet, ni la latencia real. Ver «Prueba
  con dos teléfonos» abajo. Sin eso no digas que «funciona en iPhone».

## Correrlo
```bash
node relay/server.cjs                     # PORT=8787 por defecto
PORT=8080 ALLOWED_ORIGINS=https://tu-juego.example node relay/server.cjs
docker build -t fp-relay relay && docker run -p 8787:8787 fp-relay
curl http://localhost:8787/healthz         # {"ok":true,"rooms":0}
```
Variables: `PORT`, `HOST`, `ALLOWED_ORIGINS` (coma; **ponelo en producción**), `MAX_ROOMS` (1000),
`ROOM_TTL_MS` (una sala esperando rival vence a los 10 min).

## Publicarlo (lo único que hace falta de afuera)
1. Cualquier hosting que aguante un proceso Node con WebSocket y te dé **TLS** (una URL `wss://`): un VPS
   chico con Caddy/nginx, o una plataforma de contenedores (el `Dockerfile` está listo). Elegí uno que **no
   se duerma** por inactividad: una sala que espera rival tiene que encontrar el servidor despierto.
2. El juego se sirve por `https://`, así que el relay TIENE que ser `wss://` (un `ws://` lo bloquea el
   navegador como contenido mixto, sobre todo Safari).
3. Decile al juego dónde está el relay, de cualquiera de las dos formas:
   - Build de Next: variable de entorno `NEXT_PUBLIC_FP_RELAY_URL=wss://relay.tu-dominio.example`.
   - `juego.html` suelto: antes de cargar el script, `<script>window.FP_RELAY_URL="wss://relay.tu-dominio.example"</script>`.
   Sin esto, «2 jugadores» avisa que no hay servidor configurado (no se rompe nada).

## Costo y límites (medido)
- Un snapshot pesa ~830 B y salen 20 por segundo: **~16 KB/s** del host al invitado. Un partido de 2
  minutos ≈ **1,9 MB** en total por el relay. Mil partidos ≈ 2 GB.
- Topes del relay: mensajes de hasta 16 KB, 120 mensajes/seg por conexión, 30 intentos/min por IP, 1000
  salas, sala esperando rival vence a los 10 min. Un código adivinado no da nada más que sentarse a jugar
  con el que creó la sala (28 millones de códigos posibles, salas efímeras).
- El relay **no guarda nada** y no ve cuentas: no hay datos personales en juego.

## Cómo funciona (para retomar)
- El **host** (quien crea la sala) simula todo con `stepWorld`; el **invitado** solo manda su stick
  (`in`) y sus botones (`btn`) y dibuja los snapshots (`snap`) y eventos (`ev`) que recibe. Un solo motor
  hace la física: no hay divergencia entre Android e iPhone (ver `DEUDA-multijugador-2-dispositivos.txt`, §4).
- Todo lo que llega por red se valida en `lib/net/protocol.ts` (tipos, rangos, largos, colores, ids de
  patinador): un mensaje malo se descarta, nunca lanza. Los nombres de equipo del rival se aceptan solo sin
  `<`, `>` ni caracteres de control.
- Códigos: `lib/net/room.ts` (alfabeto sin 0/O/1/I/L). QR/link de invitación: `?sala=CODIGO`.
- Si el invitado se va a mitad de partido, el host sigue contra la IA. Si se va el host, el invitado ve el
  cartel «Se cortó la conexión».

## Limitaciones conocidas del 2P (honestas)
- **Sin pausa** en línea (el otro juega en vivo): el menú de pausa se muestra encima y la cancha sigue.
- **El host no puede cambiar de pestaña**: el navegador congela el juego y el invitado ve todo quieto. Para
  que la pantalla no se apague sola se pide `navigator.wakeLock` durante el 2P (implementado, **sin probar en
  un teléfono real**; si el aparato no lo soporta, se juega igual pero puede apagarse).
- El invitado **no tiene repetición de gol** (recibe 20 fotos por segundo y la repetición asume 120).
- El invitado juega el lado derecho y ataca hacia la izquierda (misma cámara que el host, sin espejar).
- Sin reconexión: si se corta, se termina el partido.
- El invitado ve al host con ~50–100 ms de retraso (snapshot cada 50 ms + red). Interpolado, pero no es
  «sin latencia»; sirve para un partido casual, no para competencia.

## Prueba con dos teléfonos (hacer antes de anunciar)
1. Relay publicado en `wss://`, juego apuntando a él.
2. Un Android (Chrome) crea la sala; un iPhone (Safari) se une con el código y con el QR. Después al revés.
3. Datos móviles en uno y WiFi en el otro. Jugar 2 minutos completos. Mirar: ¿se corta?, ¿la pelota salta?,
   ¿se lee el botón en pantalla chica?, ¿el iPhone mantiene el socket con la pantalla apagándose?
4. Anotar el retraso percibido; recién ahí decidir si hace falta WebRTC o predicción local.
