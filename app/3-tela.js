// CallZinha — compartilhamento de tela. Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
// ---- Compartilhamento de tela ----
function screenMaxBitrate() {
  // Teto (não meta): o WebRTC ajusta sozinho conforme a banda disponível. ~0,08 bit/pixel/quadro, entre 1,2 e 12 Mbps.
  const t = screenStream && screenStream.getVideoTracks()[0];
  const s = (t && t.getSettings) ? t.getSettings() : {};
  const res = Number(prefs.res), fps = Number(prefs.fps) || 30;
  const w = s.width || (res ? Math.round(res * 16 / 9) : 1920), h = s.height || res || 1080;
  return Math.round(Math.max(1.2e6, Math.min(12e6, w * h * fps * 0.08)));
}

function senderOf(call, kind) {
  const pc = call && call.peerConnection;
  if (!pc || !pc.getSenders) return null;
  return pc.getSenders().find((s) => s.track && s.track.kind === kind) || null;
}

// Celular que assiste uma tela grande por muito tempo pode estourar a memória do navegador
// (no iPhone aparece "esta página foi recarregada devido a um problema"): para ele vai no máximo 720p, 24 fps e 2,5 Mbps.
const PHONE_SCREEN = { height: 720, fps: 24, bitrate: 2.5e6 };

// Parâmetros de envio por chamada: áudio com prioridade alta; vídeo com teto de bitrate/FPS e preferência nitidez×fluidez
async function applySenderParams(call) {
  try {
    const a = senderOf(call, 'audio');
    if (a) {
      const p = a.getParameters();
      if (p.encodings && p.encodings.length) {
        p.encodings[0].priority = 'high'; p.encodings[0].networkPriority = 'high';
        await a.setParameters(p);
      }
    }
  } catch (e) {}
  try {
    const v = senderOf(call, 'video');
    if (v && sharingScreen) {
      const p = v.getParameters();
      if (p.encodings && p.encodings.length) {
        const mob = !!(peerStates[call.peer] && peerStates[call.peer].mob);
        const st = screenStream && screenStream.getVideoTracks()[0] ? screenStream.getVideoTracks()[0].getSettings() : {};
        const fps = Number(prefs.fps) || 30;
        p.encodings[0].maxBitrate = mob ? Math.min(screenMaxBitrate(), PHONE_SCREEN.bitrate) : screenMaxBitrate();
        p.encodings[0].maxFramerate = mob ? Math.min(fps, PHONE_SCREEN.fps) : fps;
        p.encodings[0].scaleResolutionDownBy = (mob && st.height > PHONE_SCREEN.height) ? st.height / PHONE_SCREEN.height : 1;
        p.encodings[0].priority = 'low'; p.encodings[0].networkPriority = 'low'; // se a rede apertar, o áudio vence a tela
        try { p.degradationPreference = prefs.screenMode === 'motion' ? 'maintain-framerate' : 'maintain-resolution'; } catch (e) {}
        await v.setParameters(p);
      }
    }
  } catch (e) {}
}
function applySenderParamsAll() { Object.keys(calls).forEach((id) => applySenderParams(calls[id])); }

async function setVideoOnCalls(track) {
  const jobs = [];
  for (const id of Object.keys(calls)) {
    const pc = calls[id].peerConnection;
    if (!pc) continue;
    const sender = pc.getSenders().find((s) => (s.track && s.track.kind === 'video') || (pc.getTransceivers().some((t) => t.sender === s && t.receiver.track.kind === 'video')));
    if (sender) jobs.push(sender.replaceTrack(track).catch(() => {}));
  }
  await Promise.all(jobs);
}

// Sistema/aba → entra no MESMO destino de áudio do microfone (continua sendo uma única faixa de áudio)
let screenAudioSrc = null, screenAudioGain = null;
// Som do computador inteiro = tudo que sai das caixas, inclusive a voz de quem está na call tocando aqui.
// restrictOwnAudio pede ao navegador para tirar o som desta aba da captura; sem isso a pessoa se ouve de volta.
const SCREEN_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true };
// Navegador/app que não conseguiu tirar o som da call (ex.: app de PC, que pega o som do Windows inteiro):
// liga o cancelamento de eco, que usa o som da call como referência e apaga a voz dos outros da captura.
async function guardOwnAudio(track) {
  const st = track.getSettings ? track.getSettings() : {};
  if (st.restrictOwnAudio === true) return;
  try { await track.applyConstraints({ echoCancellation: true, noiseSuppression: false, autoGainControl: false }); } catch (e) {}
}
function connectScreenAudio(track) {
  guardOwnAudio(track);
  disconnectScreenAudio();
  ensureAudioGraph();
  const ctx = getAudioCtx();
  screenAudioSrc = ctx.createMediaStreamSource(new MediaStream([track]));
  screenAudioGain = ctx.createGain();
  screenAudioGain.gain.value = 1;
  screenAudioSrc.connect(screenAudioGain); screenAudioGain.connect(outDest);
}
function disconnectScreenAudio() {
  try { if (screenAudioSrc) screenAudioSrc.disconnect(); } catch (e) {}
  try { if (screenAudioGain) screenAudioGain.disconnect(); } catch (e) {}
  screenAudioSrc = screenAudioGain = null;
}

