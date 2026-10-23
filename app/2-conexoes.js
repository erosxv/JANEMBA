// CallZinha — anfitrião (lista de quem está na sala), medidor de volume, ligações e botões. Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
// ---- HOST: aceita conexões de dados dos convidados, mantém lista, distribui ----
const leaveTimers = {};   // anfitrião: peerId -> espera antes de dar o convidado como "saiu"
const GUEST_SILENCE_MS = 20000;
function listenForGuests() {
  const p = peer;
  // convidado que parou de mandar o batimento: fecha o canal (cai na espera abaixo)
  const iv = setInterval(() => {
    if (peer !== p || p.destroyed) { clearInterval(iv); return; }
    for (const id in hostConns) {
      const c = hostConns[id];
      if (c.open && Date.now() - (c._seen || 0) > GUEST_SILENCE_MS && !mediaAlive(id)) { try { c.close(); } catch (e) {} }
    }
  }, 5000);
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      clearTimeout(leaveTimers[conn.peer]); delete leaveTimers[conn.peer];
      conn._seen = Date.now();
      hostConns[conn.peer] = conn;
      conn.send({ type: 'welcome', name: myName, state: myState(), av: prefs.avatar || '' });
      if (music.queue.length) safeSend(conn, musicPayload());
      if (chatLog.length) safeSend(conn, chatHistoryPayload());
    });
    conn.on('data', (msg) => { conn._seen = Date.now(); if (hostConns[conn.peer] === conn) handleData(conn.peer, msg); });
    conn.on('close', () => {
      if (hostConns[conn.peer] !== conn) return;
      // espera alguns segundos: se foi só uma oscilação, o convidado reabre o canal e ninguém percebe
      clearTimeout(leaveTimers[conn.peer]);
      leaveTimers[conn.peer] = setTimeout(() => {
        delete leaveTimers[conn.peer];
        if (hostConns[conn.peer] !== conn) return;
        delete hostConns[conn.peer];
        announcePresence(conn.peer, false);
        broadcastRoster();
        dropPeer(conn.peer);
      }, 8000);
    });
  });
  peer.on('call', (call) => acceptCall(call));
}

// Ícone do sprite no topo da página (nome fixo, nunca vem de fora)
function icon(name) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
// Troca só o ícone de um botão da barra (a legenda embaixo fica)
function setCtrlIcon(id, name) { $(id).querySelector('.cb-ic').innerHTML = icon(name); }

// Cartão: pílula do nome (nome, situação e mini equalizador) e cor do avatar, sempre a mesma para o mesmo nome
const AV_COLORS = [['#2a3558', '#c7d4ff'], ['#1f4a45', '#b9f3e2'], ['#47305c', '#ecd3ff'], ['#4d3a1f', '#ffe1b0'], ['#4f2a36', '#ffc9d6'], ['#283e55', '#c4e3ff']];
function buildTag(tag) { tag.innerHTML = '<span class="nm"></span><span class="st"></span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>'; }
function setTileName(tile, name, av) {
  tile.querySelector('.tag .nm').textContent = name;
  tile.querySelector('.tag .nm').title = name;
  const avEl = tile.querySelector('.avatar');
  const pic = avatarMarkup(av);
  avEl.classList.toggle('has-pic', !!pic);
  if (pic) avEl.innerHTML = pic; else avEl.textContent = initials(name);
  let hsh = 0;
  for (const c of String(name)) hsh = (hsh * 31 + c.codePointAt(0)) >>> 0;
  const [bg, fg] = AV_COLORS[hsh % AV_COLORS.length];
  tile.style.setProperty('--av-bg', bg); tile.style.setProperty('--av-fg', fg);
}

function safeSend(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) {} }

function broadcastRoster() {
  const roster = Object.keys(hostConns).concat([peer.id]);
  const names = Object.assign({ [peer.id]: myName }, remoteNames);
  const states = Object.assign({}, peerStates, { [peer.id]: myState() });
  const avatars = Object.assign({}, remoteAvatars, { [peer.id]: prefs.avatar || '' });
  for (const id in hostConns) {
    safeSend(hostConns[id], { type: 'roster', peers: roster.filter(p => p !== id), names, states, avatars });
  }
}

