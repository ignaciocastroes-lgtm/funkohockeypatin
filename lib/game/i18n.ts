/**
 * Idiomas: español (el texto original del código) y portugués (de Portugal — el hóquei em patins es
 * portugués-céntrico: Portugal, Angola). Sin dependencias.
 *
 * Diseño: el texto en español ES la clave. `tr("Jugar")` devuelve "Jogar" en portugués y "Jugar" en
 * español; lo que no está en el diccionario se ve en español (nunca queda una clave rota). Los textos con
 * variables (nombres de equipo, minutos) se resuelven con REGLAS (regex) en `RULES`.
 *  - Pantallas de la app (DOM): `observeLocalization(root)` traduce solo todo lo que aparece en `root`
 *    (texto y aria-label/title/placeholder), así no hay que envolver cada literal a mano.
 *  - Canvas y botones del partido: se llama a `tr()` donde se dibuja.
 * Los NOMBRES de equipo (ESPAÑA, HUACHIPATO, los que crea el usuario) no se traducen.
 */

export type Lang = "es" | "pt"
export const LANGS: readonly Lang[] = ["es", "pt"]
export const LANG_LABEL: Record<Lang, string> = { es: "ES", pt: "PT" }
export const isLang = (v: unknown): v is Lang => v === "es" || v === "pt"

/** Idioma del navegador → idioma del juego. Cualquier variante de portugués (pt, pt-PT, pt-BR) → pt. */
export function detectLang(navigatorLang: string | undefined | null): Lang {
  return /^pt\b/i.test(String(navigatorLang ?? "")) ? "pt" : "es"
}

let current: Lang = "es"
export const getLang = (): Lang => current
export function setLang(l: Lang) { current = l }

