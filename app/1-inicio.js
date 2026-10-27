// CallZinha — entrada na sala, preferências, conexão com o PeerJS e os cartões das pessoas. Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
const $ = (id) => document.getElementById(id) || (window.czPipDoc ? window.czPipDoc.getElementById(id) : null);

// ================= emojis com o desenho da Apple em qualquer aparelho =================
// Todo emoji que aparece na tela (botões, avisos, chat, jogos) vira a imagem da Apple, buscada do CDN.
// Sem internet, a imagem não carrega e o emoji volta a ser o do sistema.
const APPLE_EMOJI = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';
const EMOJI_RE = /\p{RI}\p{RI}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)\p{EMod}?(?:‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️?)\p{EMod}?)*/gu;
const EMOJI_SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|TITLE|CANVAS|svg)$/;
const emojiFailed = new Set();
function emojiImg(e) {
  const code = [...e].map((c) => c.codePointAt(0).toString(16)).join('-');
  const img = document.createElement('img');
  img.className = 'emoji'; img.alt = e; img.draggable = false; img.decoding = 'async';
  img.src = APPLE_EMOJI + code + '.png';
  img.onerror = () => {
    const plain = code.replace(/-fe0f/g, '');   // alguns arquivos não levam o seletor FE0F no nome
    if (plain !== code && !img.dataset.retry) { img.dataset.retry = '1'; img.src = APPLE_EMOJI + plain + '.png'; return; }
    emojiFailed.add(e);
    img.replaceWith(document.createTextNode(e));
  };
  return img;
}
function emojifyText(node) {
  const text = node.nodeValue;
  if (!text || !node.parentNode) return;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return;
  for (let el = node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
    if (EMOJI_SKIP.test(el.nodeName) || el.isContentEditable || el.hasAttribute('data-no-emoji')) return;
  }
  const frag = document.createDocumentFragment();
  let last = 0, changed = false;
  text.replace(EMOJI_RE, (e, at) => {
    if (emojiFailed.has(e)) return e;
    if (at > last) frag.appendChild(document.createTextNode(text.slice(last, at)));
    frag.appendChild(emojiImg(e));
    last = at + e.length; changed = true;
    return e;
  });
  if (!changed) return;
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(frag, node);
}
function emojify(root) {
  if (root.nodeType === 3) return emojifyText(root);
  if (root.nodeType !== 1 || EMOJI_SKIP.test(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  list.forEach(emojifyText);
}
new MutationObserver((muts) => {
  muts.forEach((m) => { if (m.type === 'characterData') emojifyText(m.target); else m.addedNodes.forEach(emojify); });
}).observe(document.body, { childList: true, subtree: true, characterData: true });
emojify(document.body);

// ================= v10: configuração e preferências =================
// Servidor de sinalização próprio (opcional). Ex.: window.CALLZINHA_PEER_OPTIONS = { host:'meu-servidor.com', port:443, path:'/', secure:true }
// Sem isso, usa o servidor gratuito do PeerJS (0.peerjs.com), que pode ficar instável em horários de pico.
const PEER_OPTIONS = window.CALLZINHA_PEER_OPTIONS || {};
// Registro curto dos últimos eventos (erros, quedas de ligação) para o "Copiar diagnóstico"
const czLog = [];
function logEvent(t) { czLog.push(new Date().toLocaleTimeString('pt-BR') + ' ' + String(t).slice(0, 200)); if (czLog.length > 30) czLog.shift(); }
window.addEventListener('error', (e) => logEvent('erro: ' + e.message));
window.addEventListener('unhandledrejection', (e) => logEvent('erro (promessa): ' + ((e.reason && e.reason.message) || e.reason)));
(function () { const w = console.warn; console.warn = function (...a) { logEvent('aviso: ' + a.map((x) => (x && x.message) || String(x)).join(' ')); return w.apply(this, a); }; })();
const AUDIO_BITRATE = 64000;            // Opus mono ~64 kbps: voz limpa e estável (o padrão do navegador é ~32 kbps)
const NS_VERSION = '0.4.1';             // @sapphi-red/web-noise-suppressor (RNNoise em WebAssembly, licença MIT)
const NS_BASES = [
  'https://cdn.jsdelivr.net/npm/@sapphi-red/web-noise-suppressor@' + NS_VERSION + '/dist/',
  'https://unpkg.com/@sapphi-red/web-noise-suppressor@' + NS_VERSION + '/dist/'
];
// Filtro forte (DeepFilterNet3): fica no site, fora dos apps; só baixa (~12 MB, uma vez) quando alguém escolhe
const DFN_BASES = ['ia/dfn/', 'https://erosxv.github.io/JANEMBA/ia/dfn/'];
const DFN_CACHE = 'cz-dfn-1';
const DFN_LIM = 50;                       // atenuação máxima do ruído em dB (100 = sem limite; 50 tira bem e a voz fica natural)
const PREF_KEY = 'callzinha.prefs.v1';
const DEFAULT_PREFS = {
  name: '', micDevice: '', outDevice: '',
  noise: 'ai',            // 'ai' (RNNoise) | 'dfn' (DeepFilterNet3) | 'browser' | 'off'
  echo: true, agc: true, gain: 100, gateOn: false, gateThr: -50,
  res: 1080, fps: 30, screenMode: 'detail', screenAudio: false,
  upload: 10,             // velocidade de envio (upload) da internet, em Mbps: a tela divide 60% disso entre quem assiste
  shortcut: 'KeyM', layout: 'grid', notices: true, musicVol: 60, reactBar: true, visual: 'auto', sounds: true, avatar: ''
};
function loadPrefs() {
  try { return Object.assign({}, DEFAULT_PREFS, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); }
  catch (e) { return Object.assign({}, DEFAULT_PREFS); }
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }
let prefs = loadPrefs();

let myName = "";
let roomId = "";
let peer = null;
let isHost = false;
let localStream = null;   // stream de ÁUDIO bruto do mic
let micOutputStream = null; // stream já processado (com ganho aplicado) que vai pra chamada (faixa fixa: nunca precisa renegociar)
let micGainNode = null;
let micVolumePercent = Math.max(0, Math.min(200, Number(prefs.gain) || 100)); // 0-200%
let screenStream = null;  // stream de vídeo (tela), só quando compartilhando
let hasMic = false;
const calls = {};       // peerId -> MediaConnection
const conns = {};       // peerId -> DataConnection (nomes / lista de peers)
const remoteNames = {}; // peerId -> name
const hostConns = {};   // apenas o host usa: peerId -> DataConnection
const peerStates = {};  // peerId -> { mic:boolean, screen:boolean } (estado informado pelo próprio participante)
let knownPeers = new Set(); // convidado: quem está na sala segundo o anfitrião
let rosterReady = false;    // evita avisos de "entrou" para quem já estava na sala quando eu cheguei
const redialTimers = {};    // peerId -> timeout da religação
const redialAttempts = {};  // peerId -> nº de tentativas seguidas

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.display = 'none', 2800);
}