function screenConstraints() {
  const res = Number(prefs.res), fps = Number(prefs.fps) || 30;
  const video = { frameRate: { ideal: fps, max: fps } };
  if (res) { const w = Math.round(res * 16 / 9); video.width = { ideal: w, max: w }; video.height = { ideal: res, max: res }; }
  const opts = { video, audio: false, surfaceSwitching: 'include', selfBrowserSurface: 'exclude' };
  if (prefs.screenAudio) {
    opts.audio = Object.assign({}, SCREEN_AUDIO);
    opts.systemAudio = 'include';
    opts.windowAudio = 'window';   // compartilhando uma janela: só o som daquele programa, não o do PC inteiro
  }
  return opts;
}

function describeScreen() {
  const t = screenStream && screenStream.getVideoTracks()[0];
  if (!t || !t.getSettings) return '';
  const s = t.getSettings();
  let txt = (s.width && s.height) ? s.width + '×' + s.height : '';
  if (s.frameRate) txt += ' a ' + Math.round(s.frameRate) + ' fps';
  const au = screenStream.getAudioTracks().length ? ' · com áudio' : (prefs.screenAudio ? ' · sem áudio (o navegador não enviou)' : '');
  return txt + au;
}

async function startScreenShare() {
  if (audioShareStream) stopAudioShare(true);
  try {
    try { screenStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints()); }
    catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return; // usuário cancelou
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });  // navegador não aceitou as opções: tenta o básico
    }
  } catch (e) { return; }
  const vt = screenStream.getVideoTracks()[0];
  try { vt.contentHint = prefs.screenMode === 'motion' ? 'motion' : 'detail'; } catch (e) {}
  sharingScreen = true;
  const viewers = Object.keys(calls).length;
  if (viewers >= 5) notify('Sua tela vai para ' + viewers + ' pessoas ao mesmo tempo. Se travar, baixe a resolução ou os FPS nos Ajustes.', true);
  const localVideo = document.querySelector('#tile-local video');
  localVideo.srcObject = new MediaStream([vt]);
  localVideo.classList.add('has-video');
  $('tile-local').classList.add('has-screen');
  $('screenBtn').classList.add('active');
  $('swapScreenBtn').classList.add('show');
  const at = screenStream.getAudioTracks()[0];
  if (at) connectScreenAudio(at);
  await setVideoOnCalls(vt);
  applySenderParamsAll();
  sendMyState();
  updateScreenInfo();
  applyLayout();
  toast("Compartilhando sua tela " + describeScreen());
  // O usuário pode parar pelo botão do próprio navegador ("Parar compartilhamento"): trata igual
  vt.onended = () => { if (screenStream && screenStream.getVideoTracks()[0] === vt) stopScreenShare(); };
}

async function stopScreenShare() {
  if (!sharingScreen && !screenStream) return;
  const old = screenStream;
  sharingScreen = false;
  screenStream = null;
  if (old) old.getTracks().forEach(t => { t.onended = null; t.stop(); });
  disconnectScreenAudio();
  const localVideo = document.querySelector('#tile-local video');
  if (theater && theater.tile.id === 'tile-local') exitTheater();
  localVideo.srcObject = null;
  localVideo.classList.remove('has-video');
  $('tile-local').classList.remove('has-screen');
  $('screenBtn').classList.remove('active');
  $('swapScreenBtn').classList.remove('show');
  await setVideoOnCalls(getPlaceholderVideoTrack());
  sendMyState();
  updateScreenInfo();
  applyLayout();
  toast("Parou de compartilhar a tela");
}

$('screenBtn').onclick = async () => {
  if (!sharingScreen) await startScreenShare(); else await stopScreenShare();
};

