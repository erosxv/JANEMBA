// CallZinha — motor de áudio do microfone: filtros de ruído (RNNoise e DeepFilterNet), portão, dispositivos. Os arquivos de app/ rodam em ordem (1 → 7) e dividem as mesmas variáveis globais.
// ================= v10: motor de áudio do microfone =================
// mic (getUserMedia) → [RNNoise IA ou DeepFilterNet] → [portão de ruído] → micTap → ganho/mudo → destino fixo (vai pras chamadas)
let outDest = null, micTap = null, micTapAnalyser = null;
let micTrack = null, micSourceNode = null, rawAnalyser = null, rnnoiseNode = null, dfnNode = null, gateNode = null;
let rnnoiseAssets = null, rnnoisePromise = null, rnnoiseFailed = false;
let dfnAssets = null, dfnPromise = null, dfnFailed = false, dfnProgress = -1, dfnMem = 0, dfnGen = 0, dfnCacheOk = false;
let rnnoiseModuleReady = null, dfnModuleReady = null, gateModuleReady = null;
let micState = 'ok';          // 'ok' | 'lost' | 'nosignal'
let chainLock = Promise.resolve();
let monitorOn = false, monitorSrc = 'processed', monitorDest = null, monitorGain = null, monitorAudio = null;

function workletSupported() {
  return !!(window.AudioWorkletNode && window.WebAssembly && (window.AudioContext || window.webkitAudioContext));
}

function ensureAudioGraph() {
  if (outDest) return;
  const ctx = getAudioCtx();
  outDest = ctx.createMediaStreamDestination();
  // Mantém o motor de áudio preso ao relógio da placa de som. Sem nada tocando no alto-falante, o navegador passa a
  // processar o microfone por um temporizador comum, e com a janela minimizada o Windows deixa esse temporizador
  // impreciso: a voz sai em rajadas e chega picotada/robótica. Um sinal inaudível (-140 dB) na saída evita a troca.
  try { const keep = ctx.createConstantSource(); keep.offset.value = 1e-7; keep.connect(ctx.destination); keep.start(); } catch (e) {}
  micGainNode = ctx.createGain();
  micGainNode.gain.value = micOn ? micVolumePercent / 100 : 0;
  micGainNode.connect(outDest);
  micTap = ctx.createGain();                       // saída do processamento, ANTES do mudo: alimenta o medidor e o teste
  micTap.connect(micGainNode);
  micTapAnalyser = ctx.createAnalyser();
  micTapAnalyser.fftSize = 1024; micTapAnalyser.smoothingTimeConstant = 0;
  micTap.connect(micTapAnalyser);
  micOutputStream = outDest.stream;
}

function simdSupported() {
  try { return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])); }
  catch (e) { return false; }
}

