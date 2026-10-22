// CallZinha — música compartilhada (YouTube). Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
// ================= música compartilhada (YouTube, sem chave de API) =================
// Cada pessoa toca o vídeo no próprio navegador pelo player oficial do YouTube; a chamada só
// sincroniza a fila e o relógio. O anfitrião é a referência: aplica os comandos e repassa o estado.
// Todos guardam o estado, então se o anfitrião sair, o novo anfitrião continua de onde parou.
const MUSIC_MAX_QUEUE = 100;
const MUSIC_DRIFT = 1.5;          // segundos de diferença tolerados antes de reposicionar
let music = { queue: [], cur: -1, playing: false, pos: 0, at: Date.now() };
let ytPlayer = null, ytReady = false, ytLoading = null, ytLoadedId = '';
let musicDuration = 0, musicStuck = 0, musicSeeking = false;

function musicNow() { return music.playing ? music.pos + (Date.now() - music.at) / 1000 : music.pos; }
function musicTrack() { return music.queue[music.cur] || null; }
function cleanTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120); }
function fmtTime(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function parseYouTubeId(text) {
  const s = String(text || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u; try { u = new URL(s); } catch (e) { return ''; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/) || [])[2] || '';
  }
  id = id.split(/[/?#&]/)[0];
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

// Título pelo oEmbed público do YouTube (sem chave). 401/403 = o dono não permite tocar fora do YouTube.
async function fetchVideoInfo(id) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    if (r.status === 401 || r.status === 403) return { blocked: true };
    if (r.ok) { const d = await r.json(); return { title: cleanTitle(d.title) }; }
  } catch (e) {}
  return { title: '' };
}

// ---- jukebox: achar a música pelo nome ----
// 1º a busca oficial do YouTube (chave travada para o site do CallZinha; ~100 buscas por dia de graça).
// Se a chave faltar, der erro ou a cota do dia acabar, tenta espelhos públicos do YouTube (Piped/Invidious), que às vezes ficam fora do ar.
const YT_KEY = '';
// Se TODOS falharem com frequência, o plano B é um servidor de busca próprio no Cloudflare Workers (grátis, sem cartão).
const MIRRORS = [
  { kind: 'piped', base: 'https://api.piped.private.coffee' },
  { kind: 'piped', base: 'https://pipedapi.ducks.party' },
  { kind: 'inv', base: 'https://invidious.f5.si' },
  { kind: 'inv', base: 'https://invidious.materialio.us' },
  { kind: 'inv', base: 'https://iv.melmac.space' },
];
const MIRROR_KEY = 'callzinha.mirror';
function decodeEntities(t) { const d = document.createElement('textarea'); d.innerHTML = String(t || ''); return d.value; }
async function fetchJson(url, ms) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 4000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(timer); }
}
async function searchOfficial(q, n) {
  const d = await fetchJson('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=' + n + '&q=' + encodeURIComponent(q) + '&key=' + YT_KEY);
  return (d.items || []).map((it) => ({ id: it.id && it.id.videoId, title: cleanTitle(decodeEntities(it.snippet && it.snippet.title)), by: cleanTitle(decodeEntities(it.snippet && it.snippet.channelTitle)), ok: true }));
}
async function searchMirror(m, q, n) {
  if (m.kind === 'piped') {
    const d = await fetchJson(m.base + '/search?filter=music_songs&q=' + encodeURIComponent(q));
    return (d.items || []).filter((it) => it.type === 'stream').slice(0, n).map((it) => ({ id: parseYouTubeId('https://www.youtube.com' + it.url), title: cleanTitle(it.title), by: cleanTitle(it.uploaderName) }));
  }
  const d = await fetchJson(m.base + '/api/v1/search?type=video&q=' + encodeURIComponent(q));
  return (Array.isArray(d) ? d : []).filter((it) => it.type === 'video').slice(0, n).map((it) => ({ id: it.videoId, title: cleanTitle(it.title), by: cleanTitle(it.author) }));
}
async function searchMusic(q, n) {
  n = n || 5;
  if (YT_KEY) { try { const r = (await searchOfficial(q, n)).filter((x) => x.id); if (r.length) return r; } catch (e) {} }
  // começa pelo espelho que respondeu da última vez
  let last = ''; try { last = localStorage.getItem(MIRROR_KEY) || ''; } catch (e) {}
  const order = MIRRORS.slice().sort((a, b) => (b.base === last) - (a.base === last));
  for (const m of order) {
    try {
      const r = (await searchMirror(m, q, n)).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x.id || ''));
      if (r.length) { try { localStorage.setItem(MIRROR_KEY, m.base); } catch (e) {} return r; }
    } catch (e) {}
  }
  return null;   // null = nenhuma busca respondeu; [] = buscou e não achou
}
// Coloca na fila o 1º resultado que pode tocar fora do YouTube
async function queueSearch(q) {
  const id = parseYouTubeId(q);
  ensureYT();
  if (id) {
    const info = await fetchVideoInfo(id);
    if (info.blocked) { toast('Esse vídeo não permite tocar fora do YouTube. Tente outro upload da mesma música.'); return false; }
    musicCommand({ cmd: 'add', id, title: info.title });
    toast('🎵 Adicionada: ' + (info.title || id));
    return true;
  }
  toast('🔎 Procurando "' + q + '"…');
  const res = await searchMusic(q, 5);
  if (res === null) { toast('A busca de músicas está fora do ar agora. Cole o link do YouTube.'); return false; }
  for (const r of res) {
    const info = r.ok ? { title: r.title } : await fetchVideoInfo(r.id);
    if (info.blocked) continue;
    musicCommand({ cmd: 'add', id: r.id, title: r.title || info.title });
    toast('🎵 Adicionada: ' + (r.title || r.id));
    return true;
  }
  toast('Não achei "' + q + '". Tente com o nome do artista também.');
  return false;
}
async function addResult(r) {
  ensureYT();
  const info = r.ok ? { title: r.title } : await fetchVideoInfo(r.id);
  if (info.blocked) { toast('Essa não pode tocar fora do YouTube. Escolha outra da lista.'); return; }
  musicCommand({ cmd: 'add', id: r.id, title: r.title || info.title });
  toast('🎵 Adicionada: ' + (r.title || r.id));
  $('musicResults').hidden = true;
}