function randomRoomCode() {
  const words = ["sol","lua","rio","mar","luz","paz","voo","cha","bao","gato"];
  return words[Math.floor(Math.random()*words.length)] + "-" + Math.floor(1000+Math.random()*9000);
}
$('genRoomBtn').onclick = () => { $('roomInput').value = randomRoomCode(); };

const urlParams = new URLSearchParams(location.search);
if (urlParams.get('room')) $('roomInput').value = urlParams.get('room');

$('joinBtn').onclick = joinCall;

const RTC_CONFIG = {
  iceServers: [
    // Provedores diferentes de propósito: em roteador com duas operadoras (balanceamento de carga)
    // cada um pode sair por um link, e assim os dois IPs públicos viram candidatos.
    // Mais de 4 servidores deixa a coleta de candidatos mais lenta no Firefox.
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
    // TURN: entra sozinho por loadTurn() quando TURN_URL estiver configurado (veja servidor/TURN.md)
  ]
};
// Servidor TURN: retransmite o áudio quando a ligação direta é impossível (4G/5G com CGNAT, rede de empresa).
// Um Cloudflare Worker (servidor/turn-worker.js) devolve credenciais temporárias. Vazio = só STUN, como antes.
const TURN_URL = '';
let turnInfo = 'não configurado';
function mergeTurn(list) {
  const urls = [];
  let username = '', credential = '';
  (Array.isArray(list) ? list : [list]).forEach((s) => {
    if (!s || !s.username) return;
    [].concat(s.urls || []).forEach((u) => { if (/^turns?:/.test(u) && !/:53(\?|$)/.test(u)) urls.push(u); });
    username = s.username; credential = s.credential;
  });
  if (!urls.length) return false;
  // poucas URLs bastam (cada uma é uma tentativa a mais na coleta): UDP, TCP e TLS na 443 para redes bem fechadas
  const pick = ['?transport=udp', ':3478?transport=tcp', 'turns:'].map((k) => urls.find((u) => u.includes(k))).filter(Boolean);
  RTC_CONFIG.iceServers = RTC_CONFIG.iceServers.filter((s) => !s.username);
  RTC_CONFIG.iceServers.push({ urls: pick.length ? pick : urls.slice(0, 3), username, credential });
  return true;
}
async function loadTurn() {
  if (!TURN_URL) return;
  try {
    const c = JSON.parse(sessionStorage.getItem('cz-turn') || 'null');
    if (c && c.exp > Date.now() && mergeTurn(c.ice)) { turnInfo = 'ativo'; return; }
  } catch (e) {}
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch(TURN_URL, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!mergeTurn(j.iceServers)) throw new Error('resposta sem TURN');
    turnInfo = 'ativo';
    // a credencial vale 24 h; guarda por 12 h para não pedir de novo a cada entrada
    try { sessionStorage.setItem('cz-turn', JSON.stringify({ ice: j.iceServers, exp: Date.now() + 12 * 3600e3 })); } catch (e) {}
  } catch (e) { turnInfo = 'falhou (' + (e.name === 'AbortError' ? 'demorou' : e.message) + ')'; }
}
const MAX_TRIES = 10;
let joining = false;
let retryTimer = null;

