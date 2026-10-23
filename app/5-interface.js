// CallZinha — visuais da sala, diagnóstico, painel de Ajustes e tela cheia. Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
// ================= visuais da sala: Cinema, Roda e Ao vivo =================
// Cada pessoa escolhe o próprio visual (só muda a tela dela). "auto": celular → Ao vivo;
// computador → Cinema quando alguém compartilha a tela, Roda quando é só conversa.
let pinnedId = null;
const VISUALS = ['auto', 'cinema', 'roda', 'live'];
const VISUAL_LABEL = { auto: 'Automático', cinema: 'Cinema', roda: 'Roda', live: 'Ao vivo' };
const phoneQuery = window.matchMedia ? window.matchMedia('(max-width: 700px)') : { matches: false };
// Telas no palco: quem foi fixado (duplo clique) ou TODAS as telas compartilhadas, a dos outros primeiro
function stageTileIds() {
  if (pinnedId && document.getElementById(pinnedId)) return [pinnedId];
  const ids = Object.keys(peerStates).filter((pid) => peerStates[pid].screen && document.getElementById('tile-' + pid)).map((pid) => 'tile-' + pid);
  if (sharingScreen) ids.push('tile-local');
  return ids;
}
function focusTileId() { return stageTileIds()[0] || null; }
function chosenVisual() { return VISUALS.includes(prefs.visual) ? prefs.visual : 'auto'; }
function currentVisual(fid) {
  const v = chosenVisual();
  if (v !== 'auto') return v;
  if (phoneQuery.matches) return 'live';
  return fid ? 'cinema' : 'roda';
}
function applyLayout() {
  const grid = $('grid');
  if (!grid) return;
  scheduleSpeakers();
  document.body.classList.toggle('host', !!isHost);
  const stages = stageTileIds();   // telas compartilhadas (ou quem foi fixado) viram o palco
  const fid = stages[0] || null;
  const v = currentVisual(fid);
  ['cinema', 'roda', 'live'].forEach((n) => document.body.classList.toggle('v-' + n, n === v));
  grid.classList.toggle('has-stage', !!fid);
  grid.classList.toggle('multi-stage', stages.length > 1);
  grid.style.setProperty('--stages', String(Math.max(1, stages.length)));
  grid.querySelectorAll('.tile').forEach((t) => { t.classList.toggle('focus', stages.includes(t.id)); t.classList.toggle('pinned', t.id === pinnedId); });
  placeChat(v === 'live');
  placeReactBar();
  const auto = chosenVisual() === 'auto';
  $('visualBtn').innerHTML = icon(v === 'cinema' ? 'cinema' : v === 'live' ? 'live' : 'roda') + '<span class="txt">' + VISUAL_LABEL[v] + '</span>' + icon('chevron');
  $('visualBtn').title = 'Visual da sala: ' + VISUAL_LABEL[v] + (auto ? ' (escolhido sozinho)' : '') + '. Só muda a sua tela';
  if (!$('visualMenu').hidden) renderVisualMenu();
  $('setVisual').value = chosenVisual();
}
// Ao vivo: as reações ficam numa linha logo acima do campo de mensagem (a altura da barra muda com a largura)
function placeReactBar() {
  const live = document.body.classList.contains('v-live') && !theater && chatDocked;
  $('reactBar').style.bottom = live ? Math.round(window.innerHeight - $('chatForm').getBoundingClientRect().top + 8) + 'px' : '';
}
window.addEventListener('resize', placeReactBar);
function setVisual(v) {
  prefs.visual = v; savePrefs(); applyLayout();
  toast('Visual: ' + VISUAL_LABEL[v] + (v === 'auto' ? ' (' + VISUAL_LABEL[currentVisual(focusTileId())] + ' agora)' : ''));
}
function togglePin(tid) { pinnedId = (pinnedId === tid) ? null : tid; applyLayout(); }
// Menu do visual: lista com Cinema, Roda e Ao vivo + chave "Escolher sozinho"
function renderVisualMenu() {
  const v = currentVisual(focusTileId());
  document.querySelectorAll('#visualMenu .vitem').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('sel', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  $('visualAuto').checked = chosenVisual() === 'auto';
}
function toggleVisualMenu(force) {
  const m = $('visualMenu');
  const open = typeof force === 'boolean' ? force : m.hidden;
  m.hidden = !open;
  $('visualBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    m.style.top = window.innerWidth <= 520 ? Math.round($('visualBtn').getBoundingClientRect().bottom + 6) + 'px' : '';
    renderVisualMenu();
  }
}
$('visualBtn').onclick = () => toggleVisualMenu();
document.querySelectorAll('#visualMenu .vitem').forEach((b) => { b.onclick = () => { setVisual(b.dataset.v); toggleVisualMenu(false); }; });
// desligar a chave mantém o visual que está na tela agora
$('visualAuto').onchange = (e) => { setVisual(e.target.checked ? 'auto' : currentVisual(focusTileId())); renderVisualMenu(); };
document.addEventListener('pointerdown', (e) => { if (!$('visualMenu').hidden && !e.target.closest('.vwrap')) toggleVisualMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('visualMenu').hidden) { toggleVisualMenu(false); $('visualBtn').focus(); } });
$('setVisual').onchange = (e) => setVisual(e.target.value);
if (phoneQuery.addEventListener) phoneQuery.addEventListener('change', applyLayout);