// ---- comandos: convidado pede ao anfitrião; o anfitrião aplica e manda o estado novo para todos ----
function musicCommand(cmd) {
  if (!peer) return;
  if (isHost) applyMusicCommand(cmd, peer.id);
  else safeSend(conns[hostId()], Object.assign({ type: 'music-cmd' }, cmd));
}

function applyMusicCommand(cmd, by) {
  const q = music.queue;
  const now = musicNow();
  music.pos = now; music.at = Date.now();
  const go = (i) => { music.cur = Math.max(0, Math.min(q.length, i)); music.pos = 0; music.playing = music.cur < q.length; };
  const who = by === peer.id ? myName : nameOf(by);
  switch (cmd.cmd) {
    case 'add': {
      const id = parseYouTubeId(cmd.id);
      if (!id || q.length >= MUSIC_MAX_QUEUE) return;
      const idle = music.cur < 0 || music.cur >= q.length;
      const title = cleanTitle(cmd.title) || id;
      q.push({ id, title, by: who });
      if (idle) go(q.length - 1);
      if (by !== peer.id) notify('🎵 ' + who + ' adicionou ' + title);
      break;
    }
    case 'play': if (musicTrack()) music.playing = true; break;
    case 'pause': music.playing = false; break;
    case 'seek': if (musicTrack()) music.pos = Math.max(0, Number(cmd.pos) || 0); break;
    case 'next': go(music.cur + 1); break;
    case 'prev': if (now > 5) music.pos = 0; else go(music.cur - 1); break;
    case 'jump': if (Number.isInteger(cmd.index) && cmd.index >= 0 && cmd.index < q.length) go(cmd.index); break;
    case 'remove': {
      const i = cmd.index;
      if (!Number.isInteger(i) || i < 0 || i >= q.length) return;
      q.splice(i, 1);
      if (i < music.cur) music.cur--;
      else if (i === music.cur) { const was = music.playing; go(music.cur); music.playing = music.playing && was; }
      break;
    }
    default: return;
  }
  broadcastMusic();
  renderMusic();
  if (q.length) ensureYT().then(syncPlayer); else syncPlayer();   // fila vazia: para o que estiver tocando
}