// O anfitrião repassa mensagens de um convidado para os outros (a topologia de dados é em estrela)
function relay(exceptId, msg) {
  for (const id in hostConns) if (id !== exceptId) safeSend(hostConns[id], Object.assign({}, msg, { from: exceptId }));
}

function hostId() { return 'callzinha-' + roomId; }
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20); }
function nameOf(pid) { return remoteNames[pid] || 'Participante'; }
function isPeerPresent(pid) { return isHost ? !!hostConns[pid] : (knownPeers.has(pid) || pid === hostId()); }
// Celular/tablet avisa os outros: quem compartilha a tela manda para ele uma versão mais leve (ver applySenderParams)
const IS_PHONE = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
function myState() { return { mic: !!(hasMic && micOn), screen: !!sharingScreen, mob: IS_PHONE }; }

function sendMyState() {
  if (!peer) return;
  const msg = Object.assign({ type: 'state' }, myState());
  if (isHost) { for (const id in hostConns) safeSend(hostConns[id], Object.assign({}, msg, { from: peer.id })); }
  else safeSend(conns[hostId()], msg);
  renderBadges('local');
}
function sendMyName() {
  if (!peer) return;
  const msg = { type: 'name', name: myName, av: prefs.avatar || '' };
  if (isHost) { for (const id in hostConns) safeSend(hostConns[id], Object.assign({}, msg, { from: peer.id })); }
  else safeSend(conns[hostId()], msg);
}

function setPeerState(pid, st) {
  const prev = peerStates[pid] || {};
  peerStates[pid] = { mic: st.mic !== false, screen: !!st.screen, mob: !!st.mob };
  if (peerStates[pid].mob !== !!prev.mob && sharingScreen && calls[pid]) applySenderParams(calls[pid]);
  if (peerStates[pid].screen && !prev.screen) notify('🖥️ ' + nameOf(pid) + ' está compartilhando a tela');
  applyPeerState(pid);
}

function announcePresence(pid, joined) { notify((joined ? '➕ ' : '➖ ') + nameOf(pid) + (joined ? ' entrou' : ' saiu')); playCue(joined); }

// Remove tudo de um participante que saiu da sala
function dropPeer(pid) {
  clearTimeout(redialTimers[pid]); delete redialTimers[pid]; delete redialAttempts[pid];
  killCall(pid);
  removeRemoteTile(pid);
  delete peerStates[pid]; delete remoteNames[pid]; delete statsPrev[pid]; delete peerHealth[pid];
  updateNetBadge();
}