// No Ao vivo o chat fica sempre aberto, embaixo das pessoas; nos outros visuais é o painel flutuante
let chatDocked = false;
function placeChat(dock) {
  if (dock === chatDocked || theater) return;   // na tela cheia o chat está dentro do vídeo; ajeita quando sair
  chatDocked = dock;
  const p = $('chatPanel');
  if (dock) { $('callScreen').insertBefore(p, $('controls')); p.classList.remove('closed'); chatUnread = 0; renderChatBadge(); }
  else { document.body.insertBefore(p, $('settingsOverlay')); p.classList.add('closed'); }
  $('chatBtn').classList.toggle('active', dock);
}

// ================= v10: diagnóstico (getStats real) =================
const statsPrev = {};   // peerId -> última amostra (para calcular taxas)
const peerHealth = {};  // peerId -> { level, m }
let statsTimer = null, statsTick = 0, statsBusy = false, diagOpen = false;
const lastWarn = {};

function startStatsLoop() { if (!statsTimer) statsTimer = setInterval(statsStep, 2000); }

async function collectStats(pid) {
  const call = calls[pid], pc = call && call.peerConnection;
  if (!pc || !pc.getStats) return null;
  let rep;
  try { rep = await pc.getStats(); } catch (e) { return null; }
  const now = performance.now();
  const prev = statsPrev[pid] || {};
  const cur = { t: now };
  const m = { state: pc.iceConnectionState, rtt: null, jitter: null, loss: null, aIn: null, vIn: null, w: null, h: null, fps: null, aOut: null, vOut: null, limit: null, route: null };
  let selected = null, rttRemote = null;
  const pairs = [];
  rep.forEach((r) => {
    if (r.type === 'transport' && r.selectedCandidatePairId) selected = r.selectedCandidatePairId;
    else if (r.type === 'candidate-pair') pairs.push(r);
    else if (r.type === 'remote-inbound-rtp' && typeof r.roundTripTime === 'number') rttRemote = r.roundTripTime * 1000;
    else if (r.type === 'inbound-rtp' && !r.isRemote) {
      const kind = r.kind || r.mediaType;
      if (kind === 'audio') {
        cur.aIn = r.bytesReceived; cur.aLost = r.packetsLost; cur.aRecv = r.packetsReceived;
        if (typeof r.jitter === 'number') m.jitter = r.jitter * 1000;
        cur.aSamp = r.totalSamplesReceived; cur.aConc = r.concealedSamples; cur.aSilConc = r.silentConcealedSamples;
        cur.aStretch = (r.insertedSamplesForDeceleration || 0) + (r.removedSamplesForAcceleration || 0);
        cur.jbd = r.jitterBufferDelay; cur.jbe = r.jitterBufferEmittedCount;
      } else if (kind === 'video') {
        cur.vIn = r.bytesReceived; m.w = r.frameWidth; m.h = r.frameHeight; m.fps = r.framesPerSecond;
      }
    } else if (r.type === 'outbound-rtp' && !r.isRemote) {
      const kind = r.kind || r.mediaType;
      if (kind === 'audio') cur.aOut = r.bytesSent;
      else if (kind === 'video') { cur.vOut = r.bytesSent; m.limit = r.qualityLimitationReason || null; }
    }
  });
  const pair = pairs.find((p) => p.id === selected) || pairs.find((p) => (p.nominated || p.selected) && p.state === 'succeeded');
  if (pair && typeof pair.currentRoundTripTime === 'number') m.rtt = pair.currentRoundTripTime * 1000;
  else if (rttRemote !== null) m.rtt = rttRemote;
  if (pair && pair.localCandidateId) {
    const lc = rep.get ? rep.get(pair.localCandidateId) : null;
    const rc = rep.get ? rep.get(pair.remoteCandidateId) : null;
    const types = [lc && lc.candidateType, rc && rc.candidateType];
    m.route = types.includes('relay') ? 'via servidor TURN' : (types.includes('srflx') || types.includes('prflx')) ? 'direta (via STUN)' : types.some(Boolean) ? 'direta (rede local)' : null;
  }
  const dt = prev.t ? (now - prev.t) / 1000 : 0;
  const rate = (a, b) => (dt > 0 && typeof a === 'number' && typeof b === 'number' && a >= b) ? ((a - b) * 8 / 1000 / dt) : null; // kbps
  m.aIn = rate(cur.aIn, prev.aIn); m.vIn = rate(cur.vIn, prev.vIn);
  m.aOut = rate(cur.aOut, prev.aOut); m.vOut = rate(cur.vOut, prev.vOut);
  if (dt > 0 && typeof cur.aLost === 'number' && typeof prev.aLost === 'number') {
    const dL = Math.max(0, cur.aLost - prev.aLost), dR = Math.max(0, cur.aRecv - prev.aRecv);
    if (dL + dR > 0) m.loss = dL / (dL + dR) * 100;
  }
  const d = (k) => (typeof cur[k] === 'number' && typeof prev[k] === 'number') ? cur[k] - prev[k] : null;
  const dS = d('aSamp');
  if (dS > 0) {
    const conc = Math.max(0, (d('aConc') || 0) - (d('aSilConc') || 0)) + Math.max(0, d('aStretch') || 0);
    m.robot = Math.min(100, conc / dS * 100);   // % da voz reconstruída/esticada: acima de ~5% soa robótica
  }
  const dE = d('jbe');
  if (dE > 0) m.buf = d('jbd') / dE * 1000;     // atraso que o buffer de áudio está segurando (ms)
  statsPrev[pid] = cur;
  return m;
}