function musicPayload() {
  return { type: 'music', queue: music.queue, cur: music.cur, playing: music.playing, pos: musicNow() };
}
function broadcastMusic() {
  if (!isHost) return;
  const m = musicPayload();
  for (const id in hostConns) safeSend(hostConns[id], m);
}

function receiveMusic(msg) {
  const before = new Set(music.queue.map(t => t.id + '|' + t.by));
  const q = (Array.isArray(msg.queue) ? msg.queue : []).slice(0, MUSIC_MAX_QUEUE).map(t => ({
    id: parseYouTubeId(t && t.id), title: cleanTitle(t && t.title), by: cleanName(t && t.by)
  }));
  if (q.some(t => !t.id)) return;
  const cur = Number.isInteger(msg.cur) ? Math.max(-1, Math.min(q.length, msg.cur)) : -1;
  music = { queue: q, cur, playing: !!msg.playing && cur >= 0 && cur < q.length, pos: Math.max(0, Number(msg.pos) || 0), at: Date.now() };
  if (before.size) q.forEach(t => { if (!before.has(t.id + '|' + t.by) && t.by !== myName) notify('🎵 ' + t.by + ' adicionou ' + (t.title || t.id)); });
  renderMusic();
  if (q.length) ensureYT().then(syncPlayer); else syncPlayer();   // fila vazia: para o que estiver tocando
}

// ---- player do YouTube (carregado só quando alguém usa a música) ----
// O player é uma página inteira escondida (~50-100 MB): só existe enquanto há música na fila.
let ytApi = null, ytIdleTimer = null;
function loadYTApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; ytLoading = null; toast('Não consegui carregar o player do YouTube.'); };
    document.head.appendChild(s);
  });
  return ytApi;
}
function ensureYT() {
  clearTimeout(ytIdleTimer); ytIdleTimer = null;
  if (ytReady) return Promise.resolve();
  if (ytLoading) return ytLoading;
  ytLoading = loadYTApi().then(() => new Promise((resolve) => {
    let el = $('musicPlayer');
    if (!el) { el = document.createElement('div'); el.id = 'musicPlayer'; $('musicVideo').insertBefore(el, $('musicStageClose')); }
    ytPlayer = new YT.Player(el, {
      width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, origin: location.origin },
      events: {
        onReady: () => { ytReady = true; applyMusicVolume(); resolve(); syncPlayer(); },
        onStateChange: onYTState,
        onError: onYTError
      }
    });
  }));
  return ytLoading;
}
// Fila acabou (ou foi limpa) e ninguém pôs outra música em 1 minuto: desmonta o player e devolve a memória
function scheduleYTIdle() {
  const idle = ytPlayer && !musicTrack() && !document.body.classList.contains('yt-stage');
  if (!idle) { clearTimeout(ytIdleTimer); ytIdleTimer = null; return; }
  if (ytIdleTimer) return;
  ytIdleTimer = setTimeout(() => {
    ytIdleTimer = null;
    if (!ytPlayer || !ytReady || musicTrack() || document.body.classList.contains('yt-stage')) return;
    try { ytPlayer.destroy(); } catch (e) {}
    ytPlayer = null; ytReady = false; ytLoading = null; ytLoadedId = ''; musicDuration = 0;
  }, 60000);
}

let musicDucked = false;   // um jogo (ex.: Adivinhe a música) pediu silêncio na música da sala
function applyMusicVolume() { if (ytReady) ytPlayer.setVolume(musicDucked ? 0 : Math.max(0, Math.min(100, Number(prefs.musicVol) || 0))); }

function onYTState(e) {
  if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.CUED) musicDuration = ytPlayer.getDuration() || musicDuration;
  if (e.data === YT.PlayerState.PLAYING) { musicStuck = 0; $('musicUnlock').style.display = 'none'; }
  if (e.data === YT.PlayerState.ENDED) hostCheckEnd(true);
  renderMusicTime();
}