function handleData(fromId, msg) {
  if (!msg || typeof msg !== 'object') return;
  // Só o anfitrião pode dizer "esta mensagem é de outra pessoa" (campo from)
  const viaHost = !isHost && fromId === hostId();
  const from = (viaHost && typeof msg.from === 'string') ? msg.from : fromId;
  if (msg.type === 'ping') {
    if (isHost) safeSend(hostConns[fromId], { type: 'pong' });
    return;
  }
  if (msg.type === 'pong') return;
  if (msg.type === 'hello') {
    const first = !(from in remoteNames);
    remoteNames[from] = cleanName(msg.name) || 'Participante';
    setRemoteAvatar(from, msg.av);
    updateTileName(from);
    if (isHost) { if (first) announcePresence(from, true); broadcastRoster(); }
  } else if (msg.type === 'welcome') {
    remoteNames[from] = cleanName(msg.name) || 'Participante';
    setRemoteAvatar(from, msg.av);
    if (msg.state) setPeerState(from, msg.state);
    updateTileName(from);
  } else if (msg.type === 'roster') {
    if (!viaHost) return;
    const names = msg.names || {}, states = msg.states || {};
    for (const k in names) if (k !== peer.id) remoteNames[k] = cleanName(names[k]) || 'Participante';
    const avs = msg.avatars || {};
    for (const k in avs) if (k !== peer.id) setRemoteAvatar(k, avs[k]);
    for (const k in states) if (k !== peer.id && states[k]) setPeerState(k, states[k]);
    const list = (msg.peers || []).filter(pid => pid !== peer.id);
    const before = knownPeers;
    knownPeers = new Set(list);
    if (rosterReady) {
      list.forEach(pid => { if (!before.has(pid)) announcePresence(pid, true); });
      before.forEach(pid => { if (!knownPeers.has(pid)) { announcePresence(pid, false); dropPeer(pid); } });
    }
    rosterReady = true;
    Object.keys(remoteNames).forEach(updateTileName);
    list.forEach(pid => {
      // Só o lado de ID "menor" liga, pra dois convidados não ligarem um pro outro ao mesmo tempo
      if (!calls[pid] && !redialTimers[pid] && peer.id < pid) callPeer(pid, remoteNames[pid]);
    });
  } else if (msg.type === 'state') {
    setPeerState(from, msg);
    if (isHost) relay(fromId, { type: 'state', mic: !!msg.mic, screen: !!msg.screen, mob: !!msg.mob });
  } else if (msg.type === 'name') {
    remoteNames[from] = cleanName(msg.name) || 'Participante';
    setRemoteAvatar(from, msg.av);
    updateTileName(from);
    if (isHost) relay(fromId, { type: 'name', name: remoteNames[from], av: remoteAvatars[from] || '' });
  } else if (msg.type === 'host-mute') {
    if (viaHost && hasMic && micOn) { toggleMic(); toast('O anfitrião mutou seu microfone'); }
  } else if (msg.type === 'kick') {
    if (viaHost) { try { sessionStorage.setItem('cz-kicked', roomId); } catch (e) {} location.href = location.pathname; }
  } else if (msg.type === 'music') {
    if (viaHost) receiveMusic(msg);
  } else if (msg.type === 'music-cmd') {
    if (isHost) applyMusicCommand(msg, from);
  } else if (msg.type === 'chat') {
    if (isHost || viaHost) receiveChat(from, msg);
  } else if (msg.type === 'chat-history') {
    if (viaHost) receiveChatHistory(msg);
  } else if (msg.type === 'react') {
    if (isHost || viaHost) receiveReaction(from, msg);
  } else if (msg.type === 'fx') {
    if (isHost || viaHost) receiveFx(from, msg);
  }
}

function updateTileName(peerId) {
  const tile = document.getElementById('tile-' + peerId);
  if (tile && remoteNames[peerId]) {
    setTileName(tile, remoteNames[peerId], remoteAvatars[peerId]);
  }
}

// ---- Medidor de volume ----
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    // 48 kHz = taxa nativa do Opus e do filtro de ruído (RNNoise). Latência "balanced": ~10 ms a mais, mas o filtro
    // de IA não falha quando o PC fica ocupado (jogo, compartilhar tela): falha aqui vira voz robótica/picotada
    try { audioCtx = new AC({ sampleRate: 48000, latencyHint: 'balanced' }); }
    catch (e) { audioCtx = new AC(); }
    audioCtx.onstatechange = () => { if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') { try { audioCtx.resume(); } catch (e) {} } };
  }
  return audioCtx;
}