function levelOf(m) {
  if (!m) return 'good';
  if (m.state === 'failed' || m.state === 'closed') return 'bad';
  if ((m.loss != null && m.loss >= 15) || (m.rtt != null && m.rtt >= 800)) return 'bad';
  if (m.state === 'disconnected' || (m.loss != null && m.loss >= 5) || (m.rtt != null && m.rtt >= 300) || (m.jitter != null && m.jitter >= 50)) return 'warn';
  return 'good';
}

function updateHealth(out) {
  Object.keys(peerHealth).forEach((pid) => { if (!out[pid]) { delete peerHealth[pid]; renderBadges(pid); } });
  Object.keys(out).forEach((pid) => {
    const level = levelOf(out[pid]);
    const was = peerHealth[pid] && peerHealth[pid].level;
    peerHealth[pid] = { level, m: out[pid] };
    if (level !== was) {
      renderBadges(pid);
      if (level !== 'good' && Date.now() - (lastWarn[pid] || 0) > 30000) { lastWarn[pid] = Date.now(); notify('⚠️ Conexão ' + (level === 'bad' ? 'ruim' : 'instável') + ' com ' + nameOf(pid), true); }
    }
  });
  updateNetBadge();
}

function updateNetBadge() {
  const b = $('netBadge');
  const hs = Object.keys(peerHealth).map((k) => peerHealth[k]);
  if (!hs.length) { b.style.display = 'none'; $('netDot').className = 'cdot'; return; }
  const worst = hs.some((h) => h.level === 'bad') ? 'bad' : hs.some((h) => h.level === 'warn') ? 'warn' : 'good';
  const rtts = hs.map((h) => h.m && h.m.rtt).filter((v) => typeof v === 'number');
  b.style.display = 'inline';
  b.className = worst;
  b.textContent = 'conexão ' + (worst === 'good' ? 'boa' : worst === 'warn' ? 'instável' : 'ruim');
  b.title = (rtts.length ? 'Atraso: ' + Math.round(Math.max(...rtts)) + ' ms. ' : '') + 'Clique para ver os detalhes da conexão';
  $('netDot').className = 'cdot ' + worst;
}
$('netBadge').onclick = () => toggleDiag();

async function statsStep() {
  statsTick++;
  if (!diagOpen && statsTick % 2) return;   // painel fechado: só a cada 4 s (basta para os alertas)
  if (statsBusy) return;
  statsBusy = true;
  try {
    const ids = Object.keys(calls);
    const res = await Promise.all(ids.map(collectStats));
    const out = {};
    ids.forEach((id, i) => { if (res[i]) out[id] = res[i]; });
    updateHealth(out);
    lastStats = { t: Date.now(), out };
    if (diagOpen) renderDiag(out);
  } finally { statsBusy = false; }
}