// Baixa (uma vez) o processador do RNNoise e o binário WebAssembly (~220 KB) de um CDN; se um falhar, tenta o outro
function loadRnnoiseAssets() {
  if (rnnoiseAssets) return Promise.resolve(rnnoiseAssets);
  if (rnnoisePromise) return rnnoisePromise;
  rnnoisePromise = (async () => {
    let lastErr;
    for (const base of NS_BASES) {
      try {
        const [jsRes, wasmRes] = await Promise.all([
          fetch(base + 'rnnoise/workletProcessor.js'),
          fetch(base + (simdSupported() ? 'rnnoise_simd.wasm' : 'rnnoise.wasm'))
        ]);
        if (!jsRes.ok || !wasmRes.ok) throw new Error('HTTP ' + jsRes.status + '/' + wasmRes.status);
        const [js, wasm] = await Promise.all([jsRes.text(), wasmRes.arrayBuffer()]);
        rnnoiseAssets = { js, wasm };
        return rnnoiseAssets;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('indisponível');
  })();
  rnnoisePromise.catch(() => { rnnoisePromise = null; });
  return rnnoisePromise;
}

// ---- Filtro forte (DeepFilterNet3) ----
// Só existe na memória enquanto "IA forte" estiver escolhida. Os arquivos ficam guardados no cache do aparelho
// (baixa uma vez só); trocar de modo solta o WebAssembly compilado e a instância do AudioWorklet.
function dfnSupported() { return workletSupported() && !!window.DecompressionStream; }
async function dfnRead(res, onBytes) {
  if (!res.body || !res.body.getReader) { const b = await res.arrayBuffer(); onBytes(b.byteLength); return b; }
  const rd = res.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); n += value.length; onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}
async function dfnFetch(file, onBytes) {
  let cache = null, lastErr;
  try { cache = await caches.open(DFN_CACHE); dfnCacheOk = true; } catch (e) {}
  for (const base of DFN_BASES) {
    try {
      const url = new URL(base + file, location.href).href;
      let hit = null;
      try { hit = cache && await cache.match(url); } catch (e) {}
      if (hit) return await dfnRead(hit, onBytes);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await dfnRead(res, onBytes);
      if (cache) cache.put(url, new Response(buf)).catch(() => {});
      return buf;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('indisponível');
}
function loadDfnAssets() {
  if (dfnAssets) return Promise.resolve(dfnAssets);
  if (dfnPromise) return dfnPromise;
  const gen = dfnGen, total = 4333875 + 7983136;
  let got = 0;
  dfnProgress = 0;
  const tick = (b) => {
    got += b;
    const pc = Math.min(99, Math.floor(got * 100 / total));
    if (pc !== dfnProgress && gen === dfnGen) { dfnProgress = pc; refreshNoiseHint(); }
  };
  const p = (async () => {
    if (!dfnSupported()) throw new Error('sem suporte');
    const [glue, gz, model] = await Promise.all([
      dfnFetch('dfn-worklet.js', () => {}), dfnFetch('df_bg.wasm.gz', tick), dfnFetch('DeepFilterNet3_onnx.tar.gz', tick)
    ]);
    const wasmBuf = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const module = await WebAssembly.compile(wasmBuf);
    if (gen !== dfnGen) throw new Error('cancelado');   // trocaram de modo no meio do download
    // Com cache no aparelho, o modelo (8 MB) não fica parado na memória: é relido do disco quando o filtro liga
    dfnAssets = { js: new TextDecoder().decode(glue), module, model: dfnCacheOk ? null : model };
    dfnProgress = 100; refreshNoiseHint();
    return dfnAssets;
  })();
  dfnPromise = p;
  p.catch(() => { if (dfnPromise === p) { dfnPromise = null; dfnProgress = -1; } });
  return p;
}
function releaseDfn() {
  dfnGen++; dfnAssets = null; dfnPromise = null; dfnFailed = false; dfnProgress = -1; dfnMem = 0;
}

function ensureDfnModule() {
  if (!dfnModuleReady) dfnModuleReady = addWorkletSource(dfnAssets.js).catch((e) => { dfnModuleReady = null; throw e; });
  return dfnModuleReady;
}
async function makeDfnNode(ctx) {
  const assets = dfnAssets;
  await ensureDfnModule();
  const model = assets.model || await dfnFetch('DeepFilterNet3_onnx.tar.gz', () => {});
  const node = new AudioWorkletNode(ctx, 'cz-dfn', {
    processorOptions: { module: assets.module, model, lim: DFN_LIM, bypass: !micOn },
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit'
  });
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('demorou')), 15000);
      node.port.onmessage = (e) => {
        const d = e.data || {};
        if (d.ready) { clearTimeout(t); dfnMem = d.mem || 0; res(); }
        else if (d.error) { clearTimeout(t); rej(new Error(d.error)); }
      };
      node.onprocessorerror = () => { clearTimeout(t); rej(new Error('erro no processador')); };
    });
  } catch (e) {
    try { node.port.postMessage({ destroy: true }); } catch (_) {}
    throw e;
  }
  node.port.onmessage = (e) => {
    const d = e.data || {};
    if (d.mem) dfnMem = d.mem;
    if (d.error && node === dfnNode) {
      console.warn('dfn', d.error);
      dfnFailed = true; toast('O filtro forte parou; voltando para o filtro de IA normal.');
      applyMicSettings();
    }
  };
  node.onprocessorerror = null;
  return node;
}
// No mudo a IA forte não roda: o processador só copia o som (o medidor de "falando no mudo" continua funcionando)
function syncDfnBypass() {
  if (dfnNode) { try { dfnNode.port.postMessage({ bypass: !micOn }); } catch (e) {} }
}