// Medidor + indicador "falando" (único indicador: a borda azul do tile). Usa RMS em dB com "hold",
// então ruído baixo de fundo não acende a borda e a borda não pisca entre as sílabas.
const meters = {}; // tileId -> { analyser, source, stream, isLocal, raf, until }
const SPEAK_OPEN_DB = -46;
function stopMeter(tileId) {
  const m = meters[tileId];
  if (!m) return;
  cancelAnimationFrame(m.raf);
  try { if (m.source) m.source.disconnect(); } catch (e) {}
  try { if (m.isLocal && micGainNode) micGainNode.disconnect(m.analyser); } catch (e) {}
  try { m.analyser.disconnect(); } catch (e) {}
  delete meters[tileId];
}
function attachVolumeMeter(stream, tileId) {
  const isLocal = (tileId === 'tile-local');
  if (isLocal) { if (meters[tileId]) return; }
  else {
    if (!stream || !stream.getAudioTracks().length) return;
    if (meters[tileId] && meters[tileId].stream === stream) return; // 'stream' pode disparar 2x (áudio e vídeo)
  }
  stopMeter(tileId);
  ensureAudioGraph();
  const ctx = getAudioCtx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  let source = null;
  if (isLocal) {
    // Mede o áudio DEPOIS do ganho: mutado (ganho 0) = silêncio = sem borda azul
    micGainNode.connect(analyser);
  } else {
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
  }
  const m = { analyser, source, stream, isLocal, raf: 0, until: 0 };
  meters[tileId] = m;
  const buf = new Float32Array(analyser.fftSize);

  function loop() {
    const tile = document.getElementById(tileId);
    if (!tile) { stopMeter(tileId); return; }
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const db = 10 * Math.log10(s / buf.length + 1e-12);
    const muted = isLocal && !micOn; // mutado: nunca mostra como falando
    const level = muted ? 0 : Math.max(0, Math.min(1, (db + 60) / 45));
    const now = performance.now();
    if (!muted && db > SPEAK_OPEN_DB) m.until = now + 250;
    const fill = tile.querySelector('.volfill');
    if (fill) fill.style.width = (level * 100) + '%';
    tile.style.setProperty('--lvl', level.toFixed(2));
    const sp = !muted && now < m.until;
    if (sp !== m.sp) { m.sp = sp; tile.classList.toggle('speaking', sp); scheduleSpeakers(); }
    m.raf = requestAnimationFrame(loop);
  }
  loop();
}

function stopAllMeters() { Object.keys(meters).forEach(stopMeter); }

// Faixa "falando agora": só quando os cartões estão pequenos ou escondidos (palco/tela cheia); na Roda a borda basta
let speakersRaf = 0, speakersText = '';
function scheduleSpeakers() { if (!speakersRaf) speakersRaf = requestAnimationFrame(renderSpeakers); }
function renderSpeakers() {
  speakersRaf = 0;
  const box = $('speakers');
  if (!box) return;
  const big = document.body.classList.contains('theater-open') || document.body.classList.contains('yt-stage') || !!document.querySelector('#grid .tile.focus');
  const names = big ? [...document.querySelectorAll('#grid .tile.speaking:not(#tile-local)')].map((t) => nameOf(t.id.slice(5))) : [];
  const text = names.length ? (names.length > 3 ? names.slice(0, 3).join(', ') + ' e mais ' + (names.length - 3) : names.join(names.length === 2 ? ' e ' : ', ')) : '';
  if (text) {
    if (text !== speakersText) { box.innerHTML = '<span class="eq"><i></i><i></i><i></i></span><span class="nm"></span>'; box.querySelector('.nm').textContent = text; }
    // logo abaixo do topo da área dos cartões (a barra de cima e o aviso do mic mudam de altura)
    box.style.top = theater ? '' : Math.max(56, Math.round($('grid').getBoundingClientRect().top + 10)) + 'px';
    box.classList.add('show');
  } else box.classList.remove('show');
  if (text) speakersText = text;
}

// A faixa de áudio que sai para a chamada é SEMPRE a mesma (MediaStreamDestination): trocar de microfone,
// ligar o mic depois de entrar mudo, ou mutar não exige refazer nenhuma chamada.
// O vídeo sai por um "slot" fixo: um quadro preto minúsculo enquanto não há tela; ao compartilhar usamos replaceTrack().
let placeholderVideo = null;
function getPlaceholderVideoTrack() {
  if (!placeholderVideo) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    const paint = () => { g.fillStyle = '#000'; g.fillRect(0, 0, 16, 16); };
    paint();
    placeholderVideo = c.captureStream(1).getVideoTracks()[0];
    placeholderVideo.contentHint = 'detail';
    setInterval(paint, 1000);
  }
  return placeholderVideo;
}

