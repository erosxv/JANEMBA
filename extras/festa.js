// Extras do CallZinha: sons, roleta, dado, moeda e enquete.
// Este arquivo só é baixado quando alguém abre o ✨ Extras, usa um comando / no chat ou recebe um extra de outra pessoa.
// Quem sorteia é quem clicou: o resultado vai pronto na mensagem, então todo mundo vê a mesma coisa.
(function () {
  'use strict';

  const CSS = `
  .fx-panel { position: fixed; top: 60px; right: 12px; width: min(360px, calc(100vw - 24px)); max-height: calc(100dvh - 130px); overflow-y: auto; padding: 10px; border-radius: 14px; border: 1px solid #2a2e37; background: #1a1d24; box-shadow: 0 12px 32px rgba(0,0,0,.45); color: #eaeaea; font-size: 13px; animation: fxIn .14s ease-out; }
  .fx-panel[hidden] { display: none; }
  body.theater-open .fx-panel { background: rgba(20,22,28,.94); }
  @keyframes fxIn { from { opacity: 0; transform: translateY(-6px); } }
  .fx-head { display: flex; align-items: center; gap: 6px; padding: 0 2px 8px; color: #9aa0a6; }
  .fx-head b { flex: 1; color: #eaeaea; font-size: 14px; font-weight: 600; }
  .fx-head button { background: none; color: #9aa0a6; padding: 2px 6px; font-size: 16px; line-height: 1; }
  .fx-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .fx-tile { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 4px 10px; border-radius: 11px; border: 1px solid #2a2e37; background: #22252d; color: #eaeaea; font-size: 12px; font-weight: 500; }
  .fx-tile:hover, .fx-tile:focus-visible { background: #2a2e38; border-color: #3a4050; outline: none; opacity: 1; }
  .fx-tile .em { font-size: 24px; line-height: 1; }
  .fx-tile small { color: #7b818a; font-size: 10.5px; font-weight: 400; }
  .fx-hint { margin-top: 8px; color: #7b818a; font-size: 11px; text-align: center; }
  .fx-hint code { color: #c9b8ff; }
  .fx-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; color: #9aa0a6; font-size: 12px; }
  .fx-form { display: flex; flex-direction: column; gap: 6px; }
  .fx-form input[type=text] { padding: 8px 10px; border-radius: 9px; border: 1px solid #2a2e37; background: #0f1115; color: #eaeaea; font-size: 13px; min-width: 0; }
  .fx-form .fx-actions { display: flex; gap: 6px; margin-top: 2px; }
  .fx-btn { padding: 8px 12px; border-radius: 9px; background: #5b8cff; color: #fff; font-size: 13px; font-weight: 600; }
  .fx-btn.ghost { background: #22252d; color: #c9cdd3; border: 1px solid #2a2e37; font-weight: 500; }
  .fx-card { position: fixed; left: 50%; top: 22%; transform: translateX(-50%); min-width: 220px; max-width: calc(100vw - 32px); padding: 16px 22px; border-radius: 16px; border: 1px solid #3a3456; background: rgba(22,20,34,.95); box-shadow: 0 16px 40px rgba(0,0,0,.5); text-align: center; color: #eaeaea; animation: fxPop .25s ease-out; cursor: pointer; }
  .fx-card.out { animation: fxOut .3s ease-in forwards; }
  @keyframes fxPop { from { opacity: 0; transform: translate(-50%, -8px) scale(.9); } }
  @keyframes fxOut { to { opacity: 0; transform: translate(-50%, -8px) scale(.95); } }
  .fx-card .ttl { color: #a99bd6; font-size: 12px; margin-bottom: 6px; }
  .fx-card .big { font-size: 44px; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
  .fx-card .big.name { font-size: 28px; }
  .fx-card .sub { margin-top: 6px; color: #c9cdd3; font-size: 13px; }
  .fx-card .big.spin { animation: fxTumble .9s ease-out; }
  @keyframes fxTumble { 0% { transform: rotate(0) scale(.6); } 70% { transform: rotate(560deg) scale(1.1); } 100% { transform: rotate(720deg) scale(1); } }
  .fx-card .big.flip { animation: fxFlip .9s ease-out; }
  @keyframes fxFlip { 0% { transform: rotateY(0) scale(.7); } 100% { transform: rotateY(1440deg) scale(1); } }
  .fx-card .big.win { color: #3ddc97; animation: fxWin .5s ease-out; }
  @keyframes fxWin { 50% { transform: scale(1.18); } }
  .fx-poll { position: fixed; top: 64px; right: 14px; width: min(280px, calc(100vw - 28px)); padding: 12px; border-radius: 14px; border: 1px solid #2a2e37; background: rgba(26,29,36,.97); box-shadow: 0 12px 32px rgba(0,0,0,.45); color: #eaeaea; font-size: 13px; animation: fxPop2 .2s ease-out; }
  @keyframes fxPop2 { from { opacity: 0; transform: translateY(-6px); } }
  .fx-poll .q { display: flex; gap: 6px; align-items: flex-start; font-weight: 600; font-size: 14px; margin-bottom: 8px; overflow-wrap: anywhere; }
  .fx-poll .q span { flex: 1; }
  .fx-poll .q button { background: none; color: #9aa0a6; padding: 0 4px; font-size: 16px; line-height: 1; }
  .fx-opt { position: relative; display: flex; justify-content: space-between; gap: 8px; width: 100%; margin-top: 5px; padding: 8px 10px; border-radius: 9px; border: 1px solid #2a2e37; background: #1d2027; color: #eaeaea; font-size: 13px; text-align: left; overflow: hidden; }
  .fx-opt .bar { position: absolute; inset: 0 auto 0 0; background: rgba(91,140,255,.22); transition: width .3s ease; }
  .fx-opt.mine { border-color: #5b8cff; }
  .fx-opt.top .bar { background: rgba(61,220,151,.22); }
  .fx-opt span { position: relative; overflow-wrap: anywhere; }
  .fx-opt b { position: relative; color: #9aa0a6; font-weight: 600; }
  .fx-poll .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: #7b818a; font-size: 11px; }
  .fx-poll .foot button { background: none; color: #ff8a8d; font-size: 11px; padding: 2px 4px; }
  .fx-poll.ended .fx-opt { cursor: default; }
  body.v-live:not(.theater-open) .fx-poll { top: 10px; }
  .fx-sec { display: flex; align-items: center; gap: 6px; margin: 10px 2px 6px; color: #9aa0a6; font-size: 12px; font-weight: 600; }
  .fx-sec:first-of-type { margin-top: 2px; }
  .fx-sb { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .fx-sbtn { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; padding: 10px 6px; border-radius: 9px; border: 1px solid #2a2e37; background: #22252d; color: #eaeaea; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .fx-panel.fx-wide { width: min(470px, calc(100vw - 24px)); }
  .fx-sbtn span:last-child { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; line-height: 1.2; }
  .fx-sbtn .em { font-size: 16px; line-height: 1; flex: none; }
  .fx-sbtn:hover, .fx-sbtn:focus-visible { background: #2a2e38; border-color: #3a4050; outline: none; opacity: 1; }
  .fx-sbtn.playing { border-color: #3ddc97; box-shadow: inset 0 0 0 1px #3ddc97; }
  .fx-sec span { flex: 1; }
  .fx-sbtn { position: relative; }
  .fx-key { position: absolute; top: 2px; right: 3px; padding: 0 4px; border-radius: 4px; background: #33384a; color: #c9cdd3; font: 600 9px/14px ui-monospace, monospace; text-transform: none; }
  .fx-key.off { text-decoration: line-through; color: #ff8a8d; }
  .fx-global { margin: 0 2px 8px; align-items: flex-start; text-align: left; line-height: 1.35; }
  .fx-global input { margin-top: 2px; flex: none; }
  .fx-sbtn.bind { border-style: dashed; border-color: #5b8cff; }
  .fx-keysbtn { width: 100%; margin-top: 8px; }
  .fx-bindhint { text-align: left; margin: 2px 2px 6px; color: #9fb4ff; }
  .fx-edit { background: none; color: #9aa0a6; font-size: 11.5px; padding: 2px 6px; border-radius: 6px; }
  .fx-edit:hover { color: #eaeaea; }
  .fx-sbtn.add { border-style: dashed; color: #9aa0a6; text-transform: none; }
  .fx-sbtn.del { border-color: #7a3a3d; background: #2a1d20; }
  .fx-sbtn.del::after { content: '✕'; color: #ff8a8d; font-size: 12px; flex: none; }
  .fx-vol { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: #9aa0a6; font-size: 12px; }
  .fx-vol input[type=range] { flex: 1; min-width: 0; }
  #extrasBtn.loading .ic { animation: fxPulse .8s ease-in-out infinite; }
  @keyframes fxPulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .fx-card, .fx-card .big, .fx-panel, .fx-poll { animation: none !important; } }
  `;

  // ---------------- sons (gerados na hora, nenhum arquivo de áudio) ----------------
  const SOUNDS = [
    { id: 'aplausos', em: '👏', name: 'Aplausos' },
    { id: 'tss', em: '🥁', name: 'Ba dum tss' },
    { id: 'buzina', em: '📯', name: 'Buzina' },
    { id: 'grilos', em: '🦗', name: 'Grilos' },
    { id: 'triste', em: '🎺', name: 'Trombone triste' },
    { id: 'tada', em: '🎉', name: 'Tcharam' },
  ];
  let noiseBuf = null;
  function noise(ctx) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; return n;
  }
  function env(ctx, g, t, peak, a, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(ctx, out, type, f0, f1, t, dur, peak) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(ctx, g, t, peak, 0.01, dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function burst(ctx, out, t, dur, peak, type, freq, q) {
    const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    env(ctx, g, t, peak, 0.003, dur);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  }
  const SYNTH = {
    aplausos(ctx, out, t) {
      for (let i = 0; i < 70; i++) {
        const at = t + Math.pow(Math.random(), 1.4) * 1.9;
        burst(ctx, out, at, 0.04 + Math.random() * 0.04, 0.5 + Math.random() * 0.4, 'bandpass', 900 + Math.random() * 1800, 1.2);
      }
    },
    tss(ctx, out, t) {
      tone(ctx, out, 'sine', 180, 80, t, 0.18, 0.9);
      tone(ctx, out, 'sine', 140, 65, t + 0.2, 0.22, 0.9);
      burst(ctx, out, t + 0.46, 0.9, 0.5, 'highpass', 6500);
      tone(ctx, out, 'sine', 100, 50, t + 0.46, 0.25, 0.7);
    },
    buzina(ctx, out, t) {
      [0, 0.32].forEach((d) => {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(out);
        tone(ctx, f, 'sawtooth', 415, 0, t + d, 0.26, 0.35);
        tone(ctx, f, 'sawtooth', 523, 0, t + d, 0.26, 0.3);
      });
    },
    grilos(ctx, out, t) {
      for (let c = 0; c < 4; c++) for (let p = 0; p < 4; p++) tone(ctx, out, 'sine', 4400, 0, t + c * 0.45 + p * 0.045, 0.03, 0.12);
    },
    triste(ctx, out, t) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; f.connect(out);
      [[392, 0, 0.42], [370, 0.45, 0.42], [349, 0.9, 0.42]].forEach(([hz, d, dur]) => tone(ctx, f, 'sawtooth', hz, 0, t + d, dur, 0.3));
      const o = tone(ctx, f, 'sawtooth', 330, 0, t + 1.35, 1.3, 0.3);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 6; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t + 1.6); lfo.stop(t + 2.7);
    },
    tada(ctx, out, t) {
      [523, 659, 784].forEach((hz, i) => tone(ctx, out, 'triangle', hz, 0, t + i * 0.09, 0.16, 0.35));
      [523, 659, 784, 1047].forEach((hz) => tone(ctx, out, 'triangle', hz, 0, t + 0.3, 1.0, 0.22));
    },
  };
  // ---------------- soundboard (arquivos de áudio em sons/, listados em sons/sons.json) ----------------
  // A lista vem primeiro do site: assim um som novo aparece até para quem usa o app de PC/Android sem atualizar.
  // Cada pessoa toca o arquivo no próprio aparelho (ninguém transmite o som pelo microfone).
  const SITE = 'https://erosxv.github.io/JANEMBA/';
  const SB_BASES = location.href.startsWith(SITE) ? ['sons/'] : [SITE + 'sons/', 'sons/'];
  const SB_MAX_S = 15;          // som comprido para sozinho depois disso
  let fileSounds = null;        // Promise<[{ id, name, em, url }]>
  function loadFileSounds() {
    if (!fileSounds) {
      fileSounds = (async () => {
        for (const base of SB_BASES) {
          try {
            const r = await fetch(base + 'sons.json', { cache: 'no-cache' });
            if (!r.ok) continue;
            const list = await r.json();
            return list.filter((x) => x && /^[a-z0-9-]{1,30}$/.test(x.id) && typeof x.arquivo === 'string' && !/[\\/]/.test(x.arquivo))
              .map((x) => ({ id: x.id, name: String(x.nome || x.id).slice(0, 24), em: String(x.emoji || '🔊').slice(0, 4), url: base + encodeURIComponent(x.arquivo) }));
          } catch (e) {}
        }
        return [];
      })();
      fileSounds.then((l) => { if (!l.length) fileSounds = null; });
    }
    return fileSounds;
  }
  const buffers = {};           // id -> Promise<AudioBuffer>
  const playing = new Set();    // fontes tocando agora (para o botão Parar)
  function fileBuffer(ctx, s) {
    if (!buffers[s.id]) {
      buffers[s.id] = fetch(s.url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((b) => new Promise((ok, fail) => ctx.decodeAudioData(b, ok, fail)));
      buffers[s.id].catch(() => { delete buffers[s.id]; });
    }
    return buffers[s.id];
  }
  async function findSound(id) {
    const syn = SOUNDS.find((x) => x.id === id);
    if (syn) return syn;
    const mine = mySounds().find((x) => x.id === id);
    if (mine) return mine;
    return (await loadFileSounds()).find((x) => x.id === id) || null;
  }

  // ---------------- meus sons: adicionados por link, guardados só neste aparelho ----------------
  // Quem toca manda o link junto na mensagem, e cada pessoa baixa e toca aquele link no próprio aparelho.
  const MY_KEY = 'callzinha.fx.meus', MY_MAX = 60;
  function mySounds() {
    try {
      const l = JSON.parse(localStorage.getItem(MY_KEY) || '[]');
      return Array.isArray(l) ? l.filter((s) => s && /^u-[a-z0-9]+$/.test(s.id) && s.url).map((s) => ({ id: s.id, name: s.name, em: s.em, url: s.url, mine: true })) : [];
    }
    catch (e) { return []; }
  }
  function emoji(t) { return Array.from(String(t || '').trim()).slice(0, 3).join(''); }
  function nameFromUrl(url) {
    try { const f = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[-_]+/g, ' ').trim(); return f.slice(0, 24) || 'Som'; }
    catch (e) { return 'Som'; }
  }
  function saveMySounds(l) { try { localStorage.setItem(MY_KEY, JSON.stringify(l)); return true; } catch (e) { return false; } }
  // link de compartilhamento (Google Drive, Dropbox) → link direto do arquivo; só https
  function directUrl(raw) {
    let u; try { u = new URL(String(raw).trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    const drive = /^\/file\/d\/([\w-]+)/.exec(u.pathname);
    if (/(^|\.)drive\.google\.com$/.test(u.hostname) && (drive || u.searchParams.get('id'))) return 'https://drive.google.com/uc?export=download&id=' + (drive ? drive[1] : u.searchParams.get('id'));
    if (/(^|\.)dropbox\.com$/.test(u.hostname)) { u.searchParams.delete('dl'); u.searchParams.set('raw', '1'); }
    const s = u.toString();
    return s.length <= 600 ? s : null;
  }
  // confere se o link toca: resolve com a duração em segundos
  function probeUrl(url) {
    return new Promise((ok, fail) => {
      const a = new Audio(); a.preload = 'metadata';
      const t = setTimeout(() => { fail(new Error('demorou')); a.removeAttribute('src'); }, 12000);
      a.onloadedmetadata = () => { clearTimeout(t); ok(a.duration); a.removeAttribute('src'); };
      a.onerror = () => { clearTimeout(t); fail(new Error('não toca')); };
      a.src = url;
    });
  }
  // Baixa e toca pelo áudio do app quando o site deixa (o iPhone exige isso para tocar sem toque na tela);
  // se o site não deixa baixar (CORS), toca o link direto num <audio>.
  const urlBuffers = {};   // link -> Promise<AudioBuffer>
  async function playUrl(api, id, url) {
    if (muted()) return;
    const ctx = api.getAudioCtx();
    try {
      if (!ctx) throw new Error('sem áudio');
      if (!urlBuffers[url]) {
        urlBuffers[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((b) => new Promise((ok, fail) => ctx.decodeAudioData(b, ok, fail)));
        urlBuffers[url].catch(() => {});
      }
      playBuffer(ctx, id, await urlBuffers[url]);
    } catch (e) {
      const a = new Audio(url); a.volume = volume();
      const item = { _id: id, _vol: (v) => { a.volume = v; }, stop: () => { try { a.pause(); } catch (e2) {} done(); } };
      const cut = setTimeout(() => item.stop(), SB_MAX_S * 1000);
      const done = () => { if (!playing.delete(item)) return; clearTimeout(cut); markPlaying(); };
      a.onended = done; a.onerror = done;
      playing.add(item); markPlaying();
      a.play().catch(done);
    }
  }
  function playBuffer(ctx, id, buf) {
    const out = ctx.createGain(); out.gain.value = volume(); out.connect(ctx.destination);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(out);
    src._id = id; src._vol = (v) => { out.gain.value = v; }; playing.add(src); markPlaying();
    src.onended = () => { playing.delete(src); markPlaying(); try { out.disconnect(); } catch (e) {} };
    src.start(); src.stop(ctx.currentTime + SB_MAX_S);
  }

  async function playSound(api, id) {
    if (muted()) return;
    try {
      const ctx = api.getAudioCtx(); if (!ctx) return;
      if (SYNTH[id]) {
        const out = ctx.createGain(); out.gain.value = 0.44 * volume(); out.connect(ctx.destination);
        SYNTH[id](ctx, out, ctx.currentTime + 0.02);
        setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 4000);
        return;
      }
      const s = await findSound(id); if (!s) return;
      if (s.mine) { playUrl(api, id, s.url); return; }
      playBuffer(ctx, id, await fileBuffer(ctx, s));
    } catch (e) {}
  }
  function stopSounds() { playing.forEach((src) => { try { src.stop(); } catch (e) {} }); }
  function markPlaying() {
    const on = new Set([...playing].map((x) => x._id));
    document.querySelectorAll('.fx-sbtn[data-id]').forEach((b) => b.classList.toggle('playing', on.has(b.dataset.id)));
  }
  function muted() { try { return localStorage.getItem('callzinha.fx.mute') === '1'; } catch (e) { return false; } }
  function setMuted(v) { try { localStorage.setItem('callzinha.fx.mute', v ? '1' : '0'); } catch (e) {} }
  function volume() { try { const v = localStorage.getItem('callzinha.fx.vol'); return v === null ? 0.5 : Math.min(1, Math.max(0, Number(v) || 0)); } catch (e) { return 0.5; } }
  function setVolume(v) {
    try { localStorage.setItem('callzinha.fx.vol', String(v)); } catch (e) {}
    playing.forEach((p) => { try { p._vol(v); } catch (e) {} });   // muda também o que já está tocando
  }
  // os que eu mais toco (só neste aparelho), para a seção "Usados com frequência"
  function usage() { try { return JSON.parse(localStorage.getItem('callzinha.fx.uso') || '{}') || {}; } catch (e) { return {}; } }
  function countUse(id) { try { const u = usage(); u[id] = (u[id] || 0) + 1; localStorage.setItem('callzinha.fx.uso', JSON.stringify(u)); } catch (e) {} }

  // ---------------- utilidades ----------------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function rnd(n) {   // inteiro de 0 a n-1, sem viés
    try { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; }
    catch (e) { return Math.floor(Math.random() * n); }
  }
  function uid() { return Date.now().toString(36) + rnd(1e6).toString(36); }

  function init(api) {
    const style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    const lastFrom = {};   // segura repetição de som de uma mesma pessoa
    let lastSend = 0;
    let card = null, cardTimer = null, spinTimer = null;
    let poll = null;       // { id, by, byName, q, o:[], votes:{voterId:idx}, ended, el }

    // ---------------- painel ----------------
    const panel = el('div', 'fx-panel'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Extras');
    api.layer().appendChild(panel);

    function head(title, back) {
      const h = el('div', 'fx-head');
      if (back) { const b = el('button', '', '‹'); b.title = 'Voltar'; b.onclick = home; h.appendChild(b); }
      h.appendChild(el('b', '', title));
      const x = el('button', '', '×'); x.title = 'Fechar (Esc)'; x.onclick = () => toggle(false); h.appendChild(x);
      return h;
    }
    function tile(em, label, sub, fn) {
      const b = el('button', 'fx-tile'); b.append(el('span', 'em', em), el('span', '', label));
      if (sub) b.append(el('small', '', sub));
      b.onclick = fn; return b;
    }
    function home() {
      panel.classList.remove('fx-wide');
      panel.replaceChildren(head('✨ Extras'));
      const g = el('div', 'fx-grid');
      g.append(
        tile('🔊', 'Sons', 'todos ouvem', sounds),
        tile('🎡', 'Roleta', 'sorteia alguém', () => { toggle(false); roleta(''); }),
        tile('🎲', 'Dado', '1 a 6', () => { toggle(false); dado(''); }),
        tile('🪙', 'Moeda', 'cara ou coroa', () => { toggle(false); moeda(); }),
        tile('📊', 'Enquete', 'votação rápida', pollForm),
        tile('❔', 'Comandos', 'pelo chat', help),
      );
      panel.append(g);
      const h = el('div', 'fx-hint'); h.append('Dica: no chat, digite ', el('code', '', '/ajuda'));
      panel.append(h);
    }
    let editing = false;   // modo "Editar" dos meus sons: tocar no botão pergunta se quer excluir
    let binding = false;   // modo "Atalhos": tocar no botão e apertar uma tecla
    const keyOf = (id) => Object.keys(api.soundKeys()).find((k) => api.soundKeys()[k] === id) || '';
    function sbtn(s) {
      const b = el('button', 'fx-sbtn'); b.dataset.id = s.id; b.title = s.name + ' (todos ouvem)';
      b.append(el('span', 'em', s.em), el('span', '', s.name));
      const k = keyOf(s.id);
      if (k) {
        const kb = el('kbd', 'fx-key', api.shortcutLabel(k)); b.append(kb); b.title += ' · tecla ' + api.shortcutLabel(k);
        // app de PC: tecla que não deu para registrar no sistema só vale com a janela na frente
        if (api.pcApp && api.soundKeysGlobal() && !api.isGlobalKey(k)) { kb.classList.add('off'); b.title += ' (só com o CallZinha na frente)'; }
      }
      if (binding) { b.classList.add('bind'); b.onclick = () => captureKey(s, b); return b; }
      if (editing && s.mine) {
        b.classList.add('del'); b.title = 'Excluir ' + s.name;
        b.onclick = () => {
          if (!confirm('Excluir o som "' + s.name + '"?')) return;
          saveMySounds(mySounds().filter((x) => x.id !== s.id));
          sounds();
        };
      } else b.onclick = () => som(s.id);
      return b;
    }
    async function sounds() {
      panel.classList.add('fx-wide');
      panel.replaceChildren(head('🔊 Sons', true));
      const files = await loadFileSounds();
      if (panel.hidden) return;
      panel.replaceChildren(head('🔊 Sons', true));
      const mine = mySounds();
      if (!mine.length) editing = false;
      if (binding) {
        panel.append(el('div', 'fx-hint fx-bindhint', 'Toque num som e aperte a tecla (pode usar Ctrl, Alt ou Shift junto). Esc cancela, Backspace apaga o atalho.' +
          (api.pcApp ? '' : ' Só funciona com o CallZinha na frente; no app de PC funciona até jogando.')));
        if (api.pcApp) {
          const g = el('label', 'fx-row fx-global'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = api.soundKeysGlobal();
          cb.onchange = () => api.setSoundKeysGlobal(cb.checked).then(sounds);
          g.append(el('span', '', 'Funcionar em segundo plano (jogando). A tecla para de digitar em outros programas durante a call: prefira F1–F12, teclado numérico ou Ctrl/Alt + tecla. Tecla riscada = só com o CallZinha na frente.'), cb);
          panel.append(g);
        }
      }
      const all = mine.concat(files, SOUNDS);
      const u = usage();
      const top = editing || binding ? [] : all.filter((s) => u[s.id]).sort((a, b) => u[b.id] - u[a.id]).slice(0, 3);
      const section = (title, list, extra) => {
        if (!list.length && !extra) return;
        const h = el('div', 'fx-sec'); h.append(el('span', '', title));
        if (extra && extra.head) h.append(extra.head);
        panel.append(h);
        const g = el('div', 'fx-sb'); list.forEach((s) => g.append(sbtn(s)));
        if (extra && extra.tile) g.append(extra.tile);
        panel.append(g);
      };
      section('🕘 Usados com frequência', top);
      const add = el('button', 'fx-sbtn add'); add.append(el('span', 'em', '＋'), el('span', '', 'Adicionar'));
      add.title = 'Adicionar um som pelo link'; add.onclick = addForm;
      const ed = el('button', 'fx-edit', editing ? 'Pronto' : 'Editar'); ed.type = 'button'; ed.hidden = !mine.length || binding;
      ed.onclick = () => { editing = !editing; binding = false; sounds(); };
      if (mine.length || !binding) section('⭐ Meus sons', mine, { head: ed, tile: editing || binding ? null : add });
      if (editing) panel.append(el('div', 'fx-hint', 'Toque no som que quer excluir.'));
      section('🔊 Soundboard', files);
      section('✨ Sons do app', SOUNDS);
      markPlaying();
      const v = el('div', 'fx-vol'); const rg = el('input'); rg.type = 'range'; rg.min = 0; rg.max = 100; rg.value = Math.round(volume() * 100);
      rg.setAttribute('aria-label', 'Volume dos sons'); rg.oninput = () => setVolume(rg.value / 100);
      const stop = el('button', 'fx-btn ghost', '⏹ Parar'); stop.type = 'button'; stop.title = 'Para os sons tocando agora (só para mim)'; stop.onclick = stopSounds;
      v.append(el('span', '', 'Volume'), rg, stop);
      panel.append(v);
      const kb = el('button', 'fx-btn ghost fx-keysbtn', binding ? '✓ Pronto' : '⌨ Atalhos de teclado'); kb.type = 'button';
      kb.onclick = () => { binding = !binding; editing = false; sounds(); };
      panel.append(kb);
      const r = el('label', 'fx-row'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = muted();
      cb.onchange = () => setMuted(cb.checked);
      r.append(el('span', '', 'Silenciar os sons (só para mim)'), cb);
      panel.append(r);
      place();   // o painel ficou mais largo
    }
    // espera a próxima tecla e liga ao som (uma tecla por som; a tecla sai de outro som que a usava)
    function captureKey(s, b) {
      const label = b.querySelector('span:last-of-type');
      label.textContent = 'Aperte uma tecla…';
      api.captureSoundKey(true);
      const MODS = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
      const stop = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onAway, true); api.captureSoundKey(false); };
      const onAway = (e) => { if (!b.contains(e.target)) { stop(); sounds(); } };
      const onKey = (e) => {
        if (MODS.includes(e.code)) return;
        e.preventDefault(); e.stopPropagation();
        if (e.code === 'Escape') { stop(); sounds(); return; }
        const map = api.soundKeys();
        for (const k in map) if (map[k] === s.id) delete map[k];
        if (e.code !== 'Backspace' && e.code !== 'Delete') {
          const k = api.shortcutFromEvent(e), why = api.reservedKey(k);
          if (why) { api.toast('A tecla ' + api.shortcutLabel(k) + ' não dá: ' + why + '.'); return; }   // continua esperando outra tecla
          if (map[k] && map[k] !== s.id) api.toast('A tecla ' + api.shortcutLabel(k) + ' passou para ' + s.name + '.');
          map[k] = s.id;
        }
        stop();
        api.setSoundKeys(map).then(sounds);
      };
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => document.addEventListener('pointerdown', onAway, true), 0);
    }
    function addForm() {
      editing = false; binding = false;
      const h = head('⭐ Adicionar som', true); h.querySelector('button').onclick = sounds;
      panel.replaceChildren(h);
      const f = el('form', 'fx-form');
      const link = el('input'); link.type = 'text'; link.inputMode = 'url'; link.required = true; link.placeholder = 'Link do áudio (.mp3, Google Drive, Dropbox...)';
      const nome = el('input'); nome.type = 'text'; nome.maxLength = 24; nome.placeholder = 'Nome do botão (ex.: ATUMALACA)';
      const emo = el('input'); emo.type = 'text'; emo.maxLength = 8; emo.placeholder = 'Emoji (opcional)';
      const st = el('div', 'fx-hint', 'Use o link que abre direto o arquivo de áudio. O som fica salvo neste aparelho e, quando você toca, todos da sala ouvem.');
      st.style.textAlign = 'left';
      const acts = el('div', 'fx-actions'); const go = el('button', 'fx-btn', 'Adicionar'); go.type = 'submit'; acts.append(go);
      f.append(link, nome, emo, acts, st);
      f.onsubmit = async (e) => {
        e.preventDefault();
        const url = directUrl(link.value);
        if (!url) { st.textContent = 'Esse link não serve: ele precisa começar com https://'; return; }
        if (mySounds().length >= MY_MAX) { st.textContent = 'Você já tem ' + MY_MAX + ' sons. Exclua algum antes.'; return; }
        go.disabled = true; go.textContent = 'Testando o link...';
        let dur = 0;
        try { dur = await probeUrl(url); }
        catch (err) {
          st.textContent = 'Não consegui tocar esse link. Ele precisa abrir direto o arquivo de áudio (um .mp3, por exemplo), e não uma página com o som dentro.';
          go.disabled = false; go.textContent = 'Adicionar'; return;
        }
        const name = api.cleanText(nome.value).slice(0, 24) || nameFromUrl(url);
        const em = emoji(emo.value) || '🔊';
        const l = mySounds().map((x) => ({ id: x.id, name: x.name, em: x.em, url: x.url }));
        l.push({ id: 'u-' + uid(), name, em, url });
        if (!saveMySounds(l)) { st.textContent = 'Não deu para salvar neste aparelho.'; go.disabled = false; go.textContent = 'Adicionar'; return; }
        api.toast(em + ' ' + name + ' adicionado' + (dur > SB_MAX_S ? ' (toca só os primeiros ' + SB_MAX_S + ' s)' : ''));
        sounds();
      };
      panel.append(f);
      setTimeout(() => link.focus(), 0);
    }
    function pollForm() {
      panel.replaceChildren(head('📊 Nova enquete', true));
      const f = el('form', 'fx-form');
      const q = el('input'); q.type = 'text'; q.maxLength = 120; q.placeholder = 'Pergunta (ex.: Pizza ou hambúrguer?)'; q.required = true;
      f.append(q);
      const opts = [];
      const addOpt = (v) => { const i = el('input'); i.type = 'text'; i.maxLength = 40; i.placeholder = 'Opção ' + (opts.length + 1); i.value = v || ''; opts.push(i); f.insertBefore(i, acts); };
      const acts = el('div', 'fx-actions');
      const more = el('button', 'fx-btn ghost', '+ opção'); more.type = 'button';
      more.onclick = () => { if (opts.length < 6) addOpt(); if (opts.length >= 6) more.hidden = true; };
      const go = el('button', 'fx-btn', 'Criar enquete'); go.type = 'submit';
      acts.append(more, go); f.append(acts);
      addOpt(); addOpt();
      f.onsubmit = (e) => {
        e.preventDefault();
        const o = opts.map((i) => api.cleanText(i.value).slice(0, 40)).filter(Boolean);
        if (!api.cleanText(q.value)) return;
        toggle(false);
        startPoll(q.value, o.length >= 2 ? o : ['Sim', 'Não']);
      };
      panel.append(f);
      setTimeout(() => q.focus(), 0);
    }
    function help() {
      panel.replaceChildren(head('❔ Comandos do chat', true));
      [['/play work', 'toca uma música pelo nome'], ['/pular', 'pula a música atual'], ['/dado', 'rola um dado (ou /dado 20)'], ['/moeda', 'cara ou coroa'], ['/roleta', 'sorteia alguém da sala'],
       ['/roleta pizza, sushi', 'sorteia entre opções'], ['/enquete Pergunta? A | B', 'abre uma votação'], ['/som aplausos', 'toca um som para todos']]
        .forEach(([c, d]) => { const r = el('div', 'fx-row'); r.style.marginTop = '6px'; r.append(el('code', '', c), el('span', '', d)); r.firstChild.style.color = '#c9b8ff'; panel.append(r); });
      const h = el('div', 'fx-hint', 'Sons: ' + SOUNDS.map((s) => s.id).join(', '));
      panel.append(h);
    }
    function toggle(force) {
      const open = typeof force === 'boolean' ? force : panel.hidden;
      if (open) { api.closeOthers(); home(); }
      panel.hidden = !open;
      if (open) place();
      const b = api.button(); b.classList.toggle('active', open); b.setAttribute('aria-expanded', String(open));
    }
    // abre logo abaixo do botão ✨ (no topo); se o botão não estiver à vista (tela cheia), fica no canto de cima
    function place() {
      const r = api.button().getBoundingClientRect();
      if (!r.width) { panel.style.left = ''; panel.style.right = '12px'; panel.style.top = '60px'; return; }
      const w = panel.offsetWidth;
      const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w));
      panel.style.left = left + 'px'; panel.style.right = 'auto'; panel.style.top = Math.round(r.bottom + 8) + 'px';
    }
    window.addEventListener('resize', () => { if (!panel.hidden) place(); });
    document.addEventListener('pointerdown', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !api.button().contains(e.target)) toggle(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); } });

    // ---------------- envio ----------------
    function canSend() {
      const now = Date.now();
      if (now - lastSend < 900) { api.toast('Calma, um de cada vez 🙂'); return false; }
      lastSend = now; return true;
    }

    async function som(id) {
      const s = await findSound(id);
      if (!s) { const l = (await loadFileSounds()).concat(SOUNDS); api.toast('Esse som não existe. Tem: ' + l.map((x) => x.id).join(', ')); return; }
      if (!canSend()) return;
      playSound(api, id);
      countUse(id);
      api.toast(s.em + ' ' + s.name);
      // som meu (por link): vai o link, o nome e o emoji, porque os outros não têm ele salvo
      api.send(s.mine ? { k: 'som', s: id, u: s.url, n: s.name, e: s.em } : { k: 'som', s: id });
    }
    function dado(arg) {
      let sides = parseInt(arg, 10);
      if (!(sides >= 2 && sides <= 100)) sides = 6;
      if (!canSend()) return;
      const n = 1 + rnd(sides);
      showDado(api.myName(), true, sides, n);
      api.send({ k: 'dado', d: sides, n });
    }
    function moeda() {
      if (!canSend()) return;
      const r = rnd(2);
      showMoeda(api.myName(), true, r);
      api.send({ k: 'moeda', r });
    }
    function roleta(arg) {
      let names = arg ? arg.split(/[,|;]/).map((s) => api.cleanName(s)).filter(Boolean) : api.people().map((p) => p.name);
      names = names.slice(0, 16);
      if (names.length < 2) { api.toast(arg ? 'Escreva pelo menos 2 opções: /roleta pizza, sushi' : 'Precisa de pelo menos 2 pessoas na sala (ou use /roleta pizza, sushi)'); return; }
      if (!canSend()) return;
      const w = rnd(names.length);
      showRoleta(api.myName(), true, names, w);
      api.send({ k: 'roleta', names, w });
    }
    function startPoll(q, o) {
      if (!canSend()) return;
      const p = { k: 'poll', id: uid(), q: api.cleanText(q).slice(0, 120), o: o.slice(0, 6) };
      openPoll(api.myId(), api.myName(), true, p);
      api.send(p);
    }

    // ---------------- cartão no meio da tela (dado, moeda, roleta) ----------------
    function showCard(build, ms) {
      clearTimeout(cardTimer); clearInterval(spinTimer);
      if (card) card.remove();
      card = el('div', 'fx-card');
      build(card);
      card.onclick = () => closeCard();
      api.layer().appendChild(card);
      cardTimer = setTimeout(closeCard, ms);
    }
    function closeCard() {
      clearTimeout(cardTimer); clearInterval(spinTimer);
      const c = card; card = null;
      if (!c) return;
      c.classList.add('out'); setTimeout(() => c.remove(), 320);
    }
    function who(name, me) { return me ? 'Você' : name; }

    function showDado(name, me, sides, n) {
      showCard((c) => {
        c.append(el('div', 'ttl', '🎲 ' + who(name, me) + ' rolou um dado' + (sides !== 6 ? ' de ' + sides + ' lados' : '')));
        c.append(el('div', 'big spin', String(n)));
      }, 3800);
      api.sysChat('🎲 ' + who(name, me) + ' tirou ' + n + (sides !== 6 ? ' (d' + sides + ')' : ''));
    }
    function showMoeda(name, me, r) {
      const res = r ? 'Coroa' : 'Cara';
      showCard((c) => {
        c.append(el('div', 'ttl', '🪙 ' + who(name, me) + ' jogou a moeda'));
        c.append(el('div', 'big flip', '🪙'));
        const s = el('div', 'sub', '…'); c.append(s);
        setTimeout(() => { s.textContent = res + '!'; s.style.fontSize = '22px'; s.style.fontWeight = '700'; }, 900);
      }, 3800);
      setTimeout(() => api.sysChat('🪙 ' + who(name, me) + ' jogou a moeda: ' + res), 900);
    }
    function showRoleta(name, me, names, w) {
      showCard((c) => {
        c.append(el('div', 'ttl', '🎡 Roleta de ' + who(name, me).toLowerCase().replace(/^você$/, 'você')));
        const big = el('div', 'big name', names[0]); c.append(big);
        const sub = el('div', 'sub', 'girando…'); c.append(sub);
        // desacelera e para no sorteado (mesmo resultado para todo mundo)
        const total = names.length * 3 + w + 1;
        let i = 0, delay = 50;
        const step = () => {
          big.textContent = names[i % names.length];
          i++;
          if (i >= total) {
            big.classList.add('win'); sub.textContent = '🎉 Sorteado!';
            api.sysChat('🎡 Roleta (' + who(name, me) + '): ' + names[w]);
            return;
          }
          delay = Math.min(delay * 1.1 + 4, 420);
          spinTimer = setTimeout(step, delay);
        };
        step();
      }, 7500);
    }

    // ---------------- enquete ----------------
    function openPoll(by, byName, me, p) {
      if (poll && poll.el) poll.el.remove();
      poll = { id: p.id, by, byName, q: p.q, o: p.o, votes: {}, ended: false, el: el('div', 'fx-poll') };
      api.layer().appendChild(poll.el);
      renderPoll();
      api.sysChat('📊 ' + who(byName, me) + ' abriu uma enquete: ' + p.q);
      if (!me) api.toast('📊 Nova enquete: ' + p.q);
    }
    function tally() {
      const c = poll.o.map(() => 0);
      for (const k in poll.votes) c[poll.votes[k]]++;
      return c;
    }
    function renderPoll() {
      const p = poll, box = p.el;
      box.classList.toggle('ended', p.ended);
      const counts = tally(), total = counts.reduce((a, b) => a + b, 0), max = Math.max(...counts);
      const mine = p.votes[api.myId()];
      const q = el('div', 'q'); q.append(el('span', '', (p.ended ? '✅ ' : '📊 ') + p.q));
      const x = el('button', '', '×'); x.title = 'Esconder'; x.onclick = () => { box.remove(); };
      q.append(x);
      box.replaceChildren(q);
      p.o.forEach((label, i) => {
        const b = el('button', 'fx-opt' + (mine === i ? ' mine' : '') + (total && counts[i] === max ? ' top' : ''));
        const bar = el('span', 'bar'); bar.style.width = total ? Math.round(counts[i] / total * 100) + '%' : '0';
        b.append(bar, el('span', '', label), el('b', '', String(counts[i])));
        b.disabled = p.ended;
        b.onclick = () => vote(i);
        box.append(b);
      });
      const foot = el('div', 'foot');
      foot.append(el('span', '', (p.ended ? 'Encerrada · ' : '') + total + (total === 1 ? ' voto' : ' votos') + ' · de ' + who(p.byName, p.by === api.myId())));
      if (!p.ended && p.by === api.myId()) { const e = el('button', '', 'Encerrar'); e.onclick = endPoll; foot.append(e); }
      box.append(foot);
    }
    function vote(i) {
      if (!poll || poll.ended || poll.votes[api.myId()] === i) return;
      poll.votes[api.myId()] = i;
      renderPoll();
      api.send({ k: 'vote', id: poll.id, o: i });
    }
    function endPoll() {
      if (!poll || poll.ended) return;
      closePoll();
      api.send({ k: 'poll-end', id: poll.id });
    }
    function closePoll() {
      poll.ended = true;
      if (!poll.el.isConnected) api.layer().appendChild(poll.el);
      renderPoll();
      const c = tally(), max = Math.max(...c);
      const win = max ? poll.o.filter((_, i) => c[i] === max).join(' / ') + ' (' + max + ')' : 'ninguém votou';
      api.sysChat('📊 Resultado de "' + poll.q + '": ' + win);
      const box = poll.el; setTimeout(() => { if (poll && poll.el === box && poll.ended) box.remove(); }, 20000);
    }

    // ---------------- comandos do chat ----------------
    function command(cmd, arg) {
      if (cmd === 'ajuda') { toggle(true); help(); }
      else if (cmd === 'dado') dado(arg);
      else if (cmd === 'moeda') moeda();
      else if (cmd === 'roleta') roleta(arg);
      else if (cmd === 'som') { if (arg) som(arg.toLowerCase().split(/\s+/)[0]); else { toggle(true); sounds(); } }
      else if (cmd === 'enquete') {
        if (!arg) { toggle(true); pollForm(); return; }
        const parts = arg.split('|').map((s) => s.trim());
        const q = parts.shift();
        const o = parts.map((s) => api.cleanText(s).slice(0, 40)).filter(Boolean);
        startPoll(q, o.length >= 2 ? o : ['Sim', 'Não']);
      }
    }

    // ---------------- o que chega dos outros ----------------
    function receive(from, m) {
      const name = api.nameOf(from);
      if (m.k === 'som') {
        if (typeof m.s !== 'string') return;
        const now = Date.now(); if (now - (lastFrom[from] || 0) < 700) return; lastFrom[from] = now;
        if (typeof m.u === 'string') {
          if (!/^u-[a-z0-9]{1,30}$/.test(m.s) || directUrl(m.u) !== m.u) return;
          const n = api.cleanText(m.n).slice(0, 24) || 'Som', e = emoji(m.e) || '🔊';
          playUrl(api, m.s, m.u);
          api.toast(e + ' ' + name + ': ' + n);
          return;
        }
        findSound(m.s).then((s) => {
          if (!s) return;
          playSound(api, m.s);
          api.toast(s.em + ' ' + name + ': ' + s.name);
        });
      } else if (m.k === 'dado') {
        const d = m.d, n = m.n;
        if (!Number.isInteger(d) || d < 2 || d > 100 || !Number.isInteger(n) || n < 1 || n > d) return;
        showDado(name, false, d, n);
      } else if (m.k === 'moeda') {
        if (m.r !== 0 && m.r !== 1) return;
        showMoeda(name, false, m.r);
      } else if (m.k === 'roleta') {
        if (!Array.isArray(m.names)) return;
        const names = m.names.slice(0, 16).map((s) => api.cleanName(s)).filter(Boolean);
        if (names.length < 2 || names.length !== m.names.length || !Number.isInteger(m.w) || m.w < 0 || m.w >= names.length) return;
        showRoleta(name, false, names, m.w);
      } else if (m.k === 'poll') {
        if (typeof m.id !== 'string' || !Array.isArray(m.o)) return;
        const q = api.cleanText(m.q).slice(0, 120);
        const o = m.o.slice(0, 6).map((s) => api.cleanText(s).slice(0, 40)).filter(Boolean);
        if (!q || o.length < 2) return;
        openPoll(from, name, false, { id: m.id.slice(0, 24), q, o });
      } else if (m.k === 'vote') {
        if (!poll || poll.ended || m.id !== poll.id || !Number.isInteger(m.o) || m.o < 0 || m.o >= poll.o.length) return;
        poll.votes[from] = m.o;
        if (poll.el.isConnected) renderPoll();
      } else if (m.k === 'poll-end') {
        if (!poll || poll.ended || m.id !== poll.id || from !== poll.by) return;
        closePoll();
      }
    }

    return { toggle, command, receive };
  }

  window.CZFesta = { init };
})();
