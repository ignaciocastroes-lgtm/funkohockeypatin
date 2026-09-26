/** Estilos de toda la app (arcade neón, como el original). Se inyectan una sola vez en el contenedor. */
export const CSS = `
.fp-root{position:fixed;inset:0;height:100dvh;background:#050914;color:#fff;overflow:hidden;
  font-family:var(--font-orbitron),ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:manipulation;overscroll-behavior:none}
.fp-root *{box-sizing:border-box}
.fp-root button,.fp-root input,.fp-root select{font:inherit;color:inherit}
.fp-root :focus-visible{outline:3px solid #fff;outline-offset:2px}
.fp-arcade{font-family:var(--font-arcade),ui-monospace,monospace}

.fp-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:max(14px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background-image:linear-gradient(rgba(0,212,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.05) 1px,transparent 1px);background-size:30px 30px}
.fp-scroll{overflow-y:auto;overflow-x:hidden;justify-content:flex-start;-webkit-overflow-scrolling:touch;scroll-padding-block:16px 104px}
.fp-col{width:100%;max-width:980px;display:flex;flex-direction:column;gap:16px;margin:0 auto}

.fp-corner{position:absolute;width:48px;height:48px;border:4px solid #ea580c;pointer-events:none}
.fp-corner.tl{top:14px;left:14px;border-right:0;border-bottom:0}.fp-corner.tr{top:14px;right:14px;border-left:0;border-bottom:0}
.fp-corner.bl{bottom:14px;left:14px;border-right:0;border-top:0}.fp-corner.br{bottom:14px;right:14px;border-left:0;border-top:0}

.fp-menu{gap:22px}
.fp-foot{position:absolute;left:0;right:0;bottom:max(4px,env(safe-area-inset-bottom));margin:0;text-align:center;font-size:11px;letter-spacing:.16em;color:#4ade80;opacity:.6;pointer-events:none;user-select:none}
.fp-brand{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.fp-bolt{width:64px;height:64px;border-radius:50%;border:4px solid #ea580c;display:grid;place-items:center;box-shadow:0 0 28px #ea580c;color:#ea580c;cursor:pointer;-webkit-tap-highlight-color:transparent;overflow:hidden}
.fp-bolt img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
.fp-tap-hint{min-height:16px;font-size:12px;color:#fbbf24;letter-spacing:.03em}
.fp-h1{margin:0;font-size:clamp(20px,5.2vw,52px);line-height:1.15;color:#f97316;text-shadow:0 0 16px rgba(234,88,12,.85)}
.fp-sub{display:flex;align-items:center;gap:12px;color:#22d3ee;letter-spacing:.45em;font-size:clamp(12px,2.6vw,26px)}
.fp-sub i{display:block;height:2px;width:clamp(24px,8vw,80px);background:#22d3ee}
.fp-actions{display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px}
.fp-summary{margin:0;text-align:center;font-size:12px;color:rgba(255,255,255,.65);letter-spacing:.04em}

.fp-btn{--c:#ea580c;min-height:48px;padding:12px 18px;border:2px solid var(--c);background:rgba(0,0,0,.5);color:var(--c);
  font-weight:700;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
  box-shadow:0 0 14px color-mix(in srgb,var(--c) 30%,transparent);transition:background .15s,color .15s,transform .1s}
.fp-btn:hover{background:var(--c);color:#000}
.fp-btn:active{transform:scale(.97)}
.fp-btn.solid{background:var(--c);color:#000}
.fp-btn.solid:hover{filter:brightness(1.12)}
.fp-btn.cy{--c:#22d3ee}.fp-btn.ye{--c:#facc15}.fp-btn.te{--c:#2dd4bf}.fp-btn.rd{--c:#ef4444}.fp-btn.gr{--c:#9ca3af}
.fp-btn[disabled]{opacity:.4;cursor:not-allowed}
.fp-btn.sm{min-height:44px;padding:8px 14px;font-size:13px}
.fp-btn:disabled{opacity:.35;cursor:default;pointer-events:none}

.fp-top{display:flex;align-items:center;gap:12px;width:100%}
.fp-back{--c:#9ca3af;border:0;background:none;box-shadow:none;padding:8px 10px 8px 0;min-height:44px;letter-spacing:.06em;text-transform:none;font-weight:600}
.fp-h2{margin:0;font-size:clamp(16px,3.4vw,34px);text-align:center;flex:1;text-shadow:0 0 12px currentColor}

.fp-panel{background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:14px}
.fp-panel h3{margin:0 0 10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#facc15;font-weight:700}
.fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.fp-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:640px){.fp-two{grid-template-columns:1fr}}

.fp-chip{position:relative;display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 10px;border:2px solid transparent;border-radius:8px;
  background:rgba(255,255,255,.05);cursor:pointer;text-align:left;opacity:.62;transition:opacity .15s,border-color .15s,background .15s;width:100%}
.fp-chip:hover{opacity:1}
.fp-chip[aria-checked="true"]{opacity:1;background:rgba(255,255,255,.11);border-color:var(--tc)}
.fp-dot{width:22px;height:22px;border-radius:50%;flex:none;border:2px solid rgba(255,255,255,.55)}
.fp-chip b{display:block;font-size:14px;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-chip small{display:block;font-size:11px;color:rgba(255,255,255,.6)}
.fp-chip .fp-meta{min-width:0;flex:1}
.fp-mini{--c:#9ca3af;min-width:44px;min-height:44px;padding:0;border:1px solid rgba(255,255,255,.3);border-radius:6px;background:rgba(0,0,0,.4);box-shadow:none;letter-spacing:0;text-transform:none;font-size:15px}
.fp-mini:hover{color:#000}
.fp-chiprow{display:flex;gap:6px;align-items:stretch}

.fp-seg{display:flex;flex-wrap:wrap;gap:6px}
.fp-seg button{flex:1;min-width:70px;min-height:44px;padding:8px 10px;border:2px solid rgba(255,255,255,.25);border-radius:6px;background:rgba(0,0,0,.4);cursor:pointer;font-size:13px;font-weight:600}
.fp-seg button[aria-pressed="true"]{border-color:#22d3ee;background:rgba(34,211,238,.18);color:#fff}
.fp-lab{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.65);margin:0 0 6px}
.fp-note{margin:8px 0 0;font-size:12px;color:rgba(255,255,255,.6)}

.fp-input{width:100%;min-height:48px;padding:10px 12px;background:#000;border:2px solid #4b5563;border-radius:6px;font-weight:700;font-size:18px;text-transform:uppercase;-webkit-user-select:text;user-select:text}
.fp-input:focus{border-color:#facc15;outline:none}
.fp-input.sm{min-height:44px;font-size:14px}
.fp-color{width:100%;min-height:48px;padding:2px;background:#000;border:2px solid #4b5563;border-radius:6px;cursor:pointer}
.fp-sw{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.fp-sw button{width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.4);cursor:pointer;padding:0}
.fp-sw button[aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 2px #050914,0 0 0 4px #fff}
.fp-crest{background:rgba(255,255,255,.08);font-size:22px;display:flex;align-items:center;justify-content:center;line-height:1}
.fp-roster{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:640px){.fp-roster{grid-template-columns:1fr}}
.fp-player{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px}
.fp-error{min-height:20px;margin:0;color:#fca5a5;font-size:13px;font-weight:600}
.fp-sticky{position:sticky;bottom:0;padding:10px 0 2px;background:linear-gradient(transparent,#050914 40%);display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.fp-sticky .fp-btn{flex:1 1 150px;max-width:260px;min-width:0}

.fp-match{position:absolute;inset:0;background:#050914}
.fp-hud{position:absolute;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:min(50vw,230px);gap:8px;z-index:5}
.fp-pause-quick{display:flex;justify-content:center;flex-wrap:wrap;gap:8px}
.fp-pause-quick button{--c:#fff;width:46px;min-height:46px;padding:0;border:1px solid rgba(255,255,255,.35);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;box-shadow:none;font-size:18px;letter-spacing:0}
.fp-pause-quick button:hover,.fp-pause-quick button:focus-visible{background:rgba(255,255,255,.14)}
.fp-hud button{--c:#fff;width:46px;height:46px;min-height:0;padding:0;border:1px solid rgba(255,255,255,.35);border-radius:10px;background:rgba(0,0,0,.55);color:#fff;box-shadow:none;opacity:.7;font-size:18px;letter-spacing:0}
.fp-hud button.view{font-size:12px;font-weight:800}
.fp-hud button:hover,.fp-hud button:focus-visible{opacity:1;background:rgba(0,0,0,.8);color:#fff}
/* Celular en vertical: la placa del marcador y esta barra (hasta 5 botones) comparten el mismo
   ancho angosto de la pantalla real — achicando los botones les queda más lugar a los dos. */
@media (max-width:460px){
  .fp-hud{gap:5px}
  .fp-hud button{width:38px;height:38px;font-size:15px;border-radius:8px}
  .fp-hud button.view{font-size:10.5px}
}

.fp-overlay{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,16,.82);backdrop-filter:blur(3px);animation:fp-in .25s ease-out}
@keyframes fp-in{from{opacity:0}to{opacity:1}}
.fp-dialog{width:100%;max-width:460px;max-height:100%;overflow:auto;background:#0a0f1e;border:2px solid rgba(255,255,255,.18);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;align-items:stretch}
.fp-dialog h2{margin:0;text-align:center;font-size:clamp(16px,4vw,26px)}
.fp-result{font-size:clamp(20px,5.5vw,34px);text-align:center;margin:0}
.fp-score{display:flex;justify-content:center;align-items:baseline;gap:14px;font-size:clamp(34px,9vw,56px);font-weight:800}
.fp-stats{width:100%;border-collapse:collapse;font-size:14px}
.fp-stats td{padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.12)}
.fp-stats td:first-child,.fp-stats td:last-child{width:22%;text-align:center;font-weight:800;font-size:16px}
.fp-stats td:nth-child(2){text-align:center;color:rgba(255,255,255,.75);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.fp-row{display:flex;gap:10px}
.fp-row>*{flex:1}

@media (max-height:520px) and (orientation:landscape){
  .fp-menu{flex-direction:row;gap:28px;justify-content:center}
  .fp-bolt{width:48px;height:48px}
  .fp-brand{flex:1;max-width:46%}.fp-actions{flex:1;gap:8px}.fp-btn{min-height:44px;padding:8px 14px}
  /* menú en 2 columnas: con 7 botones (entrenamiento desbloqueado) una sola columna no entra en 320-390 px de alto */
  .fp-menu .fp-actions{display:grid;grid-template-columns:1fr 1fr;align-content:center;gap:8px;max-width:none}
  .fp-menu .fp-actions .fp-btn.solid,.fp-menu .fp-actions .fp-summary{grid-column:1 / -1}
  .fp-menu .fp-actions .fp-btn{font-size:12px;line-height:1.15;padding:6px 8px}
  .fp-menu .fp-actions .fp-summary{margin:0}
  .fp-corner{display:none}
  .fp-dialog{padding:12px;gap:8px}.fp-stats td{padding:4px}
  .fp-sticky{padding-top:6px}
}
@media (max-height:640px) and (orientation:portrait){
  .fp-menu{gap:12px;padding-bottom:24px}.fp-menu .fp-actions{gap:8px}
  .fp-menu .fp-brand{gap:4px}.fp-menu .fp-bolt{width:46px;height:46px;border-width:3px}
  .fp-menu .fp-corner.bl,.fp-menu .fp-corner.br{display:none}
}
@media (max-width:420px){.fp-sticky .fp-btn{letter-spacing:.04em;padding:10px 8px;font-size:13px;flex-basis:0}}
@media (prefers-reduced-motion:reduce){.fp-root *{animation:none!important;transition:none!important}}

.fp-celebration{position:relative;overflow:hidden;padding:20px 8px 6px;display:flex;flex-direction:column;align-items:center;gap:8px}
.fp-cel-banner{font-family:var(--font-arcade),monospace;font-size:clamp(15px,4.2vw,26px);color:var(--c);text-shadow:0 0 14px var(--c);letter-spacing:.05em;padding:8px 18px;border:2px solid var(--c);border-radius:6px;background:rgba(0,0,0,.55);transform:rotate(-2deg);animation:fp-banner-wave 2.2s ease-in-out infinite}
.fp-cel-stage{display:flex;align-items:flex-end;justify-content:center;gap:6px;height:60px}
.fp-cel-player{font-size:28px;display:inline-block;animation:fp-jump .6s ease-in-out infinite;filter:drop-shadow(0 4px 4px rgba(0,0,0,.5))}
.fp-cel-trophy{font-size:42px;display:inline-block;filter:drop-shadow(0 0 10px #facc15);animation:fp-trophy-bob 1.1s ease-in-out infinite}
.fp-cel-team{margin:0;font-weight:800;letter-spacing:.04em;font-size:15px;text-align:center}
.fp-cel-confetti{position:absolute;top:-10px;width:8px;height:8px;border-radius:2px;animation:fp-confetti-fall 2.6s linear infinite}
@keyframes fp-banner-wave{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes fp-jump{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
@keyframes fp-trophy-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-9px) rotate(4deg)}}
@keyframes fp-confetti-fall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(170px) rotate(360deg);opacity:0}}
`