function setStatus(t) { $('status').textContent = t; }
function note(t) { setStatus(t); if ($('joinScreen').style.display === 'none') toast(t); }
function resumeAudio() { try { const c = getAudioCtx(); if (c.state === 'suspended') c.resume(); } catch (e) {} }
function killPeer() { if (peer) { try { peer.destroy(); } catch (e) {} peer = null; } }
function giveUp(msg) { note(msg); $('joinBtn').disabled = false; joining = false; }

async function joinCall() {
  if (joining) return;
  joining = true;
  $('joinBtn').disabled = true;
  resumeAudio(); // dentro do clique (iPhone exige)
  const typedName = $('nameInput').value.trim();
  myName = typedName || "Anônimo";
  if (typedName) { prefs.name = typedName; savePrefs(); }
  roomId = $('roomInput').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!roomId) { setStatus("Digite ou gere um código de sala."); joining = false; $('joinBtn').disabled = false; return; }

  ensureAudioGraph(); // faixa de áudio de saída fixa: o mic pode entrar/trocar depois sem derrubar as chamadas
  const turnJob = loadTurn();   // em paralelo com o filtro e o mic
  if ((prefs.noise === 'ai' || prefs.noise === 'dfn') && workletSupported()) {
    setStatus("Preparando a supressão de ruído...");
    await prepareNoise(6000, 5000);
  }

  setStatus("Pedindo acesso ao microfone...");
  try {
    localStream = await acquireMicStream();
    hasMic = true;
    await attachMicTrack(localStream.getAudioTracks()[0]);
  } catch (e) {
    // Não trava a entrada: entra mudo e permite ativar depois, de dentro da sala.
    localStream = new MediaStream();
    hasMic = false;
  }

  await turnJob;
  setStatus("Conectando na sala...");
  startPeer(0);
}

function nextTry(attempt, why) {
  if (attempt + 1 >= MAX_TRIES) { giveUp("Não consegui conectar (" + why + "). Verifique a internet e tente de novo."); return; }
  note("Conectando... tentativa " + (attempt + 2));
  retryTimer = setTimeout(() => startPeer(attempt + 1), 1500 + Math.random() * 1500);
}

// Tenta ser o anfitrião (ID fixo da sala). Se o ID já existe, entra como convidado.
function startPeer(attempt) {
  clearTimeout(retryTimer);
  killPeer();
  const hostId = "callzinha-" + roomId;
  const p = new Peer(hostId, Object.assign({ debug: 0, config: RTC_CONFIG }, PEER_OPTIONS));
  peer = p;
  let done = false;
  const timer = setTimeout(() => again('servidor demorou'), 12000);
  function again(why) {
    if (done) return;
    done = true; clearTimeout(timer);
    try { p.destroy(); } catch (e) {}
    nextTry(attempt, why);
  }
  p.on('open', () => {
    if (done) return;
    done = true; clearTimeout(timer);
    isHost = true;
    resetRoomState();
    enterCallUI(); addLocalTile(); listenForGuests(); keepAlive(p);
  });
  p.on('error', (err) => {
    if (done) return;
    if (err.type === 'unavailable-id') {
      done = true; clearTimeout(timer);
      try { p.destroy(); } catch (e) {}
      joinAsGuest(attempt);
    } else again(err.type);
  });
}

