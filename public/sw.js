// Service worker de Liga Funko-Patín Arcade.
// Objetivo: (1) que Android la ofrezca como instalable (requisito técnico de las PWA) y
// (2) que, una vez instalada, el partido funcione sin conexión (no depende de la red para jugar).
//
// Estrategia simple a propósito (sin build tooling ni lista de hashes que mantener):
//  - Navegación (el documento HTML): red primero, con la última copia cacheada como respaldo offline.
//  - Todo lo demás del mismo origen (JS/CSS con hash, audio, íconos): "stale-while-revalidate" —
//    responde YA con lo que haya en caché (si hay) y de paso pide la versión nueva para la próxima vez.
//    Así el primer partido jugado online deja todo cacheado para jugar offline después.
//
// Subí CACHE_VERSION cada vez que quieras invalidar cachés viejas de un deploy anterior.
const CACHE_VERSION = "fp-v1"

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/audio/crowd-victory.mp3",
  "/audio/crowd-bed-c.mp3",
  "/audio/crowd-bed-a.mp3",
  "/audio/crowd-react.mp3",
  "/audio/crowd-energy.mp3",
  "/audio/crowd-roar-1.mp3",
  "/audio/crowd-roar-2.mp3",
  "/audio/crowd-drums.mp3",
  "/audio/ref-whistle.mp3",
  "/audio/crowd-fiesta.mp3",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // analytics y demás: directo a la red, sin cachear

  // Documento HTML: red primero (para traer la última versión), caché como respaldo sin conexión.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined)
          return res
        })
        .catch(() => caches.match(req).then((res) => res || caches.match("/"))),
    )
    return
  }

  // Resto de assets del mismo origen: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined)
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