function onYTError(e) {
  const t = musicTrack();
  const name = t ? (t.title || t.id) : 'o vídeo';
  if (isHost) { toast('Não dá para tocar "' + name + '" aqui, pulando.'); applyMusicCommand({ cmd: 'next' }, peer.id); }
  else toast('Não consegui tocar "' + name + '" no seu navegador.');
}

// Só o anfitrião avança a fila quando a música acaba (pelo player ou pelo relógio, se o player dele estiver travado)
function hostCheckEnd(fromPlayer) {
  if (!isHost || !music.playing || !musicTrack() || ytLoadedId !== musicTrack().id) return;
  if (musicDuration <= 0 && ytReady) musicDuration = ytPlayer.getDuration() || 0;
  if (musicDuration <= 0) return;
  const now = musicNow();
  if ((fromPlayer && now > musicDuration - 3) || now > musicDuration + 2) applyMusicCommand({ cmd: 'next' }, peer.id);
}

// Deixa o player local igual ao estado da sala
function syncPlayer() {
  if (!ytReady) return;
  const t = musicTrack();
  if (!t) {
    if (ytLoadedId) { ytPlayer.stopVideo(); ytLoadedId = ''; musicDuration = 0; }
    return;
  }
  const want = musicNow();
  if (ytLoadedId !== t.id) {
    ytLoadedId = t.id; musicDuration = 0;
    if (music.playing) ytPlayer.loadVideoById(t.id, want); else ytPlayer.cueVideoById(t.id, want);
    return;
  }
  const st = ytPlayer.getPlayerState();
  const S = YT.PlayerState;
  if (music.playing) {
    if (st === S.PLAYING) {
      if (Math.abs(ytPlayer.getCurrentTime() - want) > MUSIC_DRIFT) ytPlayer.seekTo(want, true);
    } else if (st !== S.BUFFERING && !(st === S.ENDED && want >= musicDuration - 1)) {
      ytPlayer.seekTo(want, true); ytPlayer.playVideo();
      // o navegador pode bloquear som automático: depois de alguns segundos, pede um clique
      if (++musicStuck >= 3) $('musicUnlock').style.display = '';
    }
  } else {
    musicStuck = 0;
    if (st === S.PLAYING || st === S.BUFFERING) ytPlayer.pauseVideo();
    else if (st === S.PAUSED && Math.abs(ytPlayer.getCurrentTime() - want) > MUSIC_DRIFT) ytPlayer.seekTo(want, true);
  }
}

// ---- interface ----
function renderMusic() {
  const t = musicTrack();
  $('musicEmpty').style.display = t ? 'none' : '';
  $('musicTitle').textContent = t ? (t.title || t.id) : (music.queue.length ? 'Fim da fila' : 'Nada tocando');
  scheduleYTIdle();
  $('musicBy').textContent = t ? 'Adicionada por ' + t.by : '';
  $('musicPlay').innerHTML = icon(music.playing ? 'pause' : 'play');
  $('musicBtn').classList.toggle('active', !$('musicPanel').classList.contains('closed') || music.playing);
  $('nowPlaying').classList.toggle('show', !!t && music.playing && $('musicPanel').classList.contains('closed'));
  $('nowPlayingText').textContent = t ? (t.title || t.id) : '';
  if (!music.playing) $('musicUnlock').style.display = 'none';
  const ol = $('musicQueue');
  ol.textContent = '';
  music.queue.forEach((item, i) => {
    const li = document.createElement('li');
    if (i === music.cur) li.className = 'cur'; else if (i < music.cur) li.className = 'done';
    const title = document.createElement('span'); title.className = 'qt'; title.textContent = item.title || item.id; title.title = item.title || item.id;
    const by = document.createElement('span'); by.className = 'qb'; by.textContent = item.by;
    const play = document.createElement('button'); play.innerHTML = icon('play'); play.title = 'Tocar esta'; play.onclick = () => musicCommand({ cmd: 'jump', index: i });
    const del = document.createElement('button'); del.innerHTML = icon('x'); del.title = 'Tirar da fila'; del.onclick = () => musicCommand({ cmd: 'remove', index: i });
    li.append(title, by, play, del);
    ol.appendChild(li);
  });
  renderMusicTime();
}