async function prepareNoise(timeoutMs, dfnWaitMs) {
  const late = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  try {
    await Promise.race([loadRnnoiseAssets(), late(timeoutMs)]);
    rnnoiseFailed = false;
  } catch (e) {
    rnnoiseFailed = true;
    // Se a internet só estava lenta, quando o filtro chegar ele entra sozinho
    loadRnnoiseAssets().then(() => { rnnoiseFailed = false; if (hasMic && (prefs.noise === 'ai' || (prefs.noise === 'dfn' && !dfnAssets))) applyMicSettings(); }).catch(() => {});
  }
  if (prefs.noise === 'dfn' && dfnSupported() && !dfnFailed) {
    // Na primeira vez são ~12 MB: enquanto baixa, o RNNoise segura as pontas e o forte entra sozinho ao terminar
    const job = loadDfnAssets();
    try { await Promise.race([job, late(dfnWaitMs || 2500)]); }
    catch (e) {
      if (e.message !== 'timeout') dfnFailed = true;
      else job.then(() => { if (hasMic && prefs.noise === 'dfn' && !dfnNode) applyMicSettings(); })
        .catch((err) => { if (err.message !== 'cancelado' && prefs.noise === 'dfn') { dfnFailed = true; refreshNoiseHint(); } });
    }
  }
  refreshNoiseHint();
}

// Modo realmente em uso (pode diferir do escolhido se o navegador não suporta ou o filtro não carregou)
function effectiveNoise() {
  const rateOk = !audioCtx || audioCtx.sampleRate === 48000; // RNNoise e DeepFilterNet só funcionam em 48 kHz
  const rnOk = workletSupported() && rateOk && rnnoiseAssets && !rnnoiseFailed;
  if (prefs.noise === 'dfn') {
    if (dfnSupported() && rateOk && dfnAssets && !dfnFailed) return 'dfn';
    return rnOk ? 'ai' : 'browser';   // enquanto o forte baixa (ou se falhar), o RNNoise segura
  }
  if (prefs.noise === 'ai') return rnOk ? 'ai' : 'browser';
  return prefs.noise === 'off' ? 'off' : 'browser';
}