// O navegador sincroniza áudio e vídeo do MESMO stream (lip-sync): se a tela compartilhada atrasa ou engasga,
// ele segura a voz para acompanhar, o que gera atraso de segundos e depois a voz "acelerada"/robótica para recuperar.
// Aqui a voz não precisa de sincronia com a tela: renomeamos o stream do vídeo recebido e cada um segue sozinho.
(function unsyncRemoteVideo() {
  const PC = window.RTCPeerConnection;
  if (!PC || !PC.prototype.setRemoteDescription || PC.prototype._czUnsync) return;
  const orig = PC.prototype.setRemoteDescription;
  const ren = (a, k, id, sp) => (id === '-' || /-v$/.test(id)) ? a : k + id + '-v' + sp;
  const fix = (sdp) => sdp.split(/(?=\r?\nm=)/).map((sec) => {
    if (!/^\r?\n?m=video/.test(sec)) return sec;
    return sec.replace(/(a=msid:)(\S+)( )/g, ren).replace(/(a=ssrc:\d+ msid:)(\S+)( )/g, ren);
  }).join('');
  PC.prototype.setRemoteDescription = function (desc, ...rest) {
    try { if (desc && typeof desc.sdp === 'string') desc = { type: desc.type, sdp: fix(desc.sdp) }; } catch (e) {}
    return orig.call(this, desc, ...rest);
  };
  PC.prototype._czUnsync = true;
})();

function outgoingStream() {
  ensureAudioGraph();
  const tracks = [...micOutputStream.getAudioTracks()];
  const screenTrack = (sharingScreen && screenStream) ? screenStream.getVideoTracks()[0] : null;
  tracks.push(screenTrack || getPlaceholderVideoTrack());
  return new MediaStream(tracks);
}

// Opus otimizado para voz: mono, FEC (recupera pacotes perdidos), sem DTX (não corta início de frase) e ~64 kbps
function tuneOpusSdp(sdp) {
  try {
    const m = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp);
    if (!m) return sdp;
    const pt = m[1];
    const want = { minptime: '10', useinbandfec: '1', usedtx: '0', stereo: '0', 'sprop-stereo': '0', maxaveragebitrate: String(AUDIO_BITRATE) };
    const fmtp = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
    if (fmtp.test(sdp)) {
      return sdp.replace(fmtp, (all, params) => {
        const map = new Map();
        params.split(';').forEach((kv) => { const i = kv.indexOf('='); const k = (i < 0 ? kv : kv.slice(0, i)).trim(); if (k) map.set(k, i < 0 ? null : kv.slice(i + 1).trim()); });
        Object.keys(want).forEach((k) => map.set(k, want[k]));
        return 'a=fmtp:' + pt + ' ' + [...map].map(([k, v]) => v === null ? k : k + '=' + v).join(';');
      });
    }
    const line = 'a=fmtp:' + pt + ' ' + Object.keys(want).map((k) => k + '=' + want[k]).join(';');
    return sdp.replace(new RegExp('(a=rtpmap:' + pt + ' opus/48000/2\\r?\\n)', 'i'), '$1' + line + '\r\n');
  } catch (e) { return sdp; }
}

function callPeer(peerId, name) {
  if (calls[peerId] || peerId === peer.id) return;
  const call = peer.call(peerId, outgoingStream(), { metadata: { name: myName, sharing: sharingScreen }, sdpTransform: tuneOpusSdp });
  calls[peerId] = call;
  wireCall(call, name);
}

function acceptCall(call) {
  const old = calls[call.peer];
  if (old && old !== call) { old._replaced = true; clearTimeout(old._discTimer); clearTimeout(old._connectTimer); try { old.close(); } catch (e) {} }
  call.answer(outgoingStream(), { sdpTransform: tuneOpusSdp });
  calls[call.peer] = call;
  const theirName = (call.metadata && call.metadata.name) || remoteNames[call.peer];
  wireCall(call, theirName);
}

// Fecha a chamada com um participante sem disparar religação (usado quando ele saiu de verdade)
function killCall(pid) {
  const c = calls[pid];
  if (!c) return;
  c._replaced = true;
  clearTimeout(c._discTimer); clearTimeout(c._connectTimer);
  delete calls[pid];
  try { c.close(); } catch (e) {}
  if (sharingScreen) applySenderParamsAll();
}

