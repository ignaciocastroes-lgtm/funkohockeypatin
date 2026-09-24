#!/usr/bin/env python3
"""
Arma los audios del público (public/audio/*.mp3) a partir de 4 grabaciones de estadio.

Uso:  python3 scripts/build-crowd-audio.py --src DIR_CON_LOS_ORIGINALES [--out public/audio]
Requiere ffmpeg y numpy. Los ORIGINALES NO van dentro del proyecto: el juego solo lleva las versiones
procesadas (recortadas, niveladas, limitadas y recodificadas), porque la licencia de Pixabay prohíbe
redistribuir el archivo tal cual ("standalone") pero permite usarlo dentro de una obra nueva.

Piezas (cada una sale de UNA grabación, sin solaparse dentro de la misma):
  crowd-bed-a     murmullo de fondo (arunangshubanerjee, tramo parejo)              -> bucle
  crowd-bed-c     murmullo de fondo 2 (vishiv, tramo tranquilo, nivelado)          -> bucle
  crowd-energy    público entusiasmado y sostenido (vishiv, final)                  -> bucle
  crowd-roar-1    ovación de gol: sube, sostiene y decae (u_xg7ssi08yr)             -> una vez
  crowd-roar-2    ovación de gol alternativa, ataque rápido (vishiv, inicio)        -> una vez
  crowd-react     reacción corta para tiros al palo / atajadas (mykelu, mono)       -> una vez
Los bucles NO llevan el empalme grabado: el motor los solapa con un fundido en cruz al reproducirlos.
"""
import argparse, glob, os, subprocess, sys
import numpy as np

SR = 44100
ORIG = {
    "aru": "arunangshubanerjee-live-football-match-stadium-crowd-cheering-563439.mp3",
    "myk": "mykelu-crowd-cheering-383111.mp3",
    "uxg": "u_xg7ssi08yr-crowd-cheering-379666.mp3",
    "vis": "vishiv-crowd-cheering-in-stadium-435357.mp3",
}

def db(x): return 20 * np.log10(np.maximum(x, 1e-9))

def load(path, channels=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).copy()

def cut(a, t0, t1): return a[int(t0 * SR): int(t1 * SR)].copy()

def fades(a, fin, fout):
    n = len(a)
    if fin > 0:
        k = min(n, int(fin * SR)); a[:k] *= np.sin(np.linspace(0, np.pi / 2, k))[:, None]
    if fout > 0:
        k = min(n, int(fout * SR)); a[n - k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None]
    return a

def level(a, target_db, win=1.0, max_gain_db=6.0):
    """Aplana la deriva de volumen (RMS suavizado) hacia `target_db` sin aplastar los golpes rápidos."""
    m = a.mean(axis=1); w = int(SR * win); hop = int(SR * 0.1)
    idx = np.arange(0, max(1, len(m) - w), hop)
    env = np.array([np.sqrt(np.mean(m[i:i + w] ** 2)) for i in idx]) if len(idx) else np.array([np.sqrt(np.mean(m ** 2))])
    g = np.clip(target_db - db(env), -max_gain_db, max_gain_db)
    t = (idx + w / 2) if len(idx) > 1 else np.array([0.0])
    gain = 10 ** (np.interp(np.arange(len(m)), t, g) / 20) if len(idx) > 1 else np.full(len(m), 10 ** (g[0] / 20))
    return a * gain[:, None].astype(np.float32)

def normalize_rms(a, target_db):
    r = np.sqrt(np.mean(a.mean(axis=1) ** 2))
    return a * (10 ** ((target_db - db(r)) / 20))

def limit(a, ceiling_db=-1.0):
    """Limitador suave: solo actúa si algo pasa del techo (varias grabaciones traían recortes)."""
    c = 10 ** (ceiling_db / 20); p = np.abs(a).max()
    if p <= c: return a
    k = 1.5
    return (np.tanh(a / c * k) / np.tanh(k) * c).astype(np.float32)

def encode(a, path, bitrate="96k", channels=2):
    if channels == 1 and a.shape[1] == 2: a = a.mean(axis=1, keepdims=True)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(a.shape[1]), "-i", "-", "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), path], stdin=subprocess.PIPE)
    p.communicate(np.ascontiguousarray(a, dtype=np.float32).tobytes())
    if p.returncode: sys.exit("ffmpeg falló")

def report(name, a, path):
    m = a.mean(axis=1)
    print(f"{name:14s} {len(a)/SR:5.1f} s  rms {db(np.sqrt(np.mean(m**2))):6.1f} dBFS  pico {db(np.abs(a).max()):5.1f}  {os.path.getsize(path)/1024:5.0f} KB")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True); ap.add_argument("--out", default="public/audio")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    src = {k: load(os.path.join(a.src, v)) for k, v in ORIG.items() if k != "myk"}
    src["myk"] = load(os.path.join(a.src, ORIG["myk"]), channels=1)

    jobs = []
    # murmullos (bucles): parejos y BAJOS; el nivel real lo pone el motor
    bed_a = level(cut(src["aru"], 1.0, 6.8), -21); jobs.append(("crowd-bed-a", normalize_rms(bed_a, -26), 2))
    bed_c = level(cut(src["vis"], 16.3, 23.8), -19, max_gain_db=8); jobs.append(("crowd-bed-c", normalize_rms(bed_c, -26), 2))
    # entusiasmo sostenido (bucle)
    energy = level(cut(src["vis"], 24.2, 30.0), -12); jobs.append(("crowd-energy", normalize_rms(energy, -21), 2))
    # ovaciones de gol (una vez): con ataque y cola cerradas por fundidos
    roar1 = fades(cut(src["uxg"], 0.6, 12.4), 0.05, 3.0); jobs.append(("crowd-roar-1", normalize_rms(roar1, -17), 2))
    roar2 = fades(cut(src["vis"], 0.0, 9.5), 0.25, 2.6); jobs.append(("crowd-roar-2", normalize_rms(roar2, -17), 2))
    # reacción corta (mono): la grabación es baja y decae, se sube y se cierra con fundidos
    react = fades(cut(src["myk"], 0.0, 2.4), 0.04, 0.9); jobs.append(("crowd-react", normalize_rms(react, -22), 1))

    for name, arr, ch in jobs:
        arr = limit(arr)
        path = os.path.join(a.out, name + ".mp3")
        encode(arr, path, "96k" if ch == 2 else "64k", ch)
        report(name, arr, path)

if __name__ == "__main__":
    main()
