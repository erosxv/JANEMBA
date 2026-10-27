// CallZinha — chat, reações, extras, avatares, sons, controles do anfitrião e app de Android. Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
// ================= chat da sala e reações =================
// Mesmo caminho das outras mensagens: o convidado manda para o anfitrião, que repassa para os outros com o campo from.
const CHAT_MAX = 200, CHAT_HISTORY = 50;
const CHAT_TTL = 30 * 60 * 1000;   // cada mensagem some 30 minutos depois de enviada
const REACTIONS = ['😂', '😭', '😐', '😱', '😍', '👏'];
let chatLog = [], chatUnread = 0, lastReactAt = 0;
const reactSeen = {};   // anfitrião: peerId -> última reação (segura quem clica sem parar)

function cleanText(t) { return String(t == null ? '' : t).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, 500); }
function fmtClock(t) { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function sendRoom(msg) {
  if (!peer) return;
  if (isHost) { for (const id in hostConns) safeSend(hostConns[id], Object.assign({}, msg, { from: peer.id })); }
  else safeSend(conns[hostId()], msg);
}

function chatOpen() { return (chatDocked && !theater) || !$('chatPanel').classList.contains('closed'); }
function toggleChat(force) {
  if (chatDocked && !theater) {   // Ao vivo: o chat não fecha, só ganha ou perde o foco
    if (force === false) $('chatInput').blur(); else $('chatInput').focus();
    return;
  }
  const open = typeof force === 'boolean' ? force : !chatOpen();
  $('chatPanel').classList.toggle('closed', !open);
  $('chatBtn').classList.toggle('active', open);
  if (open) {
    if (!$('musicPanel').classList.contains('closed')) toggleMusicPanel(false);
    chatUnread = 0; renderChatBadge();
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    setTimeout(() => $('chatInput').focus(), 0);
  } else if (document.activeElement === $('chatInput')) $('chatInput').blur();
}
function renderChatBadge() {
  const b = $('chatBadge');
  b.textContent = chatUnread > 9 ? '9+' : String(chatUnread);
  b.style.display = chatUnread ? 'block' : 'none';
}

function renderChatLine(m) {
  const log = $('chatLog');
  const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const d = document.createElement('div'); d.className = 'cmsg' + (m.me ? ' me' : '') + (m.sys ? ' sys' : '');
  if (m.sys) {
    const time = document.createElement('span'); time.className = 'ctime'; time.textContent = fmtClock(m.t);
    d.append(m.text, time);
    m.el = d; log.appendChild(d);
    while (log.children.length > CHAT_MAX) log.firstChild.remove();
    if (atEnd) log.scrollTop = log.scrollHeight;
    return;
  }
  const who = document.createElement('span'); who.className = 'cwho'; who.textContent = m.me ? 'Você' : m.name;
  const time = document.createElement('span'); time.className = 'ctime'; time.textContent = fmtClock(m.t);
  const text = document.createElement('div'); text.className = 'ctext'; text.textContent = m.text;
  d.append(who, time, text);
  m.el = d;
  log.appendChild(d);
  while (log.children.length > CHAT_MAX) log.firstChild.remove();
  if (atEnd || m.me) log.scrollTop = log.scrollHeight;
}
function addChat(name, text, me, t) {
  const m = { name, text, me, t: t || Date.now() };
  chatLog.push(m);
  if (chatLog.length > CHAT_MAX) chatLog.shift();
  renderChatLine(m);
  if (!me && !chatOpen()) {
    chatUnread++; renderChatBadge();
    notify('💬 ' + name + ': ' + (text.length > 90 ? text.slice(0, 90) + '…' : text), true);
  }
}

function receiveChat(from, msg) {
  const text = cleanText(msg.text);
  if (!text) return;
  addChat(nameOf(from), text, false);
  if (isHost) relay(from, { type: 'chat', text });
}
function chatHistoryPayload() {
  const now = Date.now();
  return { type: 'chat-history', items: chatLog.filter(m => !m.sys && now - m.t < CHAT_TTL).slice(-CHAT_HISTORY).map(m => ({ name: m.me ? myName : m.name, text: m.text, t: m.t })) };
}
// Quem acabou de entrar recebe as últimas mensagens; quem já tinha (troca de anfitrião) ignora, pra não duplicar
function receiveChatHistory(msg) {
  if (chatLog.length || !Array.isArray(msg.items)) return;
  msg.items.slice(-CHAT_HISTORY).forEach((it) => {
    const text = cleanText(it && it.text);
    if (!text) return;
    const now = Date.now();
    const t = Math.min(Number(it.t) || now, now);   // relógio de outra pessoa pode estar adiantado
    if (now - t >= CHAT_TTL) return;
    const m = { name: cleanName(it.name) || 'Participante', text, me: false, t };
    chatLog.push(m); renderChatLine(m);
  });
}

// Apaga as mensagens com mais de 30 minutos. Cada pessoa apaga a própria cópia, então some para todo mundo
// (e quem entra depois não recebe nada mais velho que isso)
function pruneChat() {
  const now = Date.now();
  while (chatLog.length && now - chatLog[0].t >= CHAT_TTL) {
    const m = chatLog.shift();
    if (m.el) m.el.remove();
  }
}
setInterval(pruneChat, 30000);

function sendReaction(i) {
  if (!REACTIONS[i] || !peer) return;
  const now = Date.now();
  if (now - lastReactAt < 250) return;
  lastReactAt = now;
  showReaction(i, myName, 'local');
  sendRoom({ type: 'react', i });
}
function receiveReaction(from, msg) {
  if (!Number.isInteger(msg.i) || !REACTIONS[msg.i]) return;
  if (isHost) {
    const now = Date.now();
    if (now - (reactSeen[from] || 0) < 150) return;
    reactSeen[from] = now;
    relay(from, { type: 'react', i: msg.i });
  }
  showReaction(msg.i, nameOf(from), from);
}
function showReaction(i, name, pid) {
  const tile = document.getElementById(pid === 'local' ? 'tile-local' : 'tile-' + pid);
  if (tile) {
    const old = tile.querySelector('.rbubble'); if (old) old.remove();
    const b = document.createElement('span'); b.className = 'rbubble'; b.textContent = REACTIONS[i];
    tile.appendChild(b);
    b.addEventListener('animationend', () => b.remove());
  }
  const layer = $('reactLayer');
  if (layer.children.length >= 40) layer.firstChild.remove();
  const f = document.createElement('div'); f.className = 'fly';
  f.style.left = (8 + Math.random() * 80) + '%';
  f.style.setProperty('--dx', Math.round(Math.random() * 80 - 40) + 'px');
  const e = document.createElement('span'); e.textContent = REACTIONS[i];
  const n = document.createElement('small'); n.textContent = name;
  f.append(e, n);
  layer.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
}

REACTIONS.forEach((em, i) => {
  const b = document.createElement('button');
  b.textContent = em; b.title = 'Reagir ' + em + ' (tecla ' + (i + 1) + ')';
  b.onclick = () => sendReaction(i);
  $('reactBar').appendChild(b);
});
function applyReactBar() {
  document.body.classList.toggle('react-off', !prefs.reactBar);
  $('reactBtn').classList.toggle('on', !!prefs.reactBar);
}
applyReactBar();
$('reactBtn').onclick = () => {
  prefs.reactBar = !prefs.reactBar; savePrefs(); applyReactBar();
  toast(prefs.reactBar ? 'Botões de reação visíveis' : 'Botões de reação escondidos (teclas 1 a 6 continuam funcionando)');
};

$('chatBtn').onclick = () => toggleChat();
$('chatClose').onclick = () => toggleChat(false);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); toggleChat(false); } });
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const text = cleanText($('chatInput').value);
  if (!text) return;
  $('chatInput').value = '';
  const cmd = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
  const verb = cmd ? cmd[1].toLowerCase() : '';
  if (verb === 'play' || verb === 'tocar') {
    if (!cmd[2].trim()) { toggleMusicPanel(true); return; }
    queueSearch(cmd[2].trim()).then((ok) => { if (ok) addSysChat('🎵 Você pediu: ' + cmd[2].trim()); });
    return;
  }
  if (verb === 'pular' || verb === 'skip') { if (musicTrack()) { musicCommand({ cmd: 'next' }); toast('⏭ Pulando a música'); } else toast('Nada tocando agora'); return; }
  if (cmd && FX_COMMANDS.includes(verb)) {
    loadExtras().then((x) => x.command(cmd[1].toLowerCase(), cmd[2].trim())).catch(() => toast('Não deu para carregar os extras. Confira a internet.'));
    return;
  }
  addChat(myName, text, true);
  sendRoom({ type: 'chat', text });
};

