// Empaqueta la app completa (menú + equipos + partido) en UN solo HTML autocontenido, sin dependencias.
// Sirve para probarla en cualquier navegador/teléfono sin Next. Uso: node scripts/build-standalone.mjs [salida.html]
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, dirname, resolve, relative } from "node:path"

const root = resolve(dirname(new URL(import.meta.url).pathname), "..")
const out = resolve(process.argv[2] ?? join(root, "juego.html"))
try {
  execSync("npx tsc -p tsconfig.test.json", { cwd: root, stdio: "pipe" })
} catch (e) {
  // En entornos sin @types/node tsc avisa (TS2688) pero igualmente emite; cualquier otro error es real.
  const msg = String(e.stdout ?? "") + String(e.stderr ?? "")
  const real = msg.split("\n").filter((l) => /error TS/.test(l) && !/TS2688/.test(l))
  if (real.length) { console.error(real.join("\n")); process.exit(1) }
}

const build = join(root, ".test-build")
const files = []
;(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith(".js") && p.includes(join(build, "lib"))) files.push(p)
  }
})(build)

const key = (p) => relative(build, p).replace(/\\/g, "/").replace(/\.js$/, "")
const resolveSpec = (from, spec) => {
  const base = resolve(dirname(from), spec)
  for (const c of [base + ".js", join(base, "index.js")]) if (existsSync(c)) return key(c)
  throw new Error(`No resuelve ${spec} desde ${from}`)
}

let defs = ""
for (const f of files) {
  let code = readFileSync(f, "utf8").replace(/^\/\/# sourceMappingURL=.*$/gm, "")
  code = code.replace(/require\((["'])(\.{1,2}\/[^"']+)\1\)/g, (_, __, spec) => `__r(${JSON.stringify(resolveSpec(f, spec))})`)
  defs += `__d(${JSON.stringify(key(f))}, function (exports, module) {\n${code}\n});\n`
}

const bundle = `(function(){
const __defs = {}, __cache = {};
function __d(k, fn) { __defs[k] = fn }
function __r(k) {
  if (__cache[k]) return __cache[k].exports;
  const m = { exports: {} }; __cache[k] = m;
  __defs[k](m.exports, m);
  return m.exports;
}
${defs}
window.__app = __r("lib/app/app");
})();`

// Audios del público (public/audio/*.mp3) incrustados como data: URI: juego.html sigue siendo UN solo archivo.
// El motor los busca en window.__FP_AUDIO__ antes de pedir /audio/... (ver audioUrl en lib/game/crowd.ts).
const audioDir = join(root, "public", "audio")
const audio = {}
if (existsSync(audioDir)) {
  for (const f of readdirSync(audioDir).sort()) {
    if (f.endsWith(".mp3")) audio[f] = `data:audio/mpeg;base64,${readFileSync(join(audioDir, f)).toString("base64")}`
  }
}

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Liga Funko-Patín Arcade</title>
<style>
  html, body { height: 100%; margin: 0; background: #050914; overflow: hidden; overscroll-behavior: none; }
</style>
</head>
<body>
<div id="app"></div>
<script>window.__FP_AUDIO__ = ${JSON.stringify(audio)}</script>
<script>
${bundle}
(function () {
  var q = new URLSearchParams(location.search);
  var t = Number(q.get("time"));
  window.__handle = window.__app.mountApp(document.getElementById("app"), {
    durationOverride: t > 0 ? t : undefined,
    debug: q.get("debug") === "1"
  });
})();
</script>
</body>
</html>
`
writeFileSync(out, html)
console.log(`OK ${out} (${(html.length / 1024).toFixed(0)} KB, ${files.length} módulos, ${Object.keys(audio).length} audios)`)