// ---- Copiar diagnóstico: um texto só com o estado do app e das ligações, para colar numa conversa ----
let lastStats = null;
function platformText() {
  const ua = navigator.userAgent, m = (re) => { const r = re.exec(ua); return r ? r[1] : null; };
  const br = m(/Edg\/(\d+)/) ? 'Edge ' + m(/Edg\/(\d+)/) : m(/Firefox\/(\d+)/) ? 'Firefox ' + m(/Firefox\/(\d+)/)
    : m(/Chrome\/(\d+)/) ? 'Chrome ' + m(/Chrome\/(\d+)/) : m(/Version\/([\d.]+).*Safari/) ? 'Safari ' + m(/Version\/([\d.]+)/) : 'navegador ?';
  const os = /Windows NT/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '?';
  return (window.Capacitor ? 'app Android' : location.protocol === 'app:' ? 'app de PC' : 'site') + ' · ' + br + ' · ' + os + ' · ' + (navigator.hardwareConcurrency || '?') + ' núcleos';
}
async function buildDiagText() {
  const L = [];
  const num = (v, d, u) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) + u : '—';
  const yn = (v) => v === undefined ? '?' : (v ? 'sim' : 'não');
  L.push('CallZinha — diagnóstico de ' + new Date().toLocaleString('pt-BR'));
  L.push('Versão: v' + APP_VERSION + ' · ' + platformText());
  L.push('Sala: ' + ($('grid') ? $('grid').children.length : 0) + ' pessoa(s) · você é o anfitrião: ' + (isHost ? 'sim' : 'não') + ' · internet do aparelho: ' + (navigator.onLine ? 'ok' : 'sem conexão'));
  const s = micTrack && micTrack.getSettings ? micTrack.getSettings() : {};
  L.push('Microfone: ' + (!hasMic ? 'não ativado' : (micOn ? 'ligado' : 'no mudo') + ' · ' + (micTrack && micTrack.label ? micTrack.label : 'padrão') + ' · estado ' + micState +
    ' · eco ' + yn(s.echoCancellation) + ' · ruído do navegador ' + yn(s.noiseSuppression) + ' · AGC ' + yn(s.autoGainControl) + ' · volume ' + micVolumePercent + '%'));
  const nm = { ai: 'IA (RNNoise)', dfn: 'IA forte (DeepFilterNet)', browser: 'navegador', off: 'desligado' };
  L.push('Filtro de ruído: escolhido ' + (nm[prefs.noise] || prefs.noise) + ' · em uso ' + (nm[effectiveNoise()] || effectiveNoise()) +
    (dfnNode ? ' · memória ' + Math.round(dfnMem / 1048576) + ' MB' : '') + (dfnFailed ? ' · forte falhou' : '') + (rnnoiseFailed ? ' · RNNoise falhou' : '') +
    ' · portão ' + (prefs.gateOn ? prefs.gateThr + ' dB' : 'desligado'));
  if (audioCtx) L.push('Áudio: ' + audioCtx.sampleRate + ' Hz · ' + audioCtx.state + ' · latência ' + num((audioCtx.baseLatency || 0) * 1000, 0, ' ms') + ' + saída ' + num((audioCtx.outputLatency || 0) * 1000, 0, ' ms'));
  L.push('TURN: ' + turnInfo + (sharingScreen ? ' · você está compartilhando a tela (upload informado: ' + prefs.upload + ' Mbps)' : ''));
  let out = lastStats && Date.now() - lastStats.t < 6000 ? lastStats.out : null;
  if (!out) {
    const ids = Object.keys(calls), res = await Promise.all(ids.map(collectStats));
    out = {}; ids.forEach((id, i) => { if (res[i]) out[id] = res[i]; });
  }
  const ids = Object.keys(out);
  L.push('Ligações (' + ids.length + '):');
  if (!ids.length) L.push('- nenhuma ligação de áudio ativa');
  ids.forEach((pid) => {
    const m = out[pid];
    L.push('- ' + nameOf(pid) + ': ' + m.state + (m.route ? ' · ' + m.route : '') + ' · ida e volta ' + num(m.rtt, 0, ' ms') + ' · jitter ' + num(m.jitter, 1, ' ms') +
      ' · perda ' + num(m.loss, 1, '%') + ' · buffer ' + num(m.buf, 0, ' ms') + ' · voz reconstruída ' + num(m.robot, 1, '%') +
      ' · recebe ' + num(m.aIn, 0, ' kbps') + ' · envia ' + num(m.aOut, 0, ' kbps') + (m.vIn ? ' · tela recebida ' + num(m.vIn, 0, ' kbps') : '') +
      (m.vOut ? ' · tela enviada ' + num(m.vOut, 0, ' kbps') + (m.limit && m.limit !== 'none' ? ' (limitada por ' + m.limit + ')' : '') : ''));
  });
  L.push('Eventos recentes:');
  L.push(czLog.length ? czLog.slice(-15).map((x) => '- ' + x).join('\n') : '- nenhum');
  return L.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }
}
async function copyDiag() {
  const text = await buildDiagText();
  if (await copyText(text)) { toast('Diagnóstico copiado! Cole na conversa com quem vai ajudar.'); return; }
  // sem permissão de área de transferência: mostra o texto selecionado no painel para copiar na mão
  closeSettings(); toggleDiag(true);
  setTimeout(() => {
    const ta = document.createElement('textarea');
    ta.readOnly = true; ta.value = text; ta.rows = 8;
    ta.style.cssText = 'display:block;width:calc(100% - 24px);margin:10px 12px;background:#0d1016;color:#dfe2e8;border:1px solid #2a2e37;border-radius:8px;font:11px/1.4 monospace;';
    const old = $('diagCopyTa'); if (old) old.remove();
    ta.id = 'diagCopyTa';
    $('diagPanel').insertBefore(ta, $('diagBody'));   // fora do diagBody, que é redesenhado a cada 2 s
    ta.focus(); ta.select();
    toast('Selecionei o diagnóstico: aperte Ctrl+C (ou segure e copie no celular).');
  }, 50);
}