// ================= extras (sons, roleta, dado, moeda, enquete) =================
// Tudo isso mora em extras/festa.js, que só é baixado quando alguém usa: quem só conversa não carrega nada a mais.
const FX_VER = '7';
const FX_COMMANDS = ['ajuda', 'dado', 'moeda', 'roleta', 'enquete', 'som'];
const fxSeen = {};   // anfitrião: peerId -> último extra repassado (segura quem clica sem parar)
const fxModules = {};
function loadModule(file, global) {
  if (!fxModules[file]) {
    fxModules[file] = new Promise((ok, fail) => {
      const sc = document.createElement('script');
      sc.src = 'extras/' + file + '.js?v=' + FX_VER;
      sc.onload = () => window[global] ? ok(window[global].init(fxApi)) : fail();
      sc.onerror = fail;
      document.head.appendChild(sc);
    }).catch((e) => { delete fxModules[file]; throw e; });
  }
  return fxModules[file];
}
const loadExtras = () => loadModule('festa', 'CZFesta');
const loadGames = () => loadModule('jogos', 'CZJogos');
function addSysChat(text) {
  const m = { sys: true, text: cleanText(text), t: Date.now() };
  chatLog.push(m);
  if (chatLog.length > CHAT_MAX) chatLog.shift();
  renderChatLine(m);
}
const fxApi = {
  send: (m) => sendRoom(Object.assign({}, m, { type: 'fx' })),
  toast, nameOf, cleanName, cleanText, getAudioCtx, sysChat: addSysChat,
  layer: () => $('fxLayer'),
  button: () => $('extrasBtn'),
  gamesButton: () => $('gamesBtn'),
  ver: FX_VER,
  searchMusic: (q, n) => searchMusic(q, n),
  fetchVideoInfo: (id) => fetchVideoInfo(id),
  ensureYT: () => loadYTApi(),
  duckMusic: (on) => { musicDucked = !!on; applyMusicVolume(); },
  myId: () => (peer ? peer.id : 'local'),
  myName: () => myName,
  people: () => [{ id: peer ? peer.id : 'local', name: myName }].concat(Object.keys(remoteNames).filter(isPeerPresent).map((id) => ({ id, name: nameOf(id) }))),
  closeOthers: () => {
    if (!$('musicPanel').classList.contains('closed')) toggleMusicPanel(false);
    if (window.innerWidth < 700 && !(chatDocked && !theater) && chatOpen()) toggleChat(false);
  },
};
function receiveFx(from, msg) {
  if (typeof msg.k !== 'string') return;
  const game = msg.k === 'g';
  try { if (JSON.stringify(msg).length > (game ? 8000 : 1500)) return; } catch (e) { return; }
  if (isHost) {
    const now = Date.now();
    const key = (game ? 'g:' : '') + from;
    if (now - (fxSeen[key] || 0) < (game ? 40 : 200)) return;
    fxSeen[key] = now;
    relay(from, msg);
  }
  (game ? loadGames() : loadExtras()).then((x) => x.receive(from, msg)).catch(() => {});
}
$('gamesBtn').onclick = () => {
  const b = $('gamesBtn');
  b.classList.add('loading');
  loadGames().then((x) => x.toggle()).catch(() => toast('Não deu para carregar os jogos. Confira a internet.')).then(() => b.classList.remove('loading'));
};
$('extrasBtn').onclick = () => {
  const b = $('extrasBtn');
  b.classList.add('loading');
  loadExtras().then((x) => x.toggle()).catch(() => toast('Não deu para carregar os extras. Confira a internet.')).then(() => b.classList.remove('loading'));
};

