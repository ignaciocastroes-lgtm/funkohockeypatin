"use client"

import { useEffect, useRef } from "react"
import { mountApp } from "@/lib/app/app"

/**
 * Liga Funko-Patín Arcade. Toda la app (menú, equipos, partido) vive en lib/app y lib/game,
 * sin dependencias de React: aquí solo se monta en un <div> y se limpia al desmontar.
 * Parámetros de desarrollo por URL: ?time=<segundos> ?debug=1
 */
export default function Page() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Service worker: hace que la PWA sea instalable en Android y que el partido funcione sin
    // conexión. Se registra solo en producción (en `next dev` los chunks cambian todo el tiempo
    // y una caché de por medio solo estorba).
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const q = new URLSearchParams(window.location.search)
    const t = Number(q.get("time"))
    const app = mountApp(el, { durationOverride: t > 0 ? t : undefined, debug: q.get("debug") === "1" })
    return () => app.destroy()
  }, [])

  return <div ref={host} style={{ position: "fixed", inset: 0 }} />
}