async function addWorkletSource(source) {
  const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  try { await getAudioCtx().audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
}
function ensureRnnoiseModule() {
  if (!rnnoiseModuleReady) rnnoiseModuleReady = addWorkletSource(rnnoiseAssets.js).catch((e) => { rnnoiseModuleReady = null; throw e; });
  return rnnoiseModuleReady;
}
// Portão de ruído próprio (pequeno): abre acima do limiar, segura 180 ms, fecha com rampa suave (sem estalo)
const GATE_SRC = [
  "class CzGate extends AudioWorkletProcessor {",
  "  constructor() { super(); this.thr = -200; this.g = 1; this.hold = 0; this.port.onmessage = (e) => { if (e.data && typeof e.data.thr === 'number') this.thr = e.data.thr; }; }",
  "  process(inputs, outputs) {",
  "    const i = inputs[0], o = outputs[0];",
  "    if (!i || !i.length || !i[0]) return true;",
  "    const n = i[0].length; let s = 0;",
  "    for (let k = 0; k < n; k++) { const v = i[0][k]; s += v * v; }",
  "    const db = 10 * Math.log10(s / n + 1e-12);",
  "    let target = 1;",
  "    if (this.thr > -150) { if (db > this.thr) this.hold = Math.ceil(0.18 * sampleRate / n); else if (this.hold > 0) this.hold--; else target = 0; }",
  "    const start = this.g, end = start + (target - start) * (target > start ? 0.35 : 0.04); this.g = end;",
  "    for (let c = 0; c < o.length; c++) { const src = i[c] || i[0]; for (let k = 0; k < n; k++) o[c][k] = src[k] * (start + (end - start) * (k / n)); }",
  "    return true;",
  "  }",
  "}",
  "registerProcessor('cz-gate', CzGate);"
].join('\n');
function ensureGateModule() {
  if (!gateModuleReady) gateModuleReady = addWorkletSource(GATE_SRC).catch((e) => { gateModuleReady = null; throw e; });
  return gateModuleReady;
}
function sendGate() {
  if (gateNode) { try { gateNode.port.postMessage({ thr: prefs.gateOn ? Number(prefs.gateThr) : -200 }); } catch (e) {} }
}

function micConstraints(useDevice) {
  const a = {
    channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
    echoCancellation: !!prefs.echo,
    noiseSuppression: effectiveNoise() === 'browser',   // com RNNoise ligado, o filtro do navegador fica desligado (filtrar duas vezes deixa a voz metálica)
    autoGainControl: !!prefs.agc
  };
  if (useDevice && prefs.micDevice) a.deviceId = { exact: prefs.micDevice };
  return { audio: a };
}
async function acquireMicStream() {
  try { return await navigator.mediaDevices.getUserMedia(micConstraints(true)); }
  catch (e) {
    if (prefs.micDevice && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
      toast('O microfone salvo não está conectado; usando o padrão do sistema.');
      return await navigator.mediaDevices.getUserMedia(micConstraints(false));
    }
    throw e;
  }
}
const MIC_ERRORS = {
  NotAllowedError: "Permissão negada. Clique no cadeado 🔒 ao lado do endereço e permita o microfone.",
  NotFoundError: "Nenhum microfone foi encontrado pelo navegador.",
  NotReadableError: "Outro programa está usando o microfone agora."
};
function micErrorText(e) { return MIC_ERRORS[e && e.name] || "Não consegui ativar o microfone."; }

function teardownChain() {
  try { if (micTrack) { micTrack.onended = null; micTrack.onmute = null; micTrack.onunmute = null; } } catch (e) {}
  disconnectMonitor();
  [micSourceNode, rawAnalyser, rnnoiseNode, dfnNode, gateNode].forEach((n) => { try { if (n) n.disconnect(); } catch (e) {} });
  try { if (rnnoiseNode) rnnoiseNode.port.postMessage('destroy'); } catch (e) {}
  try { if (dfnNode) { dfnNode.port.onmessage = null; dfnNode.port.postMessage({ destroy: true }); } } catch (e) {}
  micSourceNode = rawAnalyser = rnnoiseNode = dfnNode = gateNode = null;
}

function attachMicTrack(track) {
  chainLock = chainLock.then(() => doAttachMic(track)).catch((e) => { console.warn('mic chain', e); });
  return chainLock;
}
async function doAttachMic(track) {
  ensureAudioGraph();
  const ctx = getAudioCtx();
  teardownChain();
  micTrack = track;
  micSourceNode = ctx.createMediaStreamSource(new MediaStream([track]));
  rawAnalyser = ctx.createAnalyser();
  rawAnalyser.fftSize = 1024; rawAnalyser.smoothingTimeConstant = 0;
  micSourceNode.connect(rawAnalyser);
  let node = micSourceNode, reacquire = false;
  if (workletSupported()) {
    let mode = effectiveNoise();
    if (mode === 'dfn') {
      try {
        dfnNode = await makeDfnNode(ctx);
        node.connect(dfnNode); node = dfnNode;
      } catch (e) {
        console.warn('dfn', e);
        dfnNode = null; dfnFailed = true;
        mode = effectiveNoise();          // cai pro RNNoise (mesma captura) ou, sem ele, pro filtro do navegador
        if (mode === 'browser') reacquire = true;
        toast('O filtro forte não funcionou neste aparelho; usando o filtro de IA normal.');
      }
    }
    if (mode === 'ai') {
      try {
        await ensureRnnoiseModule();
        rnnoiseNode = new AudioWorkletNode(ctx, '@sapphi-red/web-noise-suppressor/rnnoise', {
          processorOptions: { maxChannels: 1, wasmBinary: rnnoiseAssets.wasm },
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit'
        });
        node.connect(rnnoiseNode); node = rnnoiseNode;
      } catch (e) {
        rnnoiseNode = null; rnnoiseFailed = true; reacquire = true;   // refaz a captura com o filtro do navegador ligado
        toast('Filtro de ruído por IA indisponível; usando o do navegador.');
      }
    }
    try {
      await ensureGateModule();
      gateNode = new AudioWorkletNode(ctx, 'cz-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
      node.connect(gateNode); node = gateNode; sendGate();
    } catch (e) { gateNode = null; }
  }
  node.connect(micTap);
  if (monitorOn) connectMonitor();
  track.onended = () => onMicEnded(track);
  track.onmute = () => updateMicAlert();
  track.onunmute = () => updateMicAlert();
  micState = 'ok'; noSignalCount = 0;
  updateMicAlert(); refreshMicInfo(); refreshNoiseHint(); renderBadges('local');
  if (reacquire) setTimeout(applyMicSettings, 0);
}

// Reaplica as configurações de captura (dispositivo, eco, AGC, modo de ruído): refaz só o microfone, nunca as chamadas
async function applyMicSettings() {
  if (!hasMic) { refreshMicInfo(); return; }
  const old = localStream;
  if (old) old.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
  try {
    const stream = await acquireMicStream();
    localStream = stream;
    await attachMicTrack(stream.getAudioTracks()[0]);
    refreshDevices();
  } catch (e) {
    micState = 'lost'; updateMicAlert();
    toast(micErrorText(e));
  }
}

function onMicEnded(track) {
  if (track !== micTrack) return;
  micState = 'lost';
  updateMicAlert();
  notify('🎙️ Microfone desconectado', true);
}

// Sem sinal: faixa "ao vivo" entregando silêncio digital absoluto por 5 s (mudo no aparelho/sistema, dispositivo travado)
let noSignalCount = 0;
function checkNoSignal() {
  if (!hasMic || !micTrack || micTrack.readyState !== 'live' || !rawAnalyser || !audioCtx || audioCtx.state !== 'running') { noSignalCount = 0; return; }
  const buf = new Float32Array(rawAnalyser.fftSize);
  rawAnalyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  // só conta silêncio digital (< -100 dBFS) por 12 s seguidos: microfone real, mesmo em sala quieta, sempre tem algum ruído
  noSignalCount = peak < 1e-5 ? noSignalCount + 1 : 0;
  const next = noSignalCount >= 12 ? 'nosignal' : (micState === 'nosignal' ? 'ok' : micState);
  if (next !== micState) { micState = next; updateMicAlert(); }
}
setInterval(checkNoSignal, 1000);

function updateMicAlert() {
  const box = $('micAlert');
  if (!box) return;
  let msg = '', label = '', fn = null;
  if (hasMic) {
    if (micState === 'lost') { msg = '🎙️ O microfone foi desconectado ou parou de responder.'; label = 'Tentar de novo'; fn = () => applyMicSettings(); }
    else if (micTrack && micTrack.muted) { msg = '🎙️ O sistema/aparelho está com o microfone mudo ou bloqueado.'; }
    else if (micState === 'nosignal' && micOn) { msg = '🎙️ O microfone está entregando silêncio total há alguns segundos. Se você estava falando, confira o mudo do aparelho ou troque o dispositivo.'; label = 'Configurações'; fn = openSettings; }
  }
  box.classList.toggle('show', !!msg);
  $('micAlertText').textContent = msg;
  const b = $('micAlertBtn');
  b.style.display = label ? '' : 'none';
  b.textContent = label;
  b.onclick = fn;
}

// ---- Dispositivos de áudio ----
async function refreshDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  let list = [];
  try { list = await navigator.mediaDevices.enumerateDevices(); } catch (e) { return; }
  const ins = list.filter((d) => d.kind === 'audioinput'), outs = list.filter((d) => d.kind === 'audiooutput');
  const cur = (micTrack && micTrack.getSettings && micTrack.getSettings().deviceId) || prefs.micDevice || 'default';
  const fill = (sel, devs, val, what) => {
    sel.textContent = '';
    devs.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || (what + ' ' + (i + 1)); sel.appendChild(o); });
    if ([...sel.options].some((o) => o.value === val)) sel.value = val;
  };
  fill($('setMicDevice'), ins, cur, 'Microfone');
  fill($('setOutDevice'), outs, prefs.outDevice || 'default', 'Saída');
  $('outDeviceRow').style.display = (HTMLMediaElement.prototype.setSinkId && outs.length) ? '' : 'none';
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    refreshDevices();
    if (hasMic && (micState === 'lost' || (micTrack && micTrack.readyState === 'ended'))) applyMicSettings(); // plugou de volta: recupera sozinho
  });
}
function applySink(media) {
  if (prefs.outDevice && media && media.setSinkId) media.setSinkId(prefs.outDevice).catch(() => {});
}
function applySinkAll() {
  document.querySelectorAll('.tile video').forEach(applySink);
  if (monitorAudio) applySink(monitorAudio);
}