// Mouse parado por 2,5 s: some com as reações, os botões da tela cheia e o cursor
let idleTimer = null, wasIdle = false;
// No celular o navegador deixa o último botão tocado "com o mouse em cima" para sempre: só conta hover de mouse de verdade
const realHover = window.matchMedia ? window.matchMedia('(hover: hover)') : { matches: true };
function wake() {
  wasIdle = document.body.classList.contains('idle');
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (document.activeElement === $('chatInput') || (realHover.matches && document.querySelector('#reactBar:hover, #chatPanel:hover, #musicPanel:hover, .tile-actions:hover, .vol-control:hover'))) { wake(); return; }
    document.body.classList.add('idle');
  }, 2500);
}
['mousemove', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
wake();
// Tela cheia no celular: tocar no vídeo mostra os controles; tocar de novo esconde na hora
document.addEventListener('pointerup', (e) => {
  if (!theater || e.pointerType === 'mouse' || !theater.tile.contains(e.target)) return;
  if (e.target.closest('button, input, label, .vol-control, #chatPanel, #reactBar')) return;
  if (!wasIdle) { clearTimeout(idleTimer); document.body.classList.add('idle'); }
});

// ================= avatares: 24 heróis originais (desenhados aqui, não são personagens de editoras), foto ou iniciais =================
// O avatar fica guardado no aparelho (prefs.avatar) e vai para a sala junto com o nome: 'h:N' (herói) ou uma foto pequena em JPEG.
const HEROES = [
  ['Relâmpago', '#1d3b7a', '#e8b400', '#b81d24', '#2a1a10', 'bolt'],   ['Capitã Estrela', '#7a1d2b', '#1f4fa8', '#1f4fa8', '#e2b04a', 'star'],
  ['Sombra Noturna', '#151a2b', '#2b2f3d', '#0b0d14', '#0b0d14', 'moon'], ['Fênix', '#7a2e0e', '#d9531e', '#f2b134', '#c2410c', 'flame'],
  ['Muralha', '#2f4a2a', '#5a7d3a', '#3a3f2a', '#3b2a1a', 'shield'],     ['Tsunami', '#0d4a5a', '#1aa0b8', '#0d4a5a', '#2a1a10', 'wave'],
  ['Pantera', '#1a1a1f', '#3b2d4f', '#141018', '#141018', 'claw'],       ['Coruja', '#3a2a1a', '#7a5a2a', '#4a3520', '#6b4a2a', 'eye'],
  ['Cometa', '#2a1a5a', '#6a3fd1', '#ffffff', '#f2f2f2', 'star'],        ['Trovão', '#3a3a4a', '#7f8a9a', '#2a2f3a', '#e8e8e8', 'bolt'],
  ['Raposa', '#5a2a0e', '#d97a1e', '#5a2a0e', '#c2410c', 'leaf'],        ['Vespa', '#3a3200', '#e8c400', '#1a1a1a', '#1a1a1a', 'diamond'],
  ['Aurora', '#0e3a3a', '#2fc7a0', '#7a3fd1', '#f2c7e0', 'crown'],       ['Ciclone', '#1a3a4a', '#5ab0d9', '#1a3a4a', '#2a2a2a', 'wave'],
  ['Faísca', '#4a1a1a', '#e83a3a', '#f2b134', '#f2b134', 'bolt'],        ['Geada', '#1a3a5a', '#bfe6ff', '#5ab0d9', '#ffffff', 'diamond'],
  ['Vulcão', '#3a1408', '#a3290e', '#1a0a05', '#1a0a05', 'flame'],       ['Lua Negra', '#120f24', '#3a2f6a', '#0b0a14', '#cfc7ff', 'moon'],
  ['Escudo', '#0e2a5a', '#c7cdd8', '#b81d24', '#3b2a1a', 'shield'],      ['Falcão', '#2a1f14', '#8a6a3a', '#3a2a1a', '#3a2a1a', 'eye'],
  ['Nebulosa', '#2a0e3a', '#b03fd1', '#3a0e5a', '#ff8ad8', 'star'],      ['Titã', '#3a2a0e', '#b08a3a', '#5a3a0e', '#2a1a0e', 'crown'],
  ['Viúva Escarlate', '#2a0a10', '#1a1a1f', '#b81d24', '#b81d24', 'heart'], ['Guardião Verde', '#0e2a14', '#2a8a3a', '#0e3a1a', '#1a1a10', 'leaf']
];
const HERO_SKIN = ['#f1c7a3', '#d9a27c', '#a86b4a', '#7a4a32', '#f5d6b8'];
const EMBLEM = {
  bolt: 'M34 46 L28 54 H32 L30 61 L37 52 H33 L35 46 Z',
  star: 'M32 45 L34.4 50.2 L40 50.8 L35.8 54.4 L37 60 L32 57.2 L27 60 L28.2 54.4 L24 50.8 L29.6 50.2 Z',
  moon: 'M35 46 A7 7 0 1 0 35 60 A5.5 5.5 0 1 1 35 46 Z',
  flame: 'M32 45 C36 50 38 53 36 57 C35 59.5 33.5 61 32 61 C29 61 27 58.5 27.5 55.5 C28 53 30 52 30.5 49 C32 51 33 52 33 54 C34 52 34 49 32 45 Z',
  shield: 'M32 45 L39 47.5 V53 C39 57 36 59.5 32 61 C28 59.5 25 57 25 53 V47.5 Z',
  wave: 'M24 55 C26 51 29 51 31 54 C33 57 36 57 38 53 L40 53 C38 59 33 60 30 57 C28 55 26 55 25 57 Z',
  claw: 'M27 46 L29 60 M32 45 L32 61 M37 46 L35 60',
  eye: 'M24 53 C28 47 36 47 40 53 C36 59 28 59 24 53 Z M32 50.5 A2.5 2.5 0 1 0 32 55.5 A2.5 2.5 0 1 0 32 50.5 Z',
  leaf: 'M26 59 C26 50 31 46 39 46 C39 54 35 59 26 59 Z M27 58 L35 50',
  diamond: 'M32 45 L39 53 L32 61 L25 53 Z',
  crown: 'M25 58 L26 49 L29.5 53 L32 47 L34.5 53 L38 49 L39 58 Z',
  heart: 'M32 60 C25 55 24 51 26.5 48.5 C28.5 46.5 31 47.5 32 49.5 C33 47.5 35.5 46.5 37.5 48.5 C40 51 39 55 32 60 Z'
};
function heroSVG(n) {
  const [, bg, suit, mask, hair, emb] = HEROES[n];
  const skin = HERO_SKIN[n % HERO_SKIN.length];
  const stroke = emb === 'claw';
  return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="' + bg + '"/>'
    + '<path d="M8 64 C10 46 21 41 32 41 C43 41 54 46 56 64 Z" fill="' + suit + '"/>'
    + '<circle cx="32" cy="27" r="13" fill="' + skin + '"/>'
    + '<path d="M19 26 C19 12 45 12 45 26 C42 19 22 19 19 26 Z" fill="' + hair + '"/>'
    + '<path d="M18.5 25 Q32 20 45.5 25 L45 30.5 Q32 26.5 19 30.5 Z" fill="' + mask + '"/>'
    + '<ellipse cx="26" cy="27.3" rx="3.2" ry="1.7" fill="#fff"/><ellipse cx="38" cy="27.3" rx="3.2" ry="1.7" fill="#fff"/>'
    + '<path d="M28 34.5 Q32 37 36 34.5" stroke="#5a3a2a" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
    + '<path d="' + EMBLEM[emb] + '" ' + (stroke ? 'stroke="#f2f2f2" stroke-width="2.2" stroke-linecap="round" fill="none"' : 'fill="#f6f1e4"') + '/></svg>';
}
const remoteAvatars = {};
function cleanAvatar(av) {
  av = String(av || '');
  const m = /^h:(\d{1,2})$/.exec(av);
  if (m && Number(m[1]) < HEROES.length) return av;
  if (av.startsWith('p:data:image/jpeg;base64,') && av.length < 60000 && /^[A-Za-z0-9+/=]+$/.test(av.slice(25))) return av;
  return '';
}
function avatarMarkup(av) {
  av = cleanAvatar(av);
  if (av.startsWith('h:')) return heroSVG(Number(av.slice(2)));
  if (av.startsWith('p:')) return '<img alt="" src="' + av.slice(2) + '">';
  return '';
}
function setRemoteAvatar(pid, av) {
  const v = cleanAvatar(av);
  if ((remoteAvatars[pid] || '') === v) return;
  remoteAvatars[pid] = v;
  updateTileName(pid);
}
function renderAvatarPreview() {
  const p = $('avatarPreview'), pic = avatarMarkup(prefs.avatar);
  if (pic) p.innerHTML = pic; else p.textContent = initials($('nameInput').value.trim() || prefs.name || '?');
  document.querySelectorAll('#avatarGrid .avopt').forEach((b) => b.classList.toggle('sel', prefs.avatar === 'h:' + b.dataset.n));
}
function setMyAvatar(av) {
  prefs.avatar = cleanAvatar(av); savePrefs();
  renderAvatarPreview();
  const tile = $('tile-local'); if (tile) setTileName(tile, myName, prefs.avatar);
  sendMyName();
  if (isHost && peer) broadcastRoster();
}
HEROES.forEach((hero, n) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'avopt'; b.dataset.n = n;
  b.innerHTML = heroSVG(n); b.append(hero[0]);
  b.onclick = () => { setMyAvatar('h:' + n); $('avatarModal').hidden = true; };
  $('avatarGrid').appendChild(b);
});
// foto: recorta o meio em quadrado e reduz para 128x128 (fica leve para mandar para a sala)
$('avatarFile').onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const img = await createImageBitmap(f);
    const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 128;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
    let url = c.toDataURL('image/jpeg', 0.8);
    if (url.length > 55000) url = c.toDataURL('image/jpeg', 0.5);
    setMyAvatar('p:' + url); $('avatarModal').hidden = true;
  } catch (err) { toast('Não consegui usar essa imagem. Tente outra.'); }
};
$('avatarNone').onclick = () => { setMyAvatar(''); $('avatarModal').hidden = true; };
const openAvatarPicker = () => { renderAvatarPreview(); $('avatarModal').hidden = false; };
$('avatarPick').onclick = openAvatarPicker;
$('setAvatarBtn').onclick = openAvatarPicker;
$('avatarClose').onclick = () => { $('avatarModal').hidden = true; };
$('avatarModal').addEventListener('click', (e) => { if (e.target === $('avatarModal')) $('avatarModal').hidden = true; });
$('nameInput').addEventListener('input', renderAvatarPreview);
renderAvatarPreview();