// Convidado: só entra na tela da chamada quando o anfitrião realmente responde.
// Se o "anfitrião" for fantasma (saiu/recarregou e o servidor ainda guarda o ID), tenta de novo sozinho.
function joinAsGuest(attempt) {
  const hostId = "callzinha-" + roomId;
  const p = new Peer(undefined, Object.assign({ debug: 0, config: RTC_CONFIG }, PEER_OPTIONS));
  peer = p;
  let ok = false, failed = false;
  const timer = setTimeout(() => fail('sala não respondeu'), 10000);
  function fail(why) {
    if (ok || failed) return;
    failed = true; clearTimeout(timer);
    try { p.destroy(); } catch (e) {}
    nextTry(attempt, why);
  }
  p.on('error', (e) => {
    if (p._relink) p._relink.error(e);
    else fail(e.type);
  });
  p.on('open', () => {
    const conn = p.connect(hostId, { reliable: true });
    conns[hostId] = conn;
    conn.on('open', () => {
      if (failed) return;
      ok = true; clearTimeout(timer);
      isHost = false;
      resetRoomState();
      enterCallUI(); addLocalTile();
      p.on('call', (call) => acceptCall(call));
      conn.send({ type: 'hello', name: myName, av: prefs.avatar || '' });
      sendMyState();
      callPeer(hostId, remoteNames[hostId]);
      keepAlive(p);
      startHostWatch(p);
    });
    wireHostConn(p, conn, () => ok);
  });
}

function wireHostConn(p, conn, isJoined) {
  conn.on('data', (msg) => { if (conns[hostId()] === conn) { lastFromHost = Date.now(); handleData(hostId(), msg); } });
  conn.on('close', () => { if (isJoined() && peer === p && conns[hostId()] === conn) relinkHost(p); });
}

// Canal de dados com o anfitrião caiu. Antes de desmontar a sala inteira, tenta reabrir o canal com o
// MESMO anfitrião: se ele ainda está lá (foi só uma oscilação), as chamadas de áudio continuam intactas.
// Só se ele sumiu de verdade é que todo mundo refaz a entrada (onHostLost).
function relinkHost(p) {
  if (p._relink || peer !== p || p.destroyed) return;
  toast("Conexão com o anfitrião oscilou, reconectando...");
  let tries = 0, conn = null, timer = null;
  const giveUp = () => { clearTimeout(timer); p._relink = null; if (peer === p) onHostLost(); };
  const attempt = () => {
    clearTimeout(timer);
    if (peer !== p || p.destroyed) { p._relink = null; return; }
    if (++tries > 3) { giveUp(); return; }
    if (p.disconnected) { try { p.reconnect(); } catch (e) {} }
    if (conn) { try { conn.close(); } catch (e) {} }
    const c = conn = p.connect(hostId(), { reliable: true });
    timer = setTimeout(attempt, 5000);
    c.on('open', () => {
      // só a tentativa atual vale; uma antiga que abriu atrasada é fechada para o anfitrião não ficar com dois canais
      if (!p._relink || peer !== p || c !== conn) { try { c.close(); } catch (e) {} return; }
      clearTimeout(timer); p._relink = null;
      conns[hostId()] = c; lastFromHost = Date.now();
      wireHostConn(p, c, () => true);
      c.send({ type: 'hello', name: myName, av: prefs.avatar || '' });
      sendMyState();
      if (!calls[hostId()]) callPeer(hostId(), remoteNames[hostId()]);
      toast("Reconectado ao anfitrião");
    });
  };
  p._relink = {
    // o servidor diz que o ID do anfitrião não existe mais: ele saiu, não adianta insistir
    error: (e) => { if (e && e.type === 'peer-unavailable') giveUp(); }
  };
  attempt();
}

// Áudio com essa pessoa ainda passando? (aba em segundo plano pode atrasar o batimento sem a pessoa ter caído)
function mediaAlive(pid) {
  const pc = calls[pid] && calls[pid].peerConnection;
  return !!pc && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
}