function renderMusicTime() {
  const t = musicTrack();
  const dur = t && ytLoadedId === t.id ? musicDuration : 0;
  const now = t ? Math.min(musicNow(), dur || Infinity) : 0;
  $('musicTime').textContent = fmtTime(now) + ' / ' + fmtTime(dur);
  if (!musicSeeking) { $('musicSeek').max = String(Math.floor(dur)); $('musicSeek').value = String(Math.floor(now)); }
}

function toggleMusicPanel(force) {
  if (force !== false && window.czPipDoc && musicPip) { try { musicPip.focus(); } catch (e) {} }
  const open = typeof force === 'boolean' ? force : $('musicPanel').classList.contains('closed');
  $('musicPanel').classList.toggle('closed', !open);
  if (open) { if (musicTrack()) ensureYT(); toggleChat(false); }
  renderMusic();
}

// ---- painel de música flutuante: arrastar pela tela e, no Chrome/Edge, soltar fora da página vira uma janela por cima de tudo ----
const MUSIC_POS_KEY = 'callzinha.musicPos';
function placeMusicPanel(x, y) {
  const p = $('musicPanel'), r = p.getBoundingClientRect();
  x = Math.max(4, Math.min(window.innerWidth - r.width - 4, x));
  y = Math.max(4, Math.min(window.innerHeight - Math.min(r.height, 120) - 4, y));
  p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto';
}
function restoreMusicPos() {
  const p = $('musicPanel');
  if (window.innerWidth < 700) { p.style.left = p.style.top = p.style.right = p.style.bottom = ''; return; }
  try { const v = JSON.parse(localStorage.getItem(MUSIC_POS_KEY) || 'null'); if (v) placeMusicPanel(v.x, v.y); } catch (e) {}
}
(function setupMusicDrag() {
  const head = $('musicHead'), panel = $('musicPanel');
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (window.innerWidth < 700 || e.button !== 0 || e.target.closest('button') || panel.classList.contains('pip')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    panel.classList.add('dragging');
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    placeMusicPanel(e.clientX - drag.dx, e.clientY - drag.dy);
    const out = musicPopSupported() && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth - 1 || e.clientY >= window.innerHeight - 1);
    panel.classList.toggle('out-left', out);
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    const out = panel.classList.contains('out-left');
    panel.classList.remove('dragging', 'out-left');
    const r = panel.getBoundingClientRect();
    try { localStorage.setItem(MUSIC_POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (er) {}
    if (out && e.type === 'pointerup') popOutMusic();
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  head.addEventListener('dblclick', (e) => {   // duplo clique: volta para o canto de sempre
    if (e.target.closest('button')) return;
    try { localStorage.removeItem(MUSIC_POS_KEY); } catch (er) {}
    panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = '';
  });
  window.addEventListener('resize', () => { if (panel.style.left) { const r = panel.getBoundingClientRect(); placeMusicPanel(r.left, r.top); } else restoreMusicPos(); });
  restoreMusicPos();
})();

// Janela flutuante (Document Picture-in-Picture): os controles, a busca e a fila vão para ela; o vídeo fica na página
// (mover o player do YouTube faria ele recarregar). Fechar a janela traz tudo de volta.
let musicPip = null;
function musicPopSupported() { return 'documentPictureInPicture' in window; }
async function popOutMusic() {
  if (!musicPopSupported() || musicPip) return;
  let w;
  try { w = await window.documentPictureInPicture.requestWindow({ width: 380, height: 560 }); }
  catch (e) { toast('O navegador não abriu a janela flutuante.'); return; }
  musicPip = w;
  const d = w.document;
  d.title = 'Música · CallZinha';
  // estilos da página (o arquivo app/estilo.css e os <style> criados pelos jogos) vão junto para a janela flutuante
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((st) => { const c = st.cloneNode(true); if (c.href) c.href = st.href; d.head.appendChild(c); });
  const fix = d.createElement('style');
  fix.textContent = 'html,body{margin:0;background:#14161c;color:#eaeaea;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-y:auto}';
  d.head.appendChild(fix);
  const sprite = document.querySelector('body > svg[aria-hidden="true"]');
  if (sprite) d.body.appendChild(sprite.cloneNode(true));
  const wrap = d.createElement('div'); wrap.id = 'musicPanel'; wrap.className = 'pip';
  d.body.appendChild(wrap);
  wrap.append($('musicBody'));
  window.czPipDoc = d;
  $('musicPopNote').hidden = false;
  $('musicPopBtn').classList.add('active');
  toggleMusicPanel(false);
  renderMusic();
  w.addEventListener('pagehide', bringBackMusic);
}
function bringBackMusic() {
  if (!musicPip) return;
  const body = window.czPipDoc && window.czPipDoc.getElementById('musicBody');
  window.czPipDoc = null;
  if (body) $('musicPanel').appendChild(document.adoptNode(body));
  const w = musicPip; musicPip = null;
  try { w.close(); } catch (e) {}
  $('musicPopNote').hidden = true;
  $('musicPopBtn').classList.remove('active');
  renderMusic();
}
if (musicPopSupported()) $('musicPopBtn').hidden = false;
$('musicPopBtn').onclick = () => (musicPip ? bringBackMusic() : popOutMusic());
$('musicPopBack').onclick = () => { bringBackMusic(); toggleMusicPanel(true); };

$('musicBtn').onclick = () => toggleMusicPanel();
$('nowPlaying').onclick = () => toggleMusicPanel(true);
$('musicClose').onclick = () => toggleMusicPanel(false);
$('musicPlay').onclick = () => musicCommand({ cmd: music.playing ? 'pause' : 'play' });
$('musicNext').onclick = () => musicCommand({ cmd: 'next' });
$('musicPrev').onclick = () => musicCommand({ cmd: 'prev' });
$('musicUnlock').onclick = () => { if (ytReady) { ytPlayer.seekTo(musicNow(), true); ytPlayer.playVideo(); } };
$('musicSeek').oninput = () => { musicSeeking = true; $('musicTime').textContent = fmtTime($('musicSeek').value) + ' / ' + fmtTime(musicDuration); };
$('musicSeek').onchange = () => { musicSeeking = false; musicCommand({ cmd: 'seek', pos: Number($('musicSeek').value) }); };
$('musicVol').value = String(prefs.musicVol);
$('musicVol').oninput = (e) => { prefs.musicVol = Number(e.target.value); savePrefs(); applyMusicVolume(); };
$('musicAddForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = cleanTitle($('musicUrl').value);
  if (!q) return;
  const list = $('musicResults');
  if (parseYouTubeId(q)) { $('musicUrl').value = ''; list.hidden = true; queueSearch(q); return; }
  const msg = (t) => { const li = document.createElement('li'); li.className = 'mr-msg'; li.textContent = t; list.replaceChildren(li); list.hidden = false; };
  msg('Procurando…');
  const res = await searchMusic(q, 5);
  if (res === null) { msg('A busca está fora do ar agora. Cole o link do YouTube.'); return; }
  if (!res.length) { msg('Nada encontrado. Tente com o nome do artista também.'); return; }
  list.replaceChildren(...res.map((r) => {
    const li = document.createElement('li'), b = document.createElement('button'), t = document.createElement('span'), by = document.createElement('small');
    b.type = 'button'; t.textContent = r.title || r.id; by.textContent = r.by || '';
    b.append(t, by); b.title = 'Tocar para a sala';
    b.onclick = () => { $('musicUrl').value = ''; addResult(r); };
    li.appendChild(b); return li;
  }));
  list.hidden = false;
};
$('musicUrl').addEventListener('input', () => { if (!$('musicUrl').value) $('musicResults').hidden = true; });

setInterval(() => {
  if (!music.queue.length) { if (ytLoadedId) syncPlayer(); return; }   // rede de segurança: nada na fila = nada tocando
  syncPlayer();
  hostCheckEnd(false);
  renderMusicTime();
}, 1000);
// o anfitrião reenvia o relógio de tempos em tempos para corrigir quem atrasou
setInterval(() => { if (isHost && music.playing) broadcastMusic(); }, 5000);