function toggleDiag(force) {
  diagOpen = typeof force === 'boolean' ? force : !diagOpen;
  $('diagPanel').classList.toggle('show', diagOpen);
  $('openDiagBtn').textContent = diagOpen ? 'Fechar' : 'Abrir';
  if (diagOpen) { startStatsLoop(); statsStep(); renderDiag({}); }
  else { const ta = $('diagCopyTa'); if (ta) ta.remove(); }
}
$('diagClose').onclick = () => toggleDiag(false);
$('copyDiagBtn').onclick = copyDiag;
$('copyDiagBtn2').onclick = copyDiag;
$('openDiagBtn').onclick = () => { toggleDiag(); if (diagOpen) closeSettings(); };

function renderDiag(out) {
  const body = $('diagBody');
  body.textContent = '';
  const ids = Object.keys(out);
  if (!ids.length) { const p = document.createElement('div'); p.className = 'dfoot'; p.textContent = 'Ninguém conectado por áudio ainda.'; body.appendChild(p); return; }
  const tbl = document.createElement('table');
  const num = (v, d, u) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) + u : '—';
  ids.forEach((pid) => {
    const m = out[pid], lvl = levelOf(m);
    const head = tbl.insertRow(); head.className = 'peerhead';
    const c = head.insertCell(); c.colSpan = 2;
    c.textContent = nameOf(pid) + ' — ' + m.state + (m.route ? ' · ' + m.route : '');
    const row = (label, value, cls) => { const r = tbl.insertRow(); const th = document.createElement('th'); th.textContent = label; r.appendChild(th); const td = r.insertCell(); td.textContent = value; if (cls) td.className = cls; };
    row('Latência (ida e volta)', num(m.rtt, 0, ' ms'), m.rtt >= 800 ? 'bd' : m.rtt >= 300 ? 'wn' : 'ok');
    row('Jitter (áudio)', num(m.jitter, 1, ' ms'), m.jitter >= 50 ? 'wn' : 'ok');
    row('Perda de pacotes (áudio)', num(m.loss, 1, ' %'), m.loss >= 15 ? 'bd' : m.loss >= 5 ? 'wn' : 'ok');
    row('Atraso do buffer (áudio)', num(m.buf, 0, ' ms'), m.buf >= 400 ? 'bd' : m.buf >= 200 ? 'wn' : 'ok');
    row('Voz reconstruída', num(m.robot, 1, ' %') + (m.robot >= 5 ? ' · pode soar robótica' : ''), m.robot >= 15 ? 'bd' : m.robot >= 5 ? 'wn' : 'ok');
    row('Áudio recebido', num(m.aIn, 0, ' kbps'));
    const st = peerStates[pid] || {};
    if (st.screen) {
      row('Tela recebida', num(m.vIn, 0, ' kbps'));
      row('Resolução / FPS recebidos', (m.w && m.h ? m.w + '×' + m.h : '—') + ' @ ' + (typeof m.fps === 'number' ? Math.round(m.fps) + ' fps' : '—'));
    }
    row('Você envia: áudio', num(m.aOut, 0, ' kbps'));
    if (sharingScreen) row('Você envia: tela', num(m.vOut, 0, ' kbps') + (m.limit && m.limit !== 'none' ? ' · limitado por ' + ({ bandwidth: 'banda', cpu: 'processador' }[m.limit] || m.limit) : ''), m.limit === 'bandwidth' || m.limit === 'cpu' ? 'wn' : '');
    if (lvl !== 'good') row('Alerta', lvl === 'bad' ? 'Conexão ruim: podem ocorrer cortes' : 'Conexão instável', lvl === 'bad' ? 'bd' : 'wn');
  });
  body.appendChild(tbl);
}

// ================= v10: painel de configurações =================
function openSettings() {
  document.body.classList.add('settings-open');
  initSettingsValues();
  refreshDevices(); refreshMicInfo(); refreshNoiseHint(); updateScreenInfo();
  settingsMeterLoop();
}
function closeSettings() {
  document.body.classList.remove('settings-open');
  cancelAnimationFrame(settingsRaf);
  if (monitorOn) toggleMonitor(false);
}
let settingsRaf = 0;
function settingsMeterLoop() {
  if (!document.body.classList.contains('settings-open')) return;
  const fill = $('micMeterFill'), gateMark = $('micMeterGate');
  let db = -70, peak = 0;
  if (micTapAnalyser && hasMic) {
    const buf = new Float32Array(micTapAnalyser.fftSize);
    micTapAnalyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; const a = Math.abs(buf[i]); if (a > peak) peak = a; }
    db = Math.max(-70, 10 * Math.log10(s / buf.length + 1e-12));
  }
  fill.style.width = Math.max(0, Math.min(100, (db + 70) / 70 * 100)) + '%';
  fill.style.background = peak > 0.98 ? '#ff6b6b' : (prefs.gateOn && db < Number(prefs.gateThr)) ? '#6b7280' : '#5fd38d';
  gateMark.style.display = prefs.gateOn ? 'block' : 'none';
  gateMark.style.left = ((Number(prefs.gateThr) + 70) / 70 * 100) + '%';
  settingsRaf = requestAnimationFrame(settingsMeterLoop);
}