// Trocar o que está sendo compartilhado sem parar: escolhe outra tela, janela ou aba e a imagem troca na hora.
// Os outros não veem a tela sumir; se cancelar a escolha, continua a de antes.
async function switchScreenShare() {
  if (!sharingScreen) { await startScreenShare(); return; }
  let next;
  try {
    try { next = await navigator.mediaDevices.getDisplayMedia(screenConstraints()); }
    catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return; // cancelou: segue a tela de antes
      next = await navigator.mediaDevices.getDisplayMedia({ video: true });
    }
  } catch (e) { return; }
  if (!sharingScreen) { next.getTracks().forEach((t) => t.stop()); return; } // parou enquanto escolhia
  const old = screenStream;
  const vt = next.getVideoTracks()[0];
  try { vt.contentHint = prefs.screenMode === 'motion' ? 'motion' : 'detail'; } catch (e) {}
  screenStream = next;
  document.querySelector('#tile-local video').srcObject = new MediaStream([vt]);
  const at = next.getAudioTracks()[0];
  if (at) connectScreenAudio(at); else disconnectScreenAudio();
  await setVideoOnCalls(vt);
  if (old) old.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  applySenderParamsAll();
  updateScreenInfo();
  toast('Tela trocada ' + describeScreen());
  vt.onended = () => { if (screenStream && screenStream.getVideoTracks()[0] === vt) stopScreenShare(); };
}
$('swapScreenBtn').onclick = switchScreenShare;

// Mudou resolução/FPS/prioridade enquanto compartilha: aplica na hora
async function applyScreenSettingsLive() {
  if (!sharingScreen || !screenStream) return;
  const vt = screenStream.getVideoTracks()[0];
  if (!vt) return;
  try { vt.contentHint = prefs.screenMode === 'motion' ? 'motion' : 'detail'; } catch (e) {}
  const c = screenConstraints().video;
  try { await vt.applyConstraints(c); } catch (e) { /* algumas fontes não aceitam mudar no meio: vale na próxima vez */ }
  applySenderParamsAll();
  updateScreenInfo();
}
function updateScreenInfo() {
  const el = $('screenNow');
  if (el) el.textContent = sharingScreen ? 'Em uso agora: ' + (describeScreen() || '—') : '';
}

$('leaveBtn').onclick = () => {
  if (confirm("Sair da chamada?")) location.reload();
};

// Atalho de teclado configurável (padrão: M) para mutar/desmutar — funciona enquanto a aba estiver em foco
function parseShortcut(s) {
  const parts = String(s || 'KeyM').split('+');
  const code = parts.pop();
  return { code, ctrl: parts.includes('ctrl'), alt: parts.includes('alt'), shift: parts.includes('shift'), meta: parts.includes('meta') };
}
function shortcutFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('ctrl'); if (e.altKey) mods.push('alt'); if (e.shiftKey) mods.push('shift'); if (e.metaKey) mods.push('meta');
  return mods.concat([e.code]).join('+');
}
function shortcutLabel(s) {
  const p = parseShortcut(s);
  let k = p.code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'Espaço').replace('Backquote', '`');
  const mods = [p.ctrl ? 'Ctrl' : '', p.alt ? 'Alt' : '', p.shift ? 'Shift' : '', p.meta ? 'Cmd' : ''].filter(Boolean);
  return mods.concat([k]).join('+');
}
function refreshShortcutLabels() {
  const lbl = shortcutLabel(prefs.shortcut);
  $('micBtn').title = 'Mutar/desmutar (tecla ' + lbl + ')';
  const h = $('shortcutHint'); if (h) { h.textContent = ''; h.append('Atalho: tecla '); const b = document.createElement('b'); b.textContent = lbl; h.append(b, ' muta/desmuta'); }
  if ($('setShortcutBtn')) $('setShortcutBtn').textContent = lbl;
}
let capturingShortcut = false;
document.addEventListener('keydown', (e) => {
  if (capturingShortcut) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.target.isContentEditable) return;
  const inCall = $('callScreen').offsetParent !== null; // true se estiver visível na tela
  if (!inCall) return;
  if (e.key === 'Escape' && document.body.classList.contains('settings-open')) { closeSettings(); return; }
  const sc = parseShortcut(prefs.shortcut);
  if (!e.repeat && e.code === sc.code && e.ctrlKey === sc.ctrl && e.altKey === sc.alt && e.shiftKey === sc.shift && e.metaKey === sc.meta) {
    e.preventDefault();
    $('micBtn').click();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
  if (e.key === 'Enter') { if (tag === 'button') return; e.preventDefault(); toggleChat(true); return; }
  if (e.code === 'KeyF') { toggleFullscreen(); return; }
  const n = Number(e.key);
  if (n >= 1 && n <= REACTIONS.length) sendReaction(n - 1);
});