// ================= sons de entrada e saída (um "plim" curtinho, gerado na hora) =================
function playCue(up) {
  if (!prefs.sounds) return;
  try {
    const ctx = getAudioCtx(), t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(up ? 660 : 880, t); o.frequency.linearRampToValueAtTime(up ? 990 : 520, t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.32);
  } catch (e) {}
}

// ================= controles do anfitrião (quem abriu a sala): mutar ou tirar alguém =================
// Só o anfitrião manda; o convidado só obedece se a mensagem veio do anfitrião.
function hostMute(pid) {
  if (!isHost) return;
  safeSend(hostConns[pid], { type: 'host-mute' });
  toast(nameOf(pid) + ' foi mutado');
}
function hostKick(pid) {
  if (!isHost || !confirm('Tirar ' + nameOf(pid) + ' da sala?')) return;
  safeSend(hostConns[pid], { type: 'kick' });
  setTimeout(() => { const c = hostConns[pid]; try { if (c) c.close(); } catch (e) {} }, 500);
  toast(nameOf(pid) + ' foi tirado da sala');
}

// ================= compartilhar só o áudio =================
// O navegador só libera o som de outra aba/programa junto com uma tela: a imagem é descartada na hora e só o som vai para a sala.
let audioShareStream = null;
async function toggleAudioShare() {
  if (audioShareStream) { stopAudioShare(); return; }
  if (sharingScreen) { toast('Você já está compartilhando a tela. O som dela vai junto se você marcou "Compartilhar áudio".'); return; }
  let s;
  // A janela de escolha já abre em "Janela": escolhendo um programa (Spotify, jogo), vai só o som dele.
  // Tela inteira = som do PC todo; aba do navegador = som só daquela aba.
  try { s = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'window' }, audio: Object.assign({}, SCREEN_AUDIO), systemAudio: 'include', windowAudio: 'window', selfBrowserSurface: 'exclude' }); }
  catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return;   // usuário cancelou
    try { s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); } catch (e2) { return; }   // navegador não aceitou as opções
  }
  const at = s.getAudioTracks()[0];
  const vt = s.getVideoTracks()[0];
  const surface = vt && vt.getSettings ? vt.getSettings().displaySurface : '';
  s.getVideoTracks().forEach((t) => t.stop());
  if (!at) {
    toast(surface === 'window' ? 'Este navegador não manda o som de uma janela sozinha. Escolha a aba (no Chrome) ou a tela inteira.' : 'Faltou marcar "Compartilhar áudio" na janela. Tente de novo.');
    return;
  }
  audioShareStream = s;
  connectScreenAudio(at);
  $('audioShareBtn').classList.add('active');
  toast(surface === 'monitor' ? 'Compartilhando o som do PC inteiro. Para mandar só um programa, escolha a janela dele.' : 'Compartilhando só o áudio');
  at.onended = () => { if (audioShareStream === s) stopAudioShare(); };
}
function stopAudioShare(quiet) {
  const s = audioShareStream; audioShareStream = null;
  if (s) s.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  disconnectScreenAudio();
  $('audioShareBtn').classList.remove('active');
  if (!quiet) toast('Parou de compartilhar o áudio');
}
$('audioShareBtn').onclick = toggleAudioShare;