function refreshMicInfo() {
  const el = $('micInfo');
  if (!el) return;
  if (!hasMic || !micTrack) { el.textContent = 'Microfone não ativado.'; return; }
  const s = micTrack.getSettings ? micTrack.getSettings() : {};
  const yn = (v) => v === undefined ? '?' : (v ? 'sim' : 'não');
  el.textContent = 'Em uso — eco: ' + yn(s.echoCancellation) + ' · ruído do navegador: ' + yn(s.noiseSuppression) + ' · AGC: ' + yn(s.autoGainControl) +
    ' · filtro IA: ' + (dfnNode ? 'forte (DeepFilterNet), ' + Math.round(dfnMem / 1048576) + ' MB' : rnnoiseNode ? 'ativo' : 'inativo') + (s.sampleRate ? ' · ' + s.sampleRate + ' Hz' : '') + (s.channelCount ? ' · ' + s.channelCount + ' canal' : '');
}
function refreshNoiseHint() {
  const el = $('noiseHint');
  if (!el) return;
  let t = '';
  if (prefs.noise === 'dfn') {
    const rnTxt = rnnoiseAssets ? 'o filtro de IA normal' : 'o do navegador';
    if (!dfnSupported()) t = 'Este navegador não suporta o filtro forte; usando ' + rnTxt + '.';
    else if (audioCtx && audioCtx.sampleRate !== 48000) t = 'Este aparelho não abriu o áudio em 48 kHz; usando o filtro do navegador.';
    else if (dfnFailed) t = 'O filtro forte não carregou (internet ou aparelho). Usando ' + rnTxt + ' por enquanto.';
    else if (!dfnAssets) t = dfnProgress >= 0 ? 'Baixando o filtro forte... ' + dfnProgress + '% (~12 MB, só na primeira vez). Enquanto isso, ' + rnTxt + ' segura.' : 'O filtro forte baixa ~12 MB na primeira vez e fica guardado.';
    else t = 'Rede neural mais pesada (DeepFilterNet3), roda no seu aparelho: tira teclado, ventilador e barulho de fundo com a voz mais natural. Enquanto ligada usa uns 10% de um núcleo do processador e ~50 MB de memória, e a voz atrasa uns 40 ms; no mudo ela pausa.';
  } else if (prefs.noise === 'ai') {
    if (!workletSupported()) t = 'Este navegador não suporta o filtro de IA; usando o do navegador.';
    else if (audioCtx && audioCtx.sampleRate !== 48000) t = 'Este aparelho não abriu o áudio em 48 kHz; usando o filtro do navegador.';
    else if (rnnoiseFailed && !rnnoiseAssets) t = 'Não consegui baixar o filtro de IA (internet ou bloqueio). Usando o do navegador por enquanto.';
    else if (!rnnoiseAssets) t = 'Baixando o filtro de IA (~220 KB)...';
    else t = 'Roda no seu aparelho (WebAssembly), nada é enviado a terceiros; adiciona cerca de 10 ms de atraso.';
  } else if (prefs.noise === 'browser') t = 'Filtro do navegador: leve, mas deixa passar mais teclado e ventilador.';
  else t = 'Sem filtro: a voz vai como o microfone captou.';
  el.textContent = t;
}

function initSettingsValues() {
  $('setName').value = myName === 'Anônimo' ? '' : myName;
  $('setGain').value = micVolumePercent; $('setGainVal').textContent = micVolumePercent + '%';
  $('setNoise').value = prefs.noise;
  $('setEcho').checked = !!prefs.echo; $('setAgc').checked = !!prefs.agc;
  $('setGate').checked = !!prefs.gateOn; $('setGateThr').value = prefs.gateThr; $('setGateVal').textContent = prefs.gateThr + ' dB';
  $('gateRow').style.display = prefs.gateOn ? '' : 'none';
  $('setRes').value = String(prefs.res); $('setFps').value = String(prefs.fps); $('setUpload').value = String(prefs.upload);
  $('setScreenMode').value = prefs.screenMode; $('setScreenAudio').checked = !!prefs.screenAudio;
  $('setNotices').checked = !!prefs.notices;
  $('setSounds').checked = !!prefs.sounds;
  $('setMonitorSrc').value = monitorSrc;
  const aiOpt = [...$('setNoise').options].find((o) => o.value === 'ai');
  if (aiOpt) aiOpt.disabled = !workletSupported();
  const dfnOpt = [...$('setNoise').options].find((o) => o.value === 'dfn');
  if (dfnOpt) dfnOpt.disabled = !dfnSupported();
  refreshShortcutLabels();
}

$('settingsBtn').onclick = openSettings;
$('settingsClose').onclick = closeSettings;
$('settingsOverlay').onclick = closeSettings;