// Batimento com o anfitrião: o navegador pode levar 30 s ou mais para perceber um canal morto
let lastFromHost = 0;
const HOST_SILENCE_MS = 15000;
function startHostWatch(p) {
  lastFromHost = Date.now();
  const iv = setInterval(() => {
    if (peer !== p || p.destroyed || isHost) { clearInterval(iv); return; }
    const conn = conns[hostId()];
    if (p._relink || !conn) return;
    safeSend(conn, { type: 'ping' });
    if (Date.now() - lastFromHost > HOST_SILENCE_MS && !mediaAlive(hostId())) { try { conn.close(); } catch (e) {} relinkHost(p); }
  }, 4000);
}

// Reconecta ao servidor de sinalização sem perder o ID (insiste a cada 3 s enquanto estiver desconectado)
function keepAlive(p) {
  let t = null;
  const tick = () => {
    clearTimeout(t);
    if (peer !== p || p.destroyed) return;
    if (p.disconnected) { try { p.reconnect(); } catch (e) {} t = setTimeout(tick, 3000); }
  };
  p.on('disconnected', () => { toast("Conexão com o servidor caiu, reconectando..."); tick(); });
  p.on('open', () => { clearTimeout(t); });
  p._czTick = tick;
}
// A rede voltou, mudou (Wi-Fi <-> 4G) ou a página voltou do segundo plano: reconecta ao servidor
// e religa as chamadas que ficaram "penduradas"
function recheckConnection() {
  if (!peer || peer.destroyed) return;
  if (peer._czTick) peer._czTick();
  Object.keys(calls).forEach((id) => {
    const pc = calls[id] && calls[id].peerConnection;
    if (pc && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) { try { calls[id].close(); } catch (e) {} }
  });
  if (!isHost && !peer._relink && conns[hostId()] && Date.now() - lastFromHost > 6000) safeSend(conns[hostId()], { type: 'ping' });
}
window.addEventListener('online', recheckConnection);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheckConnection(); });
if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', recheckConnection);

// Zera o que é "estado da sala" (ao entrar ou quando o anfitrião muda)
function resetRoomState() {
  knownPeers = new Set(); rosterReady = false; bigRoomWarned = false;
  for (const id of Object.keys(peerStates)) delete peerStates[id];
  for (const id of Object.keys(redialTimers)) { clearTimeout(redialTimers[id]); delete redialTimers[id]; }
  for (const id of Object.keys(redialAttempts)) delete redialAttempts[id];
  for (const id of Object.keys(leaveTimers)) { clearTimeout(leaveTimers[id]); delete leaveTimers[id]; }
}

// Anfitrião caiu: todo mundo refaz a entrada; o primeiro vira o novo anfitrião, os outros entram nele.
function onHostLost() {
  toast("O anfitrião saiu, reconectando...");
  for (const id of Object.keys(calls)) { killCall(id); removeRemoteTile(id); }
  for (const id of Object.keys(conns)) delete conns[id];
  for (const id of Object.keys(hostConns)) delete hostConns[id];
  resetRoomState();
  killPeer();
  setTimeout(() => startPeer(0), Math.random() * 1500);
}

function enterCallUI() {
  $('joinScreen').style.display = 'none';
  $('callScreen').style.display = 'flex';
  $('roomLabel').textContent = roomId;
  if (!hasMic) showMediaBanner();
  $('netBadge').style.display = 'none';
  applyLayout(); refreshShortcutLabels(); startStatsLoop();
  markInRoom(); setInterval(markInRoom, 20000);
  startSoundKeys();
}

// Se a página recarregar no meio da chamada (no iPhone, quando falta memória, aparece "esta página foi recarregada"),
// o lobby oferece voltar para a mesma sala com um toque. O toque é obrigatório: sem ele o iPhone não libera o som.
const REJOIN_KEY = 'cz-na-sala', REJOIN_MS = 15 * 60e3;
function markInRoom() { try { localStorage.setItem(REJOIN_KEY, JSON.stringify({ room: roomId, t: Date.now() })); } catch (e) {} }
function clearInRoom() { try { localStorage.removeItem(REJOIN_KEY); } catch (e) {} }
function offerRejoin() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null'); } catch (e) {}
  if (!r || !r.room || Date.now() - r.t > REJOIN_MS) { clearInRoom(); return; }
  $('roomInput').value = r.room;
  $('rejoinRoom').textContent = r.room;
  $('rejoinBox').hidden = false;
  $('rejoinBtn').onclick = () => { $('rejoinBox').hidden = true; joinCall(); };
  $('rejoinNo').onclick = () => { $('rejoinBox').hidden = true; clearInRoom(); };
}