function iAmCaller(pid) {
  if (isHost) return false;                 // o anfitrião normalmente só atende
  if (pid === hostId()) return true;        // convidado sempre liga pro anfitrião
  return peer.id < pid;                     // entre convidados, só o de ID menor liga
}

function setReconnecting(pid, on) {
  const tile = document.getElementById('tile-' + pid);
  if (tile) tile.classList.toggle('reconnecting', !!on);
  renderBadges(pid);
}

// Ligação caiu: tenta religar SÓ esse participante (o resto da sala continua falando normalmente)
function scheduleRedial(pid) {
  if (redialTimers[pid]) return;
  const n = (redialAttempts[pid] = (redialAttempts[pid] || 0) + 1);
  // quem é o "chamador" religa logo; o outro lado espera e só tenta por conta própria se o chamador não aparecer.
  // Depois de 6 tentativas não desiste: segue tentando a cada ~30 s enquanto a pessoa estiver na sala.
  if (n === 7) { setReconnecting(pid, true); notify('⚠️ Não consegui religar com ' + nameOf(pid) + ', sigo tentando'); }
  const delay = n > 6 ? 25000 + Math.random() * 10000
    : iAmCaller(pid) ? Math.min(1000 * n, 6000) + Math.random() * 600 : 9000 + Math.random() * 2000;
  redialTimers[pid] = setTimeout(() => {
    delete redialTimers[pid];
    if (!peer || peer.destroyed || calls[pid] || !isPeerPresent(pid)) return;
    callPeer(pid, remoteNames[pid]);
  }, delay);
}

function onCallClosed(call) {
  clearTimeout(call._discTimer); clearTimeout(call._connectTimer);
  const pid = call.peer;
  if (call._replaced || calls[pid] !== call) return; // já foi trocada por uma chamada nova (ou fechada de propósito)
  delete calls[pid];
  if (peer && !peer.destroyed && isPeerPresent(pid)) { setReconnecting(pid, true); scheduleRedial(pid); }
  else removeRemoteTile(pid);
}

function onIceState(call, st) {
  if (calls[call.peer] !== call) return;
  const pid = call.peer;
  logEvent('ligação com ' + nameOf(pid) + ': ' + st);
  if (st === 'connected' || st === 'completed') {
    clearTimeout(call._discTimer); clearTimeout(call._connectTimer);
    redialAttempts[pid] = 0;
    setReconnecting(pid, false);
    applySenderParamsAll(); // mais alguém assistindo: a fatia de upload de cada um muda
  } else if (st === 'disconnected') {
    setReconnecting(pid, true);
    clearTimeout(call._discTimer);
    // se não voltar sozinha em 8 s, refaz a ligação (o ICE do PeerJS não renegocia)
    call._discTimer = setTimeout(() => {
      const pc = call.peerConnection;
      if (calls[pid] === call && pc && pc.iceConnectionState === 'disconnected') { try { call.close(); } catch (e) {} }
    }, 8000);
  }
}

function wireCall(call, name) {
  // ligação que nunca chega a conectar (par sumiu): fecha para cair na rotina de religação
  call._connectTimer = setTimeout(() => { if (calls[call.peer] === call && !call._gotStream) { try { call.close(); } catch (e) {} } }, 20000);
  call.on('stream', (part) => {
    if (calls[call.peer] !== call) return; // chamada antiga/duplicada
    // áudio e vídeo chegam em streams separados (ver unsyncRemoteVideo): junta tudo num só para o tile
    const have = call._tracks || (call._tracks = []);
    part.getTracks().forEach((t) => { if (!have.some((x) => x.id === t.id)) have.push(t); });
    if (call._remote && call._remote.getTracks().length === have.length) return;
    const remoteStream = call._remote = new MediaStream(have);
    call._gotStream = true;
    clearTimeout(call._connectTimer);
    const video = addRemoteTile(call.peer, name || remoteNames[call.peer]);
    if (video.srcObject !== remoteStream) video.srcObject = remoteStream;
    applyPeerState(call.peer);
    tryPlay(video);
    attachVolumeMeter(remoteStream, 'tile-' + call.peer);
  });
  call.on('iceStateChanged', (st) => onIceState(call, st));
  call.on('error', () => {});
  call.on('close', () => onCallClosed(call));
}