$('setName').onchange = (e) => {
  myName = cleanName(e.target.value) || 'Anônimo';
  prefs.name = myName === 'Anônimo' ? '' : myName; savePrefs();
  const tile = $('tile-local');
  if (tile) setTileName(tile, myName, prefs.avatar);
  sendMyName();
  if (isHost && peer) broadcastRoster();
};
$('setMicDevice').onchange = (e) => { prefs.micDevice = e.target.value; savePrefs(); applyMicSettings(); };
$('setOutDevice').onchange = (e) => { prefs.outDevice = e.target.value; savePrefs(); applySinkAll(); };
$('setGain').oninput = (e) => setMicVolume(Number(e.target.value), 'panel');
$('setNoise').onchange = async (e) => {
  const prev = prefs.noise;
  prefs.noise = e.target.value; savePrefs();
  if (prev === 'dfn' && prefs.noise !== 'dfn') releaseDfn();   // solta o filtro forte da memória
  if (prefs.noise === 'dfn') dfnFailed = false;                 // escolher de novo = tentar de novo
  if ((prefs.noise === 'ai' || prefs.noise === 'dfn') && workletSupported()) { refreshNoiseHint(); await prepareNoise(10000, 2500); }
  refreshNoiseHint();
  applyMicSettings();
};
$('setEcho').onchange = (e) => { prefs.echo = e.target.checked; savePrefs(); applyMicSettings(); };
$('setAgc').onchange = (e) => { prefs.agc = e.target.checked; savePrefs(); applyMicSettings(); };
$('setGate').onchange = (e) => { prefs.gateOn = e.target.checked; savePrefs(); $('gateRow').style.display = prefs.gateOn ? '' : 'none'; sendGate(); };
$('setGateThr').oninput = (e) => { prefs.gateThr = Number(e.target.value); $('setGateVal').textContent = prefs.gateThr + ' dB'; sendGate(); };
$('setGateThr').onchange = () => savePrefs();
$('setRes').onchange = (e) => { prefs.res = Number(e.target.value); savePrefs(); applyScreenSettingsLive(); };
$('setFps').onchange = (e) => { prefs.fps = Number(e.target.value); savePrefs(); applyScreenSettingsLive(); };
$('setUpload').onchange = (e) => { prefs.upload = Number(e.target.value); savePrefs(); applySenderParamsAll(); };
$('setScreenMode').onchange =(e) => { prefs.screenMode = e.target.value; savePrefs(); applyScreenSettingsLive(); };
$('setScreenAudio').onchange = (e) => { prefs.screenAudio = e.target.checked; savePrefs(); if (sharingScreen) toast('O áudio da tela vale na próxima vez que você compartilhar.'); };
$('setNotices').onchange = (e) => { prefs.notices = e.target.checked; savePrefs(); };
$('setSounds').onchange = (e) => { prefs.sounds = e.target.checked; savePrefs(); if (prefs.sounds) playCue(true); };
$('monitorBtn').onclick = () => toggleMonitor();
$('setMonitorSrc').onchange = (e) => { monitorSrc = e.target.value; if (monitorOn) connectMonitor(); };
$('setShortcutBtn').onclick = () => {
  const btn = $('setShortcutBtn');
  capturingShortcut = true; btn.textContent = 'Pressione a tecla…';
  const MODS = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
  const handler = (e) => {
    if (MODS.includes(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    document.removeEventListener('keydown', handler, true);
    capturingShortcut = false;
    if (e.code !== 'Escape') { prefs.shortcut = shortcutFromEvent(e); savePrefs(); }
    refreshShortcutLabels();
  };
  document.addEventListener('keydown', handler, true);
};

// Estado inicial da tela de entrada: nome salvo e pré-carregamento do filtro de IA (não atrapalha a abertura da página)
if (prefs.name) $('nameInput').value = prefs.name;
try { const k = sessionStorage.getItem('cz-kicked'); if (k) { sessionStorage.removeItem('cz-kicked'); setStatus('O anfitrião tirou você da sala ' + k + '.'); } } catch (e) {}
if ((prefs.noise === 'ai' || prefs.noise === 'dfn') && workletSupported()) {
  const warm = () => { loadRnnoiseAssets().catch(() => {}); if (prefs.noise === 'dfn' && dfnSupported()) loadDfnAssets().catch(() => {}); };
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAudio(); });

// ---- Tela cheia + girar (celular) ----
let theater = null; // { tile, rot, fs }
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
function tryPlay(v) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => toast("Toque na tela pra liberar o áudio 🔊")); }
function leaveFs() {
  if (theater) theater.fs = false;
  if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
}

function layoutTheater() {
  if (!theater) return;
  const t = theater.tile, W = window.innerWidth, H = window.innerHeight;
  const rot = (H > W) ? theater.rot : 0; // só gira via CSS enquanto o celular está em pé
  t.style.transformOrigin = '0 0';
  if (rot === 90)       { t.style.width = H + 'px'; t.style.height = W + 'px'; t.style.transform = 'translateX(' + W + 'px) rotate(90deg)'; }
  else if (rot === 270) { t.style.width = H + 'px'; t.style.height = W + 'px'; t.style.transform = 'translateY(' + H + 'px) rotate(-90deg)'; }
  else                  { t.style.width = W + 'px'; t.style.height = H + 'px'; t.style.transform = 'none'; }
}