function showMediaBanner() {
  if (document.getElementById('mediaBanner')) return;
  setCtrlIcon('micBtn', 'mic-off'); $('micBtn').classList.add('off'); $('micBtn').classList.remove('active');
  const banner = document.createElement('div');
  banner.id = 'mediaBanner';
  banner.innerHTML =
    '<span>' + icon('alert') + ' Você entrou sem microfone. Os outros conseguem te ouvir assim que você ativar.</span>' +
    '<button id="enableMediaBtn" class="btn-primary" style="padding:8px 14px;white-space:nowrap;">' + icon('mic') + ' Ativar microfone</button>';
  $('callScreen').insertBefore(banner, $('grid'));
  document.getElementById('enableMediaBtn').onclick = enableMic;
}

async function enableMic() {
  const btn = document.getElementById('enableMediaBtn');
  if (btn) { btn.textContent = "Pedindo acesso..."; btn.disabled = true; }
  try {
    localStream = await acquireMicStream();
    hasMic = true; micOn = true;
    await attachMicTrack(localStream.getAudioTracks()[0]);
    setCtrlIcon('micBtn', 'mic');
    $('micBtn').classList.add('active'); $('micBtn').classList.remove('off');
    applyMicGain();
    // Não precisa refazer as chamadas: a faixa de áudio enviada já existe desde a entrada e agora passa a ter o mic.
    sendMyState();

    const banner = document.getElementById('mediaBanner');
    if (banner) banner.remove();
    toast("Microfone ativado!");
  } catch (e) {
    if (btn) { btn.innerHTML = icon('mic') + ' Ativar microfone'; btn.disabled = false; }
    const reasons = {
      NotAllowedError: "Permissão negada. Clique no cadeado 🔒 ao lado do endereço e permita o microfone.",
      NotFoundError: "Nenhum microfone foi encontrado pelo navegador.",
      NotReadableError: "Outro programa está usando o microfone agora."
    };
    toast(reasons[e.name] || "Não consegui ativar o microfone.");
  }
}

// No app (Electron/Android/iOS) o endereço é interno, então o convite aponta pro site público
const PUBLIC_URL = 'https://erosxv.github.io/JANEMBA/';
const IN_APP = !/^https?:$/.test(location.protocol) || location.hostname === 'localhost' || !!window.Capacitor;

$('copyLinkBtn').onclick = () => {
  const base = IN_APP ? PUBLIC_URL : location.origin + location.pathname;
  const link = base + "?room=" + encodeURIComponent(roomId);
  navigator.clipboard.writeText(link).then(() => toast("Link copiado! Manda pra galera 🎉"));
};

function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? [...w[0]][0] + [...w[1]][0] : [...(w[0] || '?')].slice(0, 2).join('')).toUpperCase();
}

// Botões da tela compartilhada (tela cheia, chat, girar, sair): servem para a tela dos outros e para a sua
function addTileActions(tile) {
  const actions = document.createElement('div');
  actions.className = 'tile-actions';
  actions.innerHTML = '<button class="act act-full" title="Tela cheia (F)">' + icon('maximize') + '</button><button class="act act-chat" title="Chat (Enter)">' + icon('chat') + '</button><button class="act act-rotate" title="Girar tela">' + icon('rotate') + '</button><button class="act act-exit" title="Sair da tela cheia (Esc)">' + icon('x') + '</button>';
  actions.querySelector('.act-full').onclick = () => enterTheater(tile);
  actions.querySelector('.act-chat').onclick = () => toggleChat();
  actions.querySelector('.act-rotate').onclick = rotateTheater;
  actions.querySelector('.act-exit').onclick = exitTheater;
  tile.appendChild(actions);
}