// ---------- diccionario es → pt ----------
export const PT: Record<string, string> = {
  // menú y navegación
  "Jugar partido": "Jogar partida",
  "Equipos y ajustes": "Equipas e definições",
  "Copa": "Taça",
  "Copa (en curso)": "Taça (a decorrer)",
  "Crear equipo": "Criar equipa",
  "Modo demo (IA vs IA)": "Modo demo (IA vs IA)",
  "Modo entrenamiento": "Modo treino",
  "⚡ Modo Dios vs Dios": "⚡ Modo Deus vs Deus",
  "Créditos": "Créditos",
  "CRÉDITOS": "CRÉDITOS",
  "📲 Instalar la app": "📲 Instalar a app",
  "Instalar la app": "Instalar a app",
  "Agregar a inicio": "Adicionar ao ecrã inicial",
  "‹ Volver": "‹ Voltar",
  "Volver": "Voltar",
  "PARTIDO": "PARTIDA",
  "Jugar": "Jogar",
  "Entendido": "Entendido",
  "Cancelar": "Cancelar",
  "Borrar": "Apagar",
  "Genial": "Ótimo",
  "Continuar": "Continuar",
  "Salir": "Sair",
  "Seguir": "Continuar",
  "Reiniciar": "Reiniciar",
  "Pausa": "Pausa",
  "PAUSA": "PAUSA",
  "Revancha": "Desforra",
  // ajustes de partido
  "Tu equipo (local)": "A tua equipa (casa)",
  "Rival (visita)": "Rival (visitante)",
  "Equipo local": "Equipa da casa",
  "Equipo visita": "Equipa visitante",
  "Nivel del rival": "Nível do rival",
  "Nivel de los rivales": "Nível dos rivais",
  "Duración": "Duração",
  "Dedos": "Dedos",
  "Diestro (mover a la izquierda)": "Destro (mover à esquerda)",
  "Zurdo (mover a la derecha)": "Canhoto (mover à direita)",
  "Sonido": "Som",
  "Con sonido": "Com som",
  "Silencio": "Silêncio",
  "Música de fondo": "Música de fundo",
  "Prendida": "Ligada",
  "Atenuada": "Baixa",
  "Apagada": "Desligada",
  "Bocha": "Bola",
  "Pesada": "Pesada",
  "Normal": "Normal",
  "Liviana": "Leve",
  "Fácil": "Fácil",
  "Difícil": "Difícil",
  "El equilibrio de siempre — sin cambios.": "O equilíbrio de sempre — sem alterações.",
  "Más lenta y previsible: frena rápido y casi no rebota. Buena para arrancar.": "Mais lenta e previsível: trava depressa e quase não ressalta. Boa para começar.",
  "Más rápida y rebota más: exige más precisión y reflejos.": "Mais rápida e ressalta mais: exige mais precisão e reflexos.",
  "Rendimiento": "Desempenho",
  "Alta calidad": "Alta qualidade",
  "Ahorro (celulares lentos)": "Poupança (telemóveis lentos)",
  // superficies / categorías / jugadores
  "Madera": "Madeira",
  "Sintético": "Sintético",
  "Cemento": "Cimento",
  "Equilibrada": "Equilibrado",
  "Rápida: todo se desliza más": "Rápido: tudo desliza mais",
  "Lenta: frena rápido": "Lento: trava depressa",
  "Mixto": "Misto",
  "Masculino": "Masculino",
  "Femenino": "Feminino",
  "Pesado": "Pesado",
  "Veloz": "Veloz",
  "Capitán": "Capitão",
  "CAPITÁN": "CAPITÃO",
  "Jugador": "Jogador",
  // editor de equipos
  "NUEVO EQUIPO": "NOVA EQUIPA",
  "EDITAR EQUIPO": "EDITAR EQUIPA",
  "CREAR EQUIPO": "CRIAR EQUIPA",
  "Nombre": "Nome",
  "Color": "Cor",
  "Escudo": "Emblema",
  "Color del equipo": "Cor da equipa",
  "Escudo del equipo": "Emblema da equipa",
  "Pista de localía": "Piso da casa",
  "Categoría": "Categoria",
  "Solo una etiqueta: no cambia nada del motor ni del balance.": "É só uma etiqueta: não muda nada no motor nem no equilíbrio.",
  "Plantilla titular": "Plantel titular",
  "Pesado: aguanta golpes pero es lento. Veloz: ágil pero liviano. El primero es el capitán.": "Pesado: aguenta pancadas mas é lento. Veloz: ágil mas leve. O primeiro é o capitão.",
  "Guardar equipo": "Guardar equipa",
  "Se elimina de este dispositivo y no se puede deshacer.": "É eliminada deste dispositivo e não se pode desfazer.",
  "Límite de equipos": "Limite de equipas",
  "Ponle nombre al equipo.": "Dá um nome à equipa.",
  "Elige un color válido.": "Escolhe uma cor válida.",
  // créditos
  "Desarrollo original:": "Desenvolvimento original:",
  "Motor físico y sanciones:": "Motor de física e sanções:",
  "Herramientas de prueba:": "Ferramentas de teste:",
  "Pista:": "Pista:",
  "40 × 20 m, reglamentaria": "40 × 20 m, regulamentar",
  "Marcador oficial:": "Marcador oficial:",
  "Un saludo especial a": "Uma saudação especial a",
  "y a mis": "e aos meus",
  "4 hijos": "4 filhos",
  "Público de las gradas: grabaciones de estadio de": "Público das bancadas: gravações de estádio de",
  "(Pixabay), editadas para el juego.": "(Pixabay), editadas para o jogo.",
  "Código QR de ardisport.cl": "Código QR de ardisport.cl",
  // desbloqueos y Copa
  "¡MODO ENTRENAMIENTO DESBLOQUEADO!": "MODO TREINO DESBLOQUEADO!",
  "Entrenamiento y práctica de penales, ya están en el menú principal.": "Treino e prática de penáltis já estão no menu principal.",
  "⚡ ¡MODO DIOS VS DIOS DESBLOQUEADO!": "⚡ MODO DEUS VS DEUS DESBLOQUEADO!",
  "Un partido demo con las dos escuadras a nivel maestro — mirá rebotes y pases de verdad. Ya está en el menú principal.": "Uma partida demo com as duas equipas a nível mestre — vê ressaltos e passes a sério. Já está no menu principal.",
  "🏟️ Desbloqueaste el Estadio Aldo Cantoni — de ahora en más, ahí se juega la final de la Copa (y ya está disponible en entrenamiento y en el demo).": "🏟️ Desbloqueaste o Estádio Aldo Cantoni — a partir de agora é lá que se joga a final da Taça (e já está disponível no treino e na demo).",
  "¡CAMPEONES!": "CAMPEÕES!",
  "¡un toque más!": "mais um toque!",
  "Elegí tu equipo": "Escolhe a tua equipa",
  "Eliminación directa: dos semifinales y una final. Los otros 3 salen al azar — vos jugás siempre con este.": "Eliminatória: duas meias-finais e uma final. Os outros 3 saem ao acaso — jogas sempre com esta.",
  "Tu equipo en la copa": "A tua equipa na taça",
  "Nueva Copa": "Nova Taça",
  "¿Cancelar la Copa?": "Cancelar a Taça?",
  "Se pierde el progreso del torneo.": "Perde-se o progresso do torneio.",
  "Cancelar Copa": "Cancelar Taça",
  "Ver Copa": "Ver Taça",
  "Ver llave": "Ver quadro",
  "Siguiente partido": "Próximo jogo",
  "Jugar de nuevo": "Jogar de novo",
  "Otra final": "Outra final",
  "Final Dios vs Dios": "Final Deus vs Deus",
  "Fin del partido de Copa": "Fim do jogo da Taça",
  "¡Definido por penales!": "Decidido nos penáltis!",
  "¡EMPATE!": "EMPATE!",
  "Empate": "Empate",
  "En la Copa no hay empates: hay que definirlo.": "Na Taça não há empates: tem de se decidir.",
  "AVANZA": "AVANÇA",
  "COPA": "TAÇA",
  // entrenamiento
  "ENTRENAMIENTO": "TREINO",
  "Básico": "Básico",
  "Medio": "Médio",
  "Experto": "Especialista",
  "Sin arquero y bocha pesada (lenta, casi no rebota): para agarrarle la mano al patinaje y al control.": "Sem guarda-redes e bola pesada (lenta, quase não ressalta): para apanhar o jeito ao patinar e ao controlo.",
  "Con arquero y bocha normal: a definir de verdad frente al arco.": "Com guarda-redes e bola normal: a finalizar a sério frente à baliza.",
  "Con arquero y bocha liviana (rápida, rebota más): exige reflejos y precisión.": "Com guarda-redes e bola leve (rápida, ressalta mais): exige reflexos e precisão.",
  "Cancha común": "Pista normal",
  "🏟️ Aldo Cantoni": "🏟️ Aldo Cantoni",
  "El Cantoni tiene piso de parquet (madera) real — se juega con esa pista, sin importar lo que elijas arriba.": "O Cantoni tem piso de parquet (madeira) real — joga-se nesse piso, seja o que for que escolhas acima.",
  "Practicá tiros solo, sin rival. Elegí el nivel: cada uno suma arquero y una bocha distinta.": "Treina remates sozinho, sem rival. Escolhe o nível: cada um traz guarda-redes e uma bola diferente.",
  "Penales · súper tiros": "Penáltis · super remates",
  "Practicar penales": "Treinar penáltis",
  "Reiniciar entrenamiento": "Reiniciar treino",
  "Pista": "Pista",
  "Estadio": "Estádio",
  "Nivel": "Nível",
  // partido en curso / pausa
  "Liga Funko-Patín": "Liga Funko-Patín",
  "TOCÁ PARA JUGAR": "TOCA PARA JOGAR",
  "cancha completa": "pista completa",
  "3/4 de cancha": "3/4 de pista",
  "seguir la jugada": "seguir a jogada",
  "SEG": "SEG",
  "TOT": "TOT",
  "cambiar de jugador": "trocar de jogador",
  "Cambiar de jugador": "Trocar de jogador",
  "Activar sonido": "Ativar som",
  "Silenciar": "Silenciar",
  "Pantalla completa": "Ecrã inteiro",
  "DEMO EN PAUSA": "DEMO EM PAUSA",
  "FINAL DIOS VS DIOS EN PAUSA": "FINAL DEUS VS DEUS EM PAUSA",
  "ENTRENAMIENTO EN PAUSA": "TREINO EM PAUSA",
  "CONTROL": "CONTROLO",
  "Ajustes de control": "Definições de controlo",
  "⚙️ Ajustes de control": "⚙️ Definições de controlo",
  "‹ Volver a pausa": "‹ Voltar à pausa",
  "Otro partido demo": "Outra partida demo",
  "¿Reiniciar el partido?": "Reiniciar a partida?",
  "Empiezas de nuevo con 0-0.": "Recomeças com 0-0.",
  "Reiniciar partido": "Reiniciar partida",
  "¿Salir del modo demo?": "Sair do modo demo?",
  "¿Salir de la final Dios vs Dios?": "Sair da final Deus vs Deus?",
  "¿Salir del entrenamiento?": "Sair do treino?",
  "¿Salir a la Copa?": "Sair para a Taça?",
  "¿Salir al menú?": "Sair para o menu?",
  "Se corta el partido demo.": "A partida demo é interrompida.",
  "Se corta la final.": "A final é interrompida.",
  "Se corta la práctica.": "O treino é interrompido.",
  "Se pierde el partido en curso.": "Perde-se a partida em curso.",
  "Salir al menú": "Sair para o menu",
  "Salir a la Copa": "Sair para a Taça",
  "Fin del partido": "Fim da partida",
  "¡GANASTE!": "GANHASTE!",
  "PERDISTE": "PERDESTE",
  "Estadísticas": "Estatísticas",
  "Pases completos": "Passes completos",
  "Tiros": "Remates",
  "Robos": "Roubos",
  "Faltas": "Faltas",
  // tutorial
  "Cómo se juega": "Como se joga",
  "CÓMO SE JUEGA": "COMO SE JOGA",
  "Stick (o WASD/flechas): movés al jugador y elegís hacia dónde va el tiro o el pase.": "Manípulo (ou WASD/setas): moves o jogador e escolhes para onde vai o remate ou o passe.",
  "Con la pelota: PASE, PASE FUERTE, TIRO y TIRO FUERTE (con estrella ★ sale SÚPER TIRO). Cada botón actúa al instante, sin cargar.": "Com a bola: PASSE, PASSE FORTE, REMATE e REMATE FORTE (com estrela ★ sai SUPER REMATE). Cada botão atua de imediato, sem carregar.",
  "Sin la pelota: QUITAR y QUITAR FUERTE (barrida) le sacan la pelota al rival; ◀ CAMBIO y CAMBIO ▶ pasan al jugador de la izquierda o la derecha.": "Sem a bola: DESARMAR e DESARMAR FORTE (carrinho) tiram a bola ao rival; ◀ TROCA e TROCA ▶ passam ao jogador da esquerda ou da direita.",
  "Un toque suelto sobre un compañero también le pasa. En computadora: J pase/quitar, L pase fuerte/quitar fuerte, K tiro/jugador ◀, I tiro fuerte/jugador ▶, Q cambia de jugador.": "Um toque solto num companheiro também lhe passa a bola. No computador: J passe/desarmar, L passe forte/desarmar forte, K remate/jogador ◀, I remate forte/jogador ▶, Q troca de jogador.",
  "No volver a mostrar": "Não voltar a mostrar",
  // dentro del partido: botones (con \n) y textos de pantalla
  "PASE": "PASSE",
  "PASE\nFUERTE": "PASSE\nFORTE",
  "TIRO": "REMATE",
  "TIRO\nFUERTE": "REMATE\nFORTE",
  "★ SÚPER\nTIRO": "★ SUPER\nREMATE",
  "QUITAR": "DESARMAR",
  "QUITAR\nFUERTE": "DESARMAR\nFORTE",
  "◀\nCAMBIO": "◀\nTROCA",
  "CAMBIO\n▶": "TROCA\n▶",
  "Stick = dirección · PASE y TIRO con la pelota · QUITAR sin ella": "Manípulo = direção · PASSE e REMATE com a bola · DESARMAR sem ela",
  "Stick = dirección · Botones: pase, tiro, quitar": "Manípulo = direção · Botões: passe, remate, desarmar",
  "Stick + botones": "Manípulo + botões",
  "¡GOLAZO!": "GOLAÇO!",
  "TOQUE · TOQUE · TOQUE": "TOQUE · TOQUE · TOQUE",
  "TOQUE · el control salta": "TOQUE · o controlo salta",
  "TOQUE · TOQUE · TOQUE · GOLAZO": "TOQUE · TOQUE · TOQUE · GOLAÇO",
  "SÚPER TIRO": "SUPER REMATE",
  "TOQUE · TOQUE · TOQUE · ARQUERO": "TOQUE · TOQUE · TOQUE · GUARDA-REDES",
  "¡Muerte súbita! Gol de oro": "Morte súbita! Golo de ouro",
  // 2 jugadores con código
  "2 jugadores (con código)": "2 jogadores (com código)",
  "2 JUGADORES": "2 JOGADORES",
  "Crear sala": "Criar sala",
  "Unirme": "Entrar",
  "CÓDIGO": "CÓDIGO",
  "Esperando al rival…": "À espera do rival…",
  "Conectando…": "A ligar…",
  "Pasale este código a tu rival (o que escanee el QR):": "Passa este código ao teu rival (ou que leia o QR):",
  "Vos jugás con el equipo local y tu rival con la visita. Cancha y duración: las de tus ajustes.": "Tu jogas com a equipa da casa e o teu rival com a visitante. Pista e duração: as das tuas definições.",
  "Te da un código de 5 caracteres para pasarle a tu rival. Sin cuentas ni registro.": "Dá-te um código de 5 caracteres para passares ao teu rival. Sem contas nem registo.",
  "¿Te pasaron un código? Escribilo acá y tocá Unirme.": "Recebeste um código? Escreve-o aqui e toca em Entrar.",
  "Se cortó la conexión": "A ligação foi cortada",
  "El otro jugador se fue o se perdió la conexión.": "O outro jogador saiu ou perdeu-se a ligação.",
  "El rival se fue: sigue la IA": "O rival saiu: continua a IA",
  "El código tiene 5 letras o números (sin 0, O, 1, I, L).": "O código tem 5 letras ou números (sem 0, O, 1, I, L).",
  "No encontramos esa sala. Revisá el código (o pedile a tu rival que la cree de nuevo).": "Não encontrámos essa sala. Confirma o código (ou pede ao teu rival que a crie de novo).",
  "Ese código ya está en uso. Probá crear la sala otra vez.": "Esse código já está em uso. Tenta criar a sala outra vez.",
  "Esa sala ya tiene rival.": "Essa sala já tem rival.",
  "El servidor está lleno ahora. Probá en un rato.": "O servidor está cheio agora. Tenta daqui a pouco.",
  "Demasiados intentos seguidos. Esperá un minuto.": "Demasiadas tentativas seguidas. Espera um minuto.",
  "No se pudo conectar con el servidor de salas. Revisá tu conexión.": "Não foi possível ligar ao servidor de salas. Confirma a tua ligação.",
  "El modo de 2 jugadores necesita un servidor de salas y este juego todavía no tiene uno configurado.": "O modo de 2 jogadores precisa de um servidor de salas e este jogo ainda não tem um configurado.",
  "Quien publica el juego lo configura una vez (ver docs/RELAY.md). Mientras tanto podés jugar contra la IA.": "Quem publica o jogo configura-o uma vez (ver docs/RELAY.md). Entretanto podes jogar contra a IA.",
  // instalar
  "Tocá el ícono de compartir (el cuadradito con la flecha hacia arriba) y elegí «Agregar a inicio».": "Toca no ícone de partilha (o quadradinho com a seta para cima) e escolhe «Adicionar ao ecrã inicial».",
  "Abrí el menú del navegador (⋮ o ⋯) y elegí «Instalar app» o «Agregar a la pantalla de inicio».": "Abre o menu do navegador (⋮ ou ⋯) e escolhe «Instalar app» ou «Adicionar ao ecrã inicial».",
}