// Na tela cheia, o chat, as reações e os avisos vão para dentro do tile: assim giram junto com o vídeo
// no celular. O painel de música fica de fora (mover o player do YouTube faria ele recarregar).
const THEATER_OVERLAYS = ['reactBar', 'reactLayer', 'fxLayer', 'notices', 'speakers', 'toast', 'chatPanel'];
let overlayHome = [];
function moveOverlays(tile) {
  if (tile) {
    overlayHome = THEATER_OVERLAYS.map((id) => { const el = $(id); const home = [el, el.parentNode, el.nextSibling]; tile.appendChild(el); return home; });
  } else {
    overlayHome.reverse().forEach(([el, parent, next]) => parent.insertBefore(el, next));
    overlayHome = [];
  }
}

async function enterTheater(tile) {
  if (theater) exitTheater();
  const video = tile.querySelector('video');
  theater = { tile, rot: 0, fs: false };
  tile.classList.add('theater');
  moveOverlays(tile);
  if (chatDocked) $('chatPanel').classList.add('closed');   // na tela cheia o chat do Ao vivo começa fechado
  document.body.classList.add('theater-open');
  layoutTheater(); scheduleSpeakers();
  let locked = false;
  // Tela cheia da página inteira (não só do vídeo): assim o chat, as reações e os avisos aparecem por cima.
  // O tile já ocupa a janela toda pelo modo "theater".
  const root = document.documentElement;
  const fn = root.requestFullscreen || root.webkitRequestFullscreen;
  if (fn) {
    try {
      await fn.call(root);
      if (theater) theater.fs = true;
      if (screen.orientation && screen.orientation.lock && video.videoWidth >= video.videoHeight) {
        await screen.orientation.lock('landscape'); // Android/Chrome: gira de verdade
        locked = true;
      }
    } catch (e) {}
  }
  // Sem tela cheia nativa (iPhone): se está em pé e o vídeo é largo, deita via CSS
  if (theater && theater.tile === tile && !theater.fs && !locked && window.innerHeight > window.innerWidth && video.videoWidth >= video.videoHeight) theater.rot = 90;
  layoutTheater();
}

async function rotateTheater() {
  if (!theater) return;
  if (theater.fs && screen.orientation && screen.orientation.lock) {
    try {
      const landscape = window.innerWidth > window.innerHeight;
      await screen.orientation.lock(landscape ? 'portrait' : 'landscape');
      theater.rot = 0; layoutTheater(); return;
    } catch (e) {}
  }
  if (theater.fs) leaveFs(); // rotação por CSS precisa do modo "janela cheia"
  theater.rot = theater.rot === 0 ? 90 : 0;   // um toque deita, outro toque volta a ficar em pé
  layoutTheater();
}

function exitTheater() {
  if (!theater) return;
  scheduleSpeakers();
  const t = theater.tile;
  theater = null;
  moveOverlays(null);
  if (chatDocked) $('chatPanel').classList.remove('closed');
  t.classList.remove('theater');
  setTimeout(applyLayout, 0);   // o visual pode ter mudado durante a tela cheia (ex.: chat do Ao vivo)
  t.style.width = ''; t.style.height = ''; t.style.transform = ''; t.style.transformOrigin = '';
  document.body.classList.remove('theater-open');
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
  if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
}

// Tecla F: tela cheia na tela compartilhada (ou sai dela)
// Botão de tela cheia (e tecla F): com alguém compartilhando, abre a tela dele em tela cheia;
// sem ninguém compartilhando, a sala inteira fica em tela cheia. Apertar de novo sai.
function toggleFullscreen() {
  if (theater) { exitTheater(); return; }
  if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} return; }
  const t = document.querySelector('#grid .tile.focus.has-screen') || document.querySelector('#grid .tile.has-screen:not(#tile-local)') || document.querySelector('#tile-local.has-screen');
  if (t) { enterTheater(t); return; }
  const root = document.documentElement;
  const fn = root.requestFullscreen || root.webkitRequestFullscreen;
  try { const pr = fn.call(root); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
}
function syncFsBtn() {
  const on = !!fsEl() || !!theater;
  setCtrlIcon('fsBtn', on ? 'minimize' : 'maximize');
  $('fsBtn').title = on ? 'Sair da tela cheia (F ou Esc)' : 'Tela cheia (F)';
}
$('fsBtn').onclick = toggleFullscreen;
// iPhone não deixa sites entrarem em tela cheia: lá o botão some (o vídeo continua tendo o próprio botão)
if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('fsBtn').style.display = 'none';

['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
  document.addEventListener(ev, () => { if (theater && theater.fs && !fsEl()) exitTheater(); syncFsBtn(); }));
window.addEventListener('resize', layoutTheater);
window.addEventListener('orientationchange', layoutTheater);

// Celular não consegue compartilhar tela: esconde o botão
if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) { $('screenBtn').style.display = 'none'; $('audioShareBtn').style.display = 'none'; }

// Qualquer toque libera áudio/vídeo que o navegador tenha bloqueado
document.addEventListener('click', () => {
  resumeAudio();
  document.querySelectorAll('.tile video').forEach(v => { if (v.paused && v.srcObject) v.play().catch(() => {}); });
}, { passive: true });