// ================= vídeo do YouTube grande no palco (cada um escolhe para si) =================
function toggleYtStage(force) {
  const on = typeof force === 'boolean' ? force : !document.body.classList.contains('yt-stage');
  if (on && !musicTrack()) { toast('Cole um link do YouTube no painel de música primeiro.'); return; }
  if (on) ensureYT();
  document.body.classList.toggle('yt-stage', on); scheduleSpeakers();
  $('musicStageBtn').classList.toggle('on', on);
  if (on) toggleMusicPanel(false);
}
$('musicStageBtn').onclick = () => toggleYtStage();
$('musicStageClose').onclick = () => toggleYtStage(false);

window.onbeforeunload = () => { if (peer) peer.destroy(); };
window.addEventListener('pagehide', () => { if (peer) peer.destroy(); }); // celular: libera o ID da sala mais rápido
// PWA: registra o service worker (só em https ou localhost) para o app poder ser instalado. Dentro do app nativo não precisa.
// ================= app de Android: avisa quando sai versão nova =================
// O Android não deixa um app fora da Play Store se instalar sozinho: mostramos um aviso com o link do APK novo.
// (No PC quem cuida disso é o próprio app, ver electron/main.js.)
// Versão do CallZinha: sobe junto com o package.json a cada versão nova (o build dos apps confere e iguala)
const APP_VERSION = '1.21.0';
$('appVersion').textContent = 'v' + APP_VERSION + ' · ' + (window.Capacitor ? 'app Android' : location.protocol === 'app:' ? 'app de PC' : 'site');
(function checkAndroidUpdate() {
  const C = window.Capacitor;
  if (!C || !C.getPlatform || C.getPlatform() !== 'android') return;
  const newer = (a, b) => {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  };
  setTimeout(async () => {
    let latest;
    try {
      const r = await fetch('https://api.github.com/repos/erosxv/JANEMBA/releases/latest', { cache: 'no-store' });
      if (!r.ok) return;
      latest = String((await r.json()).tag_name || '').replace(/^v/, '');
    } catch (e) { return; }
    if (!/^\d+\.\d+\.\d+$/.test(latest) || !newer(latest, APP_VERSION)) return;
    let skip = '';
    try { skip = localStorage.getItem('callzinha.skipUpdate') || ''; } catch (e) {}
    if (skip === latest) return;
    const bar = document.createElement('div');
    bar.id = 'updateBar';
    bar.innerHTML = '<span></span><a>Baixar</a><button title="Agora não" aria-label="Agora não">×</button>';
    bar.querySelector('span').textContent = '🎉 Nova versão ' + latest + ' do CallZinha';
    const a = bar.querySelector('a');
    a.href = 'https://github.com/erosxv/JANEMBA/releases/latest/download/CallZinha.apk';
    a.target = '_blank'; a.rel = 'noopener';
    bar.querySelector('button').onclick = () => { try { localStorage.setItem('callzinha.skipUpdate', latest); } catch (e) {} bar.remove(); };
    document.body.appendChild(bar);
  }, 3000);
})();

if ('serviceWorker' in navigator && !window.Capacitor && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