// Mostra (ou esconde) a tela do participante conforme o estado que ELE informou; também atualiza os selos do tile
function applyPeerState(pid) {
  const tile = document.getElementById('tile-' + pid);
  if (!tile) return;
  const st = peerStates[pid] || {};
  const video = tile.querySelector('video');
  const src = video.srcObject;
  const hasVideo = !!st.screen && !!(src && src.getVideoTracks().length);
  video.classList.toggle('has-video', hasVideo);
  tile.classList.toggle('has-screen', hasVideo);
  const sb = tile.querySelector('.screen-badge');
  if (sb) sb.style.display = hasVideo ? 'block' : 'none';
  renderBadges(pid);
  applyLayout();
}

// Selos de estado: microfone desligado, reconectando, conexão instável
function renderBadges(pid) {
  const tile = document.getElementById(pid === 'local' ? 'tile-local' : 'tile-' + pid);
  if (!tile) return;
  const box = tile.querySelector('.state-badges');
  if (!box) return;
  box.textContent = '';
  const add = (cls, ic, text) => { const d = document.createElement('div'); d.className = 'sbadge ' + cls; d.innerHTML = icon(ic); d.append(text); box.appendChild(d); };
  const st = pid === 'local' ? myState() : (peerStates[pid] || { mic: true });
  const muted = !st.mic;
  tile.classList.toggle('is-muted', muted);
  const mic = tile.querySelector('.micst');
  if (mic) { mic.innerHTML = icon(muted ? 'mic-off' : 'mic'); mic.title = pid === 'local' && !hasMic ? 'Você entrou sem microfone' : muted ? 'Microfone desligado' : 'Microfone ligado'; }
  const stx = tile.querySelector('.tag .st');
  if (stx) stx.textContent = pid === 'local' ? '(você)' : (muted ? 'no mudo' : '');
  if (pid !== 'local') {
    if (tile.classList.contains('reconnecting')) add('warn', 'refresh', 'reconectando…');
    else if (peerHealth[pid] && peerHealth[pid].level === 'bad') add('bad', 'alert', 'conexão ruim');
    else if (peerHealth[pid] && peerHealth[pid].level === 'warn') add('warn', 'alert', 'instável');
  }
}

// ---- Controles ----
let micOn = true, sharingScreen = false;

// Ganho do mic (0–200%) com rampa curtíssima: sem "estalo" ao mutar/desmutar
function applyMicGain() {
  if (!micGainNode) return;
  const ctx = getAudioCtx();
  const v = micOn ? micVolumePercent / 100 : 0;
  try {
    micGainNode.gain.cancelScheduledValues(ctx.currentTime);
    micGainNode.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  } catch (e) { micGainNode.gain.value = v; }
}
function setMicVolume(v, from) {
  micVolumePercent = Math.max(0, Math.min(200, Math.round(v)));
  prefs.gain = micVolumePercent; savePrefs();
  applyMicGain();
  const a = $('myMicVolSlider'); if (a && from !== 'tile') a.value = micVolumePercent;
  const b = $('setGain'); if (b && from !== 'panel') b.value = micVolumePercent;
  if ($('setGainVal')) $('setGainVal').textContent = micVolumePercent + '%';
}

function toggleMic() {
  if (!hasMic) { enableMic(); return; }
  micOn = !micOn;
  applyMicGain(); syncDfnBypass();
  $('micBtn').classList.toggle('active', micOn);
  $('micBtn').classList.toggle('off', !micOn);
  setCtrlIcon('micBtn', micOn ? 'mic' : 'mic-off');
  sendMyState();
  updateMicAlert();
}
$('micBtn').onclick = toggleMic;