// ---- Teste do microfone: ouvir a si mesmo (processado ou original) ----
function disconnectMonitor() {
  try { if (micTap && monitorGain) micTap.disconnect(monitorGain); } catch (e) {}
  try { if (micSourceNode && monitorGain) micSourceNode.disconnect(monitorGain); } catch (e) {}
  try { if (monitorGain) monitorGain.disconnect(); } catch (e) {}
  if (monitorAudio) { try { monitorAudio.pause(); } catch (e) {} monitorAudio.srcObject = null; }
  monitorGain = monitorDest = null;
}
function connectMonitor() {
  disconnectMonitor();
  const src = monitorSrc === 'raw' ? micSourceNode : micTap;
  if (!src) return;
  const ctx = getAudioCtx();
  monitorDest = ctx.createMediaStreamDestination();
  monitorGain = ctx.createGain();
  src.connect(monitorGain); monitorGain.connect(monitorDest);
  if (!monitorAudio) { monitorAudio = new Audio(); monitorAudio.autoplay = true; }
  monitorAudio.srcObject = monitorDest.stream;
  applySink(monitorAudio);
  monitorAudio.play().catch(() => {});
}
function toggleMonitor(force) {
  monitorOn = typeof force === 'boolean' ? force : !monitorOn;
  if (monitorOn && !hasMic) { monitorOn = false; toast('Ative o microfone primeiro.'); }
  if (monitorOn) connectMonitor(); else disconnectMonitor();
  $('monitorBtn').textContent = monitorOn ? 'Parar' : 'Testar';
  $('monitorBtn').classList.toggle('on', monitorOn);
  $('monitorSrcRow').style.display = monitorOn ? '' : 'none';
}

// ---- Avisos discretos (entrada/saída etc.) ----
function notify(msg, important) {
  if (!prefs.notices && !important) return;
  const box = $('notices');
  const d = document.createElement('div');
  d.className = 'notice';
  d.textContent = msg;
  box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), 3500);
}
