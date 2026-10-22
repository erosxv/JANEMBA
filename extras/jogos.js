// Central de jogos do CallZinha (botão 🎮 Jogos).
// Este arquivo só é baixado quando alguém abre os jogos ou recebe uma mensagem de jogo; cada jogo mora no seu próprio arquivo
// (extras/jogo-*.js), baixado só quando aquele jogo começa.
//
// Quem abre o jogo é o "mestre": o navegador dele sorteia, cronometra e conta os pontos, e manda o resultado para todos.
// Mensagens: { type: 'fx', k: 'g', g: <jogo>, s: <sessão>, a: <ação>, d: <dados> }
(function () {
  'use strict';

  const GAMES = [
    { id: 'musica', file: 'jogo-musica', global: 'CZJogoMusica', em: '🎵', name: 'Adivinhe a música', sub: 'quem acerta primeiro', ready: true },
    { id: 'stop', file: 'jogo-stop', global: 'CZJogoStop', em: '🛑', name: 'Stop', sub: 'adedonha clássica', ready: true },
    { id: 'bomba', em: '💣', name: 'Bomba de sílabas', sub: 'em breve' },
    { id: 'desenho', file: 'jogo-desenho', global: 'CZJogoDesenho', em: '✏️', name: 'Desenha e adivinha', sub: 'estilo Gartic', ready: true },
    { id: 'truco', em: '🃏', name: 'Truco', sub: 'em breve' },
  ];

  const CSS = `
  .jg-panel { position: fixed; top: 60px; right: 12px; width: min(360px, calc(100vw - 24px)); padding: 10px; border-radius: 14px; border: 1px solid #2a2e37; background: #1a1d24; box-shadow: 0 12px 32px rgba(0,0,0,.45); color: #eaeaea; font-size: 13px; animation: jgIn .14s ease-out; }
  .jg-panel[hidden] { display: none; }
  @keyframes jgIn { from { opacity: 0; transform: translateY(-6px); } }
  .jg-head { display: flex; align-items: center; gap: 6px; padding: 0 2px 8px; color: #9aa0a6; }
  .jg-head b { flex: 1; color: #eaeaea; font-size: 14px; font-weight: 600; }
  .jg-head button { background: none; color: #9aa0a6; padding: 2px 6px; font-size: 16px; line-height: 1; }
  .jg-list { display: flex; flex-direction: column; gap: 6px; }
  .jg-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border-radius: 11px; border: 1px solid #2a2e37; background: #22252d; color: #eaeaea; text-align: left; font-weight: 500; }
  .jg-item:hover:not(:disabled), .jg-item:focus-visible { background: #2a2e38; border-color: #3a4050; outline: none; opacity: 1; }
  .jg-item:disabled { opacity: .45; cursor: default; }
  .jg-item .em { font-size: 24px; width: 30px; text-align: center; }
  .jg-item span { display: flex; flex-direction: column; gap: 1px; }
  .jg-item small { color: #7b818a; font-size: 11px; font-weight: 400; }
  .jg-item.live { border-color: #3ddc97; }
  .jg-win { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); width: min(640px, calc(100vw - 20px)); max-height: calc(100dvh - 160px); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid #2f3540; background: #15181e; box-shadow: 0 18px 48px rgba(0,0,0,.55); color: #eaeaea; font-size: 14px; animation: jgIn .18s ease-out; }
  .jg-win.min { display: none; }
  .jg-wh { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #262b34; }
  .jg-wh b { flex: 1; font-size: 15px; }
  .jg-wh small { color: #7b818a; font-weight: 400; font-size: 12px; margin-left: 6px; }
  .jg-wh button { background: none; color: #9aa0a6; padding: 2px 8px; font-size: 18px; line-height: 1; }
  .jg-body { padding: 14px; overflow-y: auto; }
  .jg-pill { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); padding: 7px 14px; border-radius: 999px; border: 1px solid #3ddc97; background: rgba(21,24,30,.96); color: #eaeaea; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
  .jg-pill[hidden] { display: none; }
  .jg-btn { padding: 9px 14px; border-radius: 10px; background: #3ddc97; color: #06140d; font-size: 14px; font-weight: 700; }
  .jg-btn:disabled { opacity: .4; cursor: default; }
  .jg-btn.ghost { background: #22252d; color: #c9cdd3; border: 1px solid #2a2e37; font-weight: 500; }
  .jg-btn.blue { background: #5b8cff; color: #fff; }
  .jg-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .jg-muted { color: #8a919b; font-size: 12.5px; }
  .jg-center { text-align: center; }
  .jg-big { font-size: 40px; font-weight: 800; line-height: 1.1; }
  .jg-input { flex: 1; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid #2a2e37; background: #0f1115; color: #eaeaea; font-size: 15px; }
  .jg-input:focus { outline: none; border-color: #5b8cff; }
  .jg-select { padding: 8px 10px; border-radius: 9px; border: 1px solid #2a2e37; background: #0f1115; color: #eaeaea; font-size: 13px; }
  .jg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .jg-chip { padding: 6px 10px; border-radius: 999px; border: 1px solid #2a2e37; background: #1d2027; color: #c9cdd3; font-size: 12.5px; font-weight: 500; }
  .jg-chip.on { border-color: #3ddc97; background: rgba(61,220,151,.14); color: #eaeaea; }
  .jg-bar { height: 6px; border-radius: 3px; background: #262b34; overflow: hidden; }
  .jg-bar i { display: block; height: 100%; background: linear-gradient(90deg, #3ddc97, #f5c000); transition: width .25s linear; }
  .jg-score { display: flex; flex-direction: column; gap: 4px; }
  .jg-score div { display: flex; justify-content: space-between; gap: 8px; padding: 6px 10px; border-radius: 9px; background: #1b1f26; }
  .jg-score div.me { outline: 1px solid #5b8cff; }
  .jg-score b { color: #f5c000; }
  .jg-podium { display: flex; justify-content: center; align-items: flex-end; gap: 10px; margin: 8px 0 14px; }
  .jg-podium > div { width: 30%; max-width: 140px; border-radius: 12px 12px 4px 4px; background: #1d2128; padding: 10px 6px; text-align: center; overflow-wrap: anywhere; }
  .jg-podium .p1 { min-height: 120px; border: 1px solid #f5c000; }
  .jg-podium .p2 { min-height: 90px; }
  .jg-podium .p3 { min-height: 70px; }
  .jg-podium .em { font-size: 26px; }
  .jg-feed { display: flex; flex-direction: column; gap: 3px; max-height: 120px; overflow-y: auto; font-size: 13px; }
  @media (max-width: 520px) { .jg-win { top: 56px; max-height: calc(100dvh - 140px); } .jg-big { font-size: 32px; } }
  `;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function rnd(n) {
    try { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; }
    catch (e) { return Math.floor(Math.random() * n); }
  }
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // "Não é?" -> "nao e" (para comparar respostas sem acento, maiúscula ou pontuação)
  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function init(api) {
    const style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    const modules = {};   // jogo -> Promise(módulo)
    let session = null;   // { g, s, master, mod, ctx, win, body, pill, title }

    // ---------------- painel (lista de jogos) ----------------
    const panel = el('div', 'jg-panel'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Jogos');
    api.layer().appendChild(panel);
    function renderPanel() {
      const h = el('div', 'jg-head'); h.append(el('b', '', '🎮 Jogos'));
      const x = el('button', '', '×'); x.title = 'Fechar'; x.onclick = () => toggle(false); h.append(x);
      const list = el('div', 'jg-list');
      GAMES.forEach((g) => {
        const live = session && session.g === g.id;
        const b = el('button', 'jg-item' + (live ? ' live' : ''));
        const tx = el('span'); tx.append(el('b', '', g.name), el('small', '', live ? 'em andamento · toque para voltar' : g.sub));
        b.append(el('span', 'em', g.em), tx);
        b.disabled = !g.ready;
        b.onclick = () => { toggle(false); if (live) showWin(); else start(g); };
        list.append(b);
      });
      const hint = el('div', 'jg-muted'); hint.style.marginTop = '8px'; hint.textContent = 'Quem abre o jogo comanda as rodadas. Todo mundo da sala joga junto.';
      panel.replaceChildren(h, list, hint);
    }
    function place() {
      const r = api.gamesButton().getBoundingClientRect();
      if (!r.width) { panel.style.left = ''; panel.style.right = '12px'; panel.style.top = '60px'; return; }
      const w = panel.offsetWidth;
      panel.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + 'px'; panel.style.right = 'auto';
      panel.style.top = Math.round(r.bottom + 8) + 'px';
    }
    function toggle(force) {
      const open = typeof force === 'boolean' ? force : panel.hidden;
      if (open) { api.closeOthers(); renderPanel(); }
      panel.hidden = !open;
      if (open) place();
      const b = api.gamesButton(); b.classList.toggle('active', open); b.setAttribute('aria-expanded', String(open));
    }
    document.addEventListener('pointerdown', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !api.gamesButton().contains(e.target)) toggle(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

    // ---------------- janela do jogo ----------------
    function buildWin(title) {
      const win = el('div', 'jg-win'); win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', title);
      const head = el('div', 'jg-wh');
      const t = el('b', '', title); const sub = el('small'); t.append(sub);
      const mini = el('button', '', '–'); mini.title = 'Minimizar (o jogo continua)'; mini.onclick = () => minWin();
      const close = el('button', '', '×'); close.title = 'Sair do jogo';
      close.onclick = () => leave();
      head.append(t, mini, close);
      const body = el('div', 'jg-body');
      win.append(head, body);
      const pill = el('button', 'jg-pill'); pill.hidden = true; pill.onclick = () => showWin();
      api.layer().append(win, pill);
      return { win, body, sub, pill };
    }
    function minWin() { if (!session) return; session.win.classList.add('min'); session.pill.hidden = false; renderPill(); }
    function showWin() { if (!session) return; session.win.classList.remove('min'); session.pill.hidden = true; }
    function renderPill() { if (session) session.pill.textContent = '🎮 ' + session.title + (session.status ? ' · ' + session.status : '') + ' — abrir'; }
    function closeSession(msg) {
      if (!session) return;
      const s = session; session = null;
      try { if (s.mod && s.mod.destroy) s.mod.destroy(s.ctx); } catch (e) {}
      s.win.remove(); s.pill.remove();
      api.duckMusic(false);
      if (msg) api.toast(msg);
    }
    function leave() {
      if (!session) return;
      if (session.master === api.myId()) {
        if (!confirm('Encerrar o jogo para todo mundo?')) return;
        send(session, 'end', {});
        closeSession('Jogo encerrado');
      } else {
        // convidado: só esconde; dá para voltar pelo botão Jogos enquanto o jogo existir
        minWin();
        api.toast('O jogo continua. Volte pelo botão 🎮 Jogos.');
      }
    }

    // ---------------- mensagens ----------------
    function send(ss, a, d) { api.send({ k: 'g', g: ss.g, s: ss.s, a, d: d || {} }); }

    function loadGame(g) {
      if (!modules[g.id]) {
        modules[g.id] = new Promise((ok, fail) => {
          const sc = document.createElement('script');
          sc.src = 'extras/' + g.file + '.js?v=' + api.ver;
          sc.onload = () => window[g.global] ? ok(window[g.global]) : fail();
          sc.onerror = fail;
          document.head.appendChild(sc);
        }).catch((e) => { delete modules[g.id]; throw e; });
      }
      return modules[g.id];
    }

    async function openSession(g, sid, master) {
      const mod = await loadGame(g);
      if (session && session.s === sid) return session;
      if (session) closeSession();
      const w = buildWin(g.em + ' ' + g.name);
      const me = api.myId();
      const ss = { g: g.id, s: sid, master, mod, win: w.win, body: w.body, pill: w.pill, title: g.name, status: '' };
      const ctx = {
        api, el, rnd, shuffle, norm,
        body: w.body,
        me, master, isMaster: master === me,
        nameOf: (id) => (id === me ? 'Você' : api.nameOf(id)),
        rawName: (id) => (id === me ? api.myName() : api.nameOf(id)),
        people: () => api.people().map((p) => p.id),
        // ação para o mestre (o mestre trata a própria ação na hora)
        toMaster: (a, d) => { if (ss.master === me) ss.mod.onMsg(ctx, me, a, d || {}); else send(ss, a, d); },
        // aviso do mestre para todos (inclusive ele mesmo)
        broadcast: (a, d) => { send(ss, a, d); ss.mod.onMsg(ctx, me, a, d || {}); },
        broadcastOnly: (a, d) => send(ss, a, d),
        setStatus: (t) => { ss.status = t || ''; w.sub.textContent = t ? '· ' + t : ''; renderPill(); },
        end: (msg) => { if (ss.master === me) send(ss, 'end', {}); closeSession(msg); },
      };
      ss.ctx = ctx;
      session = ss;
      mod.start(ctx);
      return ss;
    }

    function start(g) {
      if (session) { api.toast('Já tem um jogo rolando. Termine ele primeiro.'); showWin(); return; }
      const sid = Date.now().toString(36) + rnd(1e6).toString(36);
      send({ g: g.id, s: sid }, 'open', {});
      openSession(g, sid, api.myId()).catch(() => api.toast('Não deu para carregar o jogo. Confira a internet.'));
    }

    const asking = {};
    function receive(from, m) {
      if (typeof m.g !== 'string' || typeof m.s !== 'string' || typeof m.a !== 'string') return;
      const g = GAMES.find((x) => x.id === m.g && x.ready);
      if (!g) return;
      const d = (m.d && typeof m.d === 'object') ? m.d : {};
      if (m.a === 'open') {
        if (session && session.s === m.s) return;
        if (session && session.master === api.myId()) return;   // eu já comando outro jogo
        openSession(g, m.s, from).then(() => { api.toast('🎮 ' + api.nameOf(from) + ' abriu ' + g.name); }).catch(() => {});
        return;
      }
      if (!session || session.s !== m.s) {
        // cheguei no meio de um jogo: peço para o mestre me mandar o estado
        if (m.a !== 'need' && m.a !== 'end' && !asking[m.s]) { asking[m.s] = 1; api.send({ k: 'g', g: m.g, s: m.s, a: 'need', d: {} }); }
        return;
      }
      if (m.a === 'end') { if (from === session.master) closeSession('O jogo terminou'); return; }
      if (m.a === 'need') {
        if (session.master === api.myId()) { send(session, 'open', {}); setTimeout(() => { if (session && session.mod.resync) session.mod.resync(session.ctx); }, 600); }
        return;
      }
      session.mod.onMsg(session.ctx, from, m.a, d);
    }

    // mestre saiu da sala: o jogo acaba
    setInterval(() => {
      if (session && session.master !== api.myId() && !api.people().some((p) => p.id === session.master)) closeSession('Quem comandava o jogo saiu da sala');
    }, 3000);

    return { toggle, receive };
  }

  window.CZJogos = { init };
})();