// ---------- reglas para textos con variables ----------
const SURFACE_PT: Record<string, string> = { madera: "madeira", sintético: "sintético", cemento: "cimento" }
const NIVEL_PT: Record<string, string> = { "Fácil": "Fácil", "Normal": "Normal", "Difícil": "Difícil" }

type Rule = [RegExp, (m: RegExpMatchArray, t: (s: string) => string) => string]
export const RULES: Rule[] = [
  [/^Pista (madera|sintético|cemento)$/, (m) => `Piso ${SURFACE_PT[m[1]]}`],
  [/^Editar (.+)$/, (m) => `Editar ${m[1]}`],
  [/^Borrar (.+)$/, (m) => `Apagar ${m[1]}`],
  [/^¿Borrar (.+)\?$/, (m) => `Apagar ${m[1]}?`],
  [/^Color (#[0-9a-fA-F]{6})$/, (m) => `Cor ${m[1]}`],
  [/^Escudo (.+)$/, (m) => `Emblema ${m[1]}`],
  [/^Nombre del jugador (\d+)( \(capitán\))?$/, (m) => `Nome do jogador ${m[1]}${m[2] ? " (capitão)" : ""}`],
  [/^JUGADOR (\d+)$/, (m) => `JOGADOR ${m[1]}`],
  [/^Jugador (\d+)$/, (m) => `Jogador ${m[1]}`],
  [/^Estilo del jugador (\d+)$/, (m) => `Estilo do jogador ${m[1]}`],
  [/^Puedes guardar hasta (\d+) equipos propios\. Borra alguno para crear otro\.$/, (m) => `Podes guardar até ${m[1]} equipas próprias. Apaga alguma para criar outra.`],
  [/^Se juega en la pista del local: (\S+) \((.+)\)\.$/, (m, t) => `Joga-se no piso da casa: ${SURFACE_PT[m[1]] ?? m[1]} (${t(cap(m[2])).toLowerCase()}).`],
  [/^(.+)\. Aplica cuando este equipo juega de local\.$/, (m, t) => `${t(m[1])}. Aplica-se quando esta equipa joga em casa.`],
  [/^(.+) vs (.+) · (\d+:\d\d) · (Fácil|Normal|Difícil)$/, (m) => `${m[1]} vs ${m[2]} · ${m[3]} · ${NIVEL_PT[m[4]]}`],
  [/^(\d+) toques más\.\.\.$/, (m) => `mais ${m[1]} toques...`],
  [/^Vista: (.+) — tocá para cambiar$/, (m, t) => `Vista: ${t(m[1])} — toca para mudar`],
  [/^Entrenar — (.+)$/, (m, t) => `Treinar — ${t(m[1])}`],
  [/^(.+) ganó la tanda (\d+)-(\d+)\.$/, (m) => `${m[1]} ganhou o desempate ${m[2]}-${m[3]}.`],
  [/^(.+), campeón de la Copa$/, (m) => `${m[1]}, campeão da Taça`],
  [/^(.+) gana la final Dios vs Dios y se queda con la Copa\.$/, (m) => `${m[1]} vence a final Deus vs Deus e fica com a Taça.`],
  [/^(.+) se queda con la Copa\.$/, (m) => `${m[1]} fica com a Taça.`],
  [/^(.+) pasa a la siguiente ronda\.$/, (m) => `${m[1]} passa à ronda seguinte.`],
  [/^Sortear y empezar Copa \(jugás con (.+)\)$/, (m) => `Sortear e começar a Taça (jogas com ${m[1]})`],
  [/^Jugar: (.+) vs (.+)$/, (m) => `Jogar: ${m[1]} vs ${m[2]}`],
  [/^¡FALTA! Tarjeta azul (.+)$/, (m) => `FALTA! Cartão azul ${m[1]}`],
  [/^(.+) — combo (de ataque|defensivo) armado$/, (m) => `${m[1]} — combo ${m[2] === "de ataque" ? "de ataque" : "defensivo"} montado`],
  [/^Cambio (.+): sale (#\d+) · entra (#\d+)$/, (m) => `Substituição ${m[1]}: sai ${m[2]} · entra ${m[3]}`],
  [/^¡PENAL para (.+)!$/, (m) => `PENÁLTI para ${m[1]}!`],
]

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Traduce un texto en español al idioma actual. En español devuelve el mismo texto. */
export function tr(es: string, lang: Lang = current): string {
  if (lang === "es" || !es) return es
  const lead = /^\s*/.exec(es)?.[0] ?? ""
  const trail = /\s*$/.exec(es)?.[0] ?? ""
  const core = es.slice(lead.length, es.length - trail.length)
  if (!core) return es
  const hit = PT[core]
  if (hit !== undefined) return lead + hit + trail
  for (const [re, fn] of RULES) {
    const m = re.exec(core)
    if (m) return lead + fn(m, (s) => tr(s, lang)) + trail
  }
  return es
}

// ---------- traducción del DOM ----------
const ATTRS = ["aria-label", "title", "placeholder", "alt"] as const

function localizeNode(node: Node) {
  if (current === "es") return
  if (node.nodeType === 3) { // texto
    const t = node as Text
    const parent = t.parentNode as HTMLElement | null
    if (parent && (parent.tagName === "INPUT" || parent.tagName === "TEXTAREA" || parent.tagName === "STYLE" || parent.tagName === "SCRIPT")) return
    const out = tr(t.data)
    if (out !== t.data) t.data = out
    return
  }
  if (node.nodeType !== 1) return
  const el = node as HTMLElement
  if (el.tagName === "STYLE" || el.tagName === "SCRIPT") return
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a)
    if (v) { const out = tr(v); if (out !== v) el.setAttribute(a, out) }
  }
  el.childNodes.forEach(localizeNode)
}

/** Traduce ahora todo lo que ya está en `root`. */
export function localizeDom(root: Node) { localizeNode(root) }

/** Deja a `root` traduciéndose solo cada vez que se le agrega algo. Devuelve la función para soltarlo. */
export function observeLocalization(root: HTMLElement): () => void {
  if (typeof MutationObserver === "undefined") return () => {}
  const obs = new MutationObserver((records) => {
    if (current === "es") return
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(localizeNode)
      else if (r.type === "characterData") localizeNode(r.target)
    }
  })
  obs.observe(root, { childList: true, subtree: true, characterData: true })
  localizeDom(root)
  return () => obs.disconnect()
}