function addLocalTile() {
  if (document.getElementById('tile-local')) return;
  const tile = document.createElement('div');
  tile.className = 'tile mine';
  tile.id = 'tile-local';
  const video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  const tag = document.createElement('div');
  tag.className = 'tag';
  buildTag(tag);
  const volbar = document.createElement('div');
  volbar.className = 'volbar';
  volbar.innerHTML = '<div class="volfill"></div>';
  const myVolControl = document.createElement('div');
  myVolControl.className = 'vol-control';
  myVolControl.title = "Volume da sua própria voz enviada pra chamada";
  myVolControl.innerHTML = '<span>' + icon('mic') + '</span><input type="range" id="myMicVolSlider" min="0" max="200" value="' + micVolumePercent + '">';
  myVolControl.querySelector('input').oninput = (e) => setMicVolume(Number(e.target.value), 'tile');
  tile.appendChild(video); tile.appendChild(avatar); tile.appendChild(tag); tile.appendChild(volbar); tile.appendChild(myVolControl);
  addTileActions(tile);
  const mic = document.createElement('div'); mic.className = 'micst'; tile.appendChild(mic);
  const sb = document.createElement('div'); sb.className = 'state-badges'; tile.appendChild(sb);
  setTileName(tile, myName, prefs.avatar);
  tile.addEventListener('dblclick', (e) => { if (!e.target.closest('.vol-control, .tile-actions')) togglePin('tile-local'); });
  $('grid').appendChild(tile);
  updateCount();
  attachVolumeMeter(null, 'tile-local'); // o medidor local lê a cadeia de áudio (depois do ganho e do mudo)
  renderBadges('local');
  applyLayout();
}

// Cada pessoa manda a própria voz para todas as outras (ligação direta): até 8 foi testado e fica liso;
// acima disso, quem tem internet fraca (upload) começa a picotar. Avisa uma vez por sala.
const BIG_ROOM = 8;
let bigRoomWarned = false;
function updateCount() {
  const n = $('grid').children.length;
  $('peerCount').textContent = n;
  if (n > BIG_ROOM && !bigRoomWarned) {
    bigRoomWarned = true;
    notify('Sala grande (' + n + ' pessoas): cada um envia a voz para todos. Se alguém picotar, a internet dessa pessoa (upload) está no limite.', true);
  }
}

function addRemoteTile(peerId, name) {
  let tile = document.getElementById('tile-' + peerId);
  if (tile) return tile.querySelector('video');
  tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = 'tile-' + peerId;
  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  const tag = document.createElement('div');
  tag.className = 'tag';
  buildTag(tag);
  const volbar = document.createElement('div');
  volbar.className = 'volbar';
  volbar.innerHTML = '<div class="volfill"></div>';
  const volControl = document.createElement('div');
  volControl.className = 'vol-control';
  volControl.innerHTML = '<span>' + icon('volume') + '</span><input type="range" min="0" max="100" value="100">';
  volControl.querySelector('input').oninput = (e) => {
    video.volume = e.target.value / 100;
  };
  tile.appendChild(video); tile.appendChild(avatar); tile.appendChild(tag); tile.appendChild(volbar); tile.appendChild(volControl);
  addTileActions(tile);
  const sbadge = document.createElement('div'); sbadge.className = 'screen-badge'; sbadge.innerHTML = icon('monitor') + 'compartilhando tela'; tile.appendChild(sbadge);
  const mic = document.createElement('div'); mic.className = 'micst'; tile.appendChild(mic);
  const sb = document.createElement('div'); sb.className = 'state-badges'; tile.appendChild(sb);
  setTileName(tile, name || 'Participante', remoteAvatars[peerId]);
  // controles do anfitrião (mutar ou tirar da sala)
  const hc = document.createElement('div'); hc.className = 'hostctl';
  hc.innerHTML = '<button class="hc-mute" title="Mutar esta pessoa">' + icon('mic-off') + '</button><button class="hc-kick" title="Tirar da sala">' + icon('x') + '</button>';
  hc.querySelector('.hc-mute').onclick = (e) => { e.stopPropagation(); hostMute(peerId); };
  hc.querySelector('.hc-kick').onclick = (e) => { e.stopPropagation(); hostKick(peerId); };
  tile.appendChild(hc);
  tile.addEventListener('dblclick', (e) => { if (!e.target.closest('.vol-control, .tile-actions')) togglePin('tile-' + peerId); });
  applySink(video);
  $('grid').appendChild(tile);
  updateCount();
  applyPeerState(peerId);
  return video;
}

function removeRemoteTile(peerId) {
  const tile = document.getElementById('tile-' + peerId);
  if (theater && tile && theater.tile === tile) exitTheater();
  if (pinnedId === 'tile-' + peerId) pinnedId = null;
  stopMeter('tile-' + peerId);
  if (tile) tile.remove();
  updateCount();
  applyLayout();
}
