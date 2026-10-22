// Jogo UNO: cada um tem sua mão escondida e tenta se livrar das cartas primeiro, combinando a cor ou o número
// com a carta da mesa. ⊘ pula o próximo, ⇄ inverte a ordem, +2 e +4 fazem o próximo comprar (dá para acumular).
// Quem fica com 1 carta tem que gritar UNO!, senão os outros podem pegar e a pessoa compra 2.
//
// Quem abriu o jogo é o mestre: embaralha, dá as cartas, confere cada jogada e manda a mesa para todos.
// As mensagens passam por todo mundo da sala, então cada mão vai cifrada só para o dono: cada pessoa gera um par de
// chaves ECDH e manda a parte pública, e o mestre cifra a mão (AES-GCM) com a chave combinada das duas.
// Num navegador sem criptografia a mão vai sem cifra.
// Todas as mensagens saem por uma fila, no máximo uma a cada 60 ms (o anfitrião descarta mais rápido que isso).
(function () {
  'use strict';

  const COLOR_NAME = { r: 'vermelho', y: 'amarelo', g: 'verde', b: 'azul' };
  const COLOR_HEX = { r: '#e53935', y: '#f9a825', g: '#43a047', b: '#1e88e5' };
  const CARD_RE = /^(?:[rygb][0-9SRD]|w[WF])$/;
  const SYM = { S: '⊘', R: '⇄', D: '+2', W: '', F: '+4' };
  const ORDER_C = 'rygbw', ORDER_S = '0123456789SRDWF';
  const MAX_PLAYERS = 10, HAND0 = 7;

  // 108 cartas: por cor um 0 e dois de cada 1–9, ⊘, ⇄ e +2; mais 4 coringas e 4 +4
  function newDeck() {
    const d = [];
    'rygb'.split('').forEach((c) => {
      d.push(c + '0');
      for (let k = 0; k < 2; k++) '123456789SRD'.split('').forEach((s) => d.push(c + s));
    });
    for (let k = 0; k < 4; k++) d.push('wW', 'wF');
    return d;
  }
  const points = (c) => (c[0] === 'w' ? 50 : /[SRD]/.test(c[1]) ? 20 : Number(c[1]));
  const sortHand = (h) => h.slice().sort((a, b) => ORDER_C.indexOf(a[0]) - ORDER_C.indexOf(b[0]) || ORDER_S.indexOf(a[1]) - ORDER_S.indexOf(b[1]));
  // t: { top, color, pend, pt, stack }
  function canPlay(c, t) {
    if (t.pend > 0) return !!t.stack && (c === 'wF' || (c[1] === 'D' && t.pt === 'D'));
    return c[0] === 'w' || c[0] === t.color || c[1] === t.top[1];
  }

  const b64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(String(s)), (ch) => ch.charCodeAt(0));
  const SUBTLE = window.crypto && crypto.subtle && window.isSecureContext !== false ? crypto.subtle : null;
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  const enc = (s) => new TextEncoder().encode(s);

  const CSS = `
  .uno { position: relative; display: flex; flex-direction: column; gap: 10px; }
  .uno-top { display: flex; align-items: center; gap: 10px; }
  .uno-status { flex: 1; min-width: 0; font-size: 17px; font-weight: 800; }
  .uno-status.me { color: #3ddc97; }
  .uno-info { color: #8a919b; font-size: 12.5px; white-space: nowrap; }
  .uno-time { min-width: 34px; text-align: right; font-weight: 800; color: #f5c000; }
  .uno-seats { display: flex; flex-wrap: wrap; gap: 6px; }
  .uno-seat { display: flex; align-items: center; gap: 6px; max-width: 100%; padding: 5px 9px; border-radius: 10px; border: 1px solid transparent; background: #1b1f26; font-size: 13px; }
  .uno-seat.cur { border-color: #3ddc97; background: rgba(61,220,151,.12); }
  .uno-seat .nm { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .uno-seat.me .nm { color: #9db8ff; }
  .uno-seat .ct { display: inline-flex; align-items: center; gap: 3px; font-weight: 800; }
  .uno-seat .ct::before { content: ''; width: 8px; height: 12px; border-radius: 2px; border: 1px solid #fff; background: #c62828; }
  .uno-seat .pts { color: #f5c000; font-size: 11.5px; }
  .uno-badge { padding: 1px 6px; border-radius: 6px; background: #f5c000; color: #1a1300; font-size: 11px; font-style: italic; }
  .uno-table { display: flex; align-items: center; justify-content: center; gap: 28px; min-height: 150px; padding: 10px; border-radius: 14px; background: radial-gradient(ellipse at center, #1f5136 0%, #143524 75%); }
  .uno-deck { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: #cfe9d9; font-size: 12px; cursor: default; }
  .uno-deck.can { cursor: pointer; }
  .uno-deck.can .uno-card { box-shadow: 0 0 0 3px #f5c000, 0 4px 10px rgba(0,0,0,.5); }
  .uno-pile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; color: #cfe9d9; font-size: 12px; }
  .uno-pend { position: absolute; top: -10px; right: -16px; padding: 3px 8px; border-radius: 999px; background: #ff5a5f; color: #fff; font-size: 14px; }
  .uno-card { position: relative; flex: none; display: flex; align-items: center; justify-content: center; width: 3.7em; height: 5.5em; border-radius: .6em; border: .2em solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,.45); color: #fff; font-size: 15px; font-weight: 900; user-select: none; transition: transform .12s, filter .12s, box-shadow .12s; }
  .uno-card .mid { display: flex; align-items: center; justify-content: center; width: 82%; height: 66%; border-radius: 50%; background: #fff; transform: rotate(-24deg); }
  .uno-card .mid span { transform: rotate(24deg); font-size: 1.75em; line-height: 1; }
  .uno-card .tl, .uno-card .br { position: absolute; font-size: .8em; line-height: 1; }
  .uno-card .tl { top: .3em; left: .35em; }
  .uno-card .br { bottom: .3em; right: .35em; transform: rotate(180deg); }
  .uno-r { background: #e53935; } .uno-r .mid { color: #e53935; }
  .uno-y { background: #f9a825; } .uno-y .mid { color: #f9a825; }
  .uno-g { background: #43a047; } .uno-g .mid { color: #43a047; }
  .uno-b { background: #1e88e5; } .uno-b .mid { color: #1e88e5; }
  .uno-w { background: #212121; }
  .uno-w .mid { background: conic-gradient(#e53935 0 25%, #1e88e5 0 50%, #f9a825 0 75%, #43a047 0); color: #fff; }
  .uno-w .mid span { text-shadow: 0 1px 3px rgba(0,0,0,.8); }
  .uno-card.back { background: #1a1a1a; }
  .uno-card.back .mid { background: #e53935; }
  .uno-card.back .mid span { color: #f9e04b; font-size: 1.05em; font-style: italic; text-shadow: .06em .06em 0 #000; }
  .uno-card.big { font-size: 21px; }
  .uno-card.pop { animation: unoPop .3s ease-out; }
  @keyframes unoPop { from { transform: scale(1.3) rotate(-10deg); opacity: .3; } }
  .uno-acts { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; min-height: 38px; }
  .uno-call { padding: 9px 18px; border-radius: 999px; background: #f5c000; color: #1a1300; font-size: 16px; font-weight: 900; font-style: italic; box-shadow: 0 0 0 3px rgba(245,192,0,.3); }
  .uno-call.on { background: #3ddc97; box-shadow: 0 0 0 3px rgba(61,220,151,.35); }
  .uno-hand { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; min-height: 96px; padding-top: 10px; }
  .uno-hand .uno-card.ok { cursor: pointer; transform: translateY(-8px); box-shadow: 0 0 0 2px #3ddc97, 0 6px 14px rgba(0,0,0,.5); }
  .uno-hand .uno-card.ok:hover { transform: translateY(-14px); }
  .uno-hand .uno-card.no { filter: brightness(.5) saturate(.7); }
  .uno-feed { display: flex; flex-direction: column; gap: 2px; height: 72px; overflow-y: auto; padding: 6px 8px; border-radius: 8px; background: #0f1115; color: #c9cdd3; font-size: 12.5px; overflow-wrap: anywhere; }
  .uno-feed .hot { color: #f5c000; font-weight: 700; }
  .uno-feed .ok { color: #3ddc97; font-weight: 700; }
  .uno-feed .sys { color: #8a919b; font-style: italic; }
  .uno-chip { display: inline-block; min-width: 1.6em; padding: 0 .35em; border-radius: .35em; border: 1px solid rgba(255,255,255,.7); color: #fff; font-weight: 800; font-size: .92em; text-align: center; vertical-align: 1px; }
  .uno-picker { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-radius: 12px; background: rgba(15,17,21,.9); }
  .uno-colors { display: grid; grid-template-columns: repeat(2, 64px); gap: 10px; }
  .uno-col { width: 64px; height: 64px; border-radius: 14px; border: 3px solid #fff; }
  .uno-res { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; color: #eaeaea; text-align: center; }
  .uno-res .rows { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 560px; }
  .uno-res .row { display: flex; align-items: center; gap: 8px; }
  .uno-res .row > span { min-width: 70px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: #cfe9d9; font-size: 12.5px; }
  .uno-res .cards { display: flex; flex-wrap: wrap; gap: 3px; }
  .uno-res .uno-card { font-size: 8px; border-width: 1.5px; }
  @media (max-width: 640px) {
    .uno-hand { gap: 4px; }
    .uno-hand .uno-card { font-size: 11.5px; }
    .uno-card.big { font-size: 17px; }
    .uno-table { min-height: 124px; gap: 18px; }
    .uno-feed { height: 58px; }
    .uno-status { font-size: 15px; }
  }`;

  function start(ctx) {
    const { el, api } = ctx;
    if (!document.getElementById('uno-css')) { const st = el('style'); st.id = 'uno-css'; st.textContent = CSS; document.head.appendChild(st); }
    try { ctx.body.parentElement.style.width = 'min(780px, calc(100vw - 20px))'; } catch (e) {}
    const me = ctx.me;
    const S = ctx.state = {
      closed: false, timers: [], phase: 'setup', ui: null,
      cfg: { rounds: 1, limit: 30, stack: true },
      pks: {}, hvs: {}, seq: 0, m: null,   // só do mestre
      st: null, lastSeq: -1, hand: [], hv: 0, drawn: null, armed: false, busyAt: 0, bad: 0, feed: [], pop: false, deadline: 0,
    };
    const later = (fn, ms) => { const t = setTimeout(() => { if (!S.closed) fn(); }, ms); S.timers.push(t); return t; };
    const obj = (id) => (id === me ? 'você' : ctx.nameOf(id));
    const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
    const ids = (v) => (Array.isArray(v) ? v.slice(0, 20).map(String) : []);
    function clean(o) { const r = {}; if (o && typeof o === 'object') Object.keys(o).slice(0, 40).forEach((k) => { const v = Number(o[k]); if (Number.isFinite(v)) r[String(k).slice(0, 80)] = Math.round(v); }); return r; }

    // ---------------- chaves (para a mão ir cifrada) ----------------
    const keys = (async () => {
      if (!SUBTLE) return null;
      try {
        const pair = await SUBTLE.generateKey(ECDH, false, ['deriveKey']);
        return { pair, pub: b64(await SUBTLE.exportKey('raw', pair.publicKey)) };
      } catch (e) { return null; }
    })();
    const derived = new Map();   // chave pública do outro -> chave AES combinada
    function aesWith(pub) {
      if (!derived.has(pub)) {
        derived.set(pub, keys.then(async (k) => {
          const other = await SUBTLE.importKey('raw', unb64(pub), ECDH, false, []);
          return SUBTLE.deriveKey({ name: 'ECDH', public: other }, k.pair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        }).catch((e) => { derived.delete(pub); throw e; }));
      }
      return derived.get(pub);
    }

    // ---------------- fila de envio (uma mensagem a cada 60 ms) ----------------
    const Q = []; let qTimer = null, lastSent = 0;
    function emit(a, d) { Q.push([a, d]); pump(); }
    function emitAll(a, d) { emit(a, d); handle(me, a, d); }
    function pump() {
      if (qTimer || !Q.length || S.closed) return;
      qTimer = setTimeout(() => {
        qTimer = null;
        if (S.closed) return;
        const batch = []; let size = 20;
        while (Q.length) {
          const s = JSON.stringify(Q[0]).length;
          if (batch.length && size + s > 6000) break;
          batch.push(Q.shift()); size += s + 1;
        }
        ctx.broadcastOnly('b', { l: batch });
        lastSent = Date.now();
        pump();
      }, Math.max(0, lastSent + 60 - Date.now()));
    }

    // ---------------- cartas na tela ----------------
    function cardEl(c, cls) {
      const x = el('div', 'uno-card uno-' + c[0] + (cls ? ' ' + cls : ''));
      const s = SYM[c[1]] != null ? SYM[c[1]] : c[1];
      const mid = el('div', 'mid'); mid.append(el('span', '', s));
      x.append(el('span', 'tl', s), mid, el('span', 'br', s));
      x.title = c[0] === 'w' ? (c[1] === 'F' ? 'Coringa +4' : 'Coringa') : (c[1] === 'S' ? 'Pular' : c[1] === 'R' ? 'Inverter' : c[1] === 'D' ? '+2' : c[1]) + ' ' + COLOR_NAME[c[0]];
      return x;
    }
    function cardBack(cls) {
      const x = el('div', 'uno-card back' + (cls ? ' ' + cls : ''));
      const mid = el('div', 'mid'); mid.append(el('span', '', 'UNO')); x.append(mid);
      return x;
    }
    function chip(c) {
      const x = el('span', 'uno-chip', c[0] === 'w' ? (c[1] === 'F' ? '+4' : 'coringa') : (SYM[c[1]] || c[1]));
      x.style.background = c[0] === 'w' ? 'conic-gradient(#e53935 0 25%, #1e88e5 0 50%, #f9a825 0 75%, #43a047 0)' : COLOR_HEX[c[0]];
      return x;
    }
    function colorChip(k) { const x = el('span', 'uno-chip', COLOR_NAME[k]); x.style.background = COLOR_HEX[k]; return x; }

    // ---------------- telas ----------------
    function screenSetup() {
      S.phase = 'setup'; S.ui = null;
      const b = ctx.body; b.replaceChildren();
      ctx.setStatus('');
      if (!ctx.isMaster) { b.append(el('div', 'jg-center jg-muted', 'Esperando ' + ctx.nameOf(ctx.master) + ' começar o UNO…')); return; }
      const row = el('div', 'jg-row');
      const rs = el('select', 'jg-select');
      [1, 3, 5].forEach((n) => { const o = el('option', '', n === 1 ? '1 rodada' : n + ' rodadas'); o.value = n; o.selected = n === S.cfg.rounds; rs.append(o); });
      rs.onchange = () => { S.cfg.rounds = Number(rs.value); };
      const ts = el('select', 'jg-select');
      [20, 30, 45].forEach((n) => { const o = el('option', '', n + ' s por jogada'); o.value = n; o.selected = n === S.cfg.limit; ts.append(o); });
      ts.onchange = () => { S.cfg.limit = Number(ts.value); };
      row.append(rs, ts);
      const chips = el('div', 'jg-chips'); chips.style.margin = '10px 0';
      const stk = el('button', 'jg-chip' + (S.cfg.stack ? ' on' : ''), (S.cfg.stack ? '✓ ' : '') + 'Pode acumular +2 e +4');
      stk.onclick = () => { S.cfg.stack = !S.cfg.stack; screenSetup(); };
      chips.append(stk);
      const ppl = ctx.people();
      const who = el('div', 'jg-muted');
      who.textContent = 'Na mesa: ' + ppl.slice(0, MAX_PLAYERS).map((id) => ctx.nameOf(id) + (id === me || id in S.pks ? '' : ' (conectando…)')).join(', ') +
        (ppl.length > MAX_PLAYERS ? ' — mais de ' + MAX_PLAYERS + ' pessoas: o resto assiste' : '');
      const go = el('button', 'jg-btn', 'Dar as cartas ▶'); go.disabled = ppl.length < 2; go.style.marginTop = '12px';
      go.onclick = () => mBegin();
      const tip = el('div', 'jg-muted'); tip.style.marginTop = '12px';
      tip.textContent = ppl.length < 2 ? 'Precisa de pelo menos 2 pessoas na sala para jogar.'
        : 'Jogue uma carta da mesma cor ou do mesmo número/símbolo da mesa. Antes de jogar a penúltima carta, aperte UNO! — se esquecer, os outros podem te pegar e você compra 2.';
      b.append(row, chips, who, go, tip);
    }

    function screenGame() {
      S.phase = 'game';
      const b = ctx.body; b.replaceChildren();
      const root = el('div', 'uno');
      const top = el('div', 'uno-top'); const status = el('div', 'uno-status'); const info = el('div', 'uno-info'); const time = el('div', 'uno-time');
      top.append(status, info, time);
      const bar = el('div', 'jg-bar'); const fill = el('i'); fill.style.width = '100%'; bar.append(fill);
      const seats = el('div', 'uno-seats'); const table = el('div', 'uno-table'); const acts = el('div', 'uno-acts');
      const hand = el('div', 'uno-hand'); const feed = el('div', 'uno-feed');
      root.append(top, bar, seats, table, acts, hand, feed);
      b.append(root);
      S.ui = { root, status, info, time, fill, seats, table, acts, hand, feed };
      feed.replaceChildren(...S.feed.map((f) => f.cloneNode(true)));
      feed.scrollTop = feed.scrollHeight;
      render();
    }

    function turnHint(st) {
      if (S.drawn && st.drew.includes(me)) return 'jogue a carta que comprou ou passe';
      if (st.pend) return st.stack ? 'jogue um ' + (st.pt === 'F' ? '+4' : '+2 ou +4') + ' ou compre ' + st.pend : 'compre ' + st.pend;
      return 'jogue ' + COLOR_NAME[st.color] + (st.top[0] === 'w' ? '' : ' ou ' + (SYM[st.top[1]] || st.top[1]));
    }

    function render() {
      const u = S.ui, st = S.st; if (!u || !st) return;
      const playing = st.order.includes(me);
      const myTurn = st.phase === 'play' && st.cur === me;
      const busy = Date.now() - S.busyAt < 1500;

      u.status.className = 'uno-status' + (myTurn ? ' me' : '');
      if (st.phase === 'end') u.status.textContent = '🏆 ' + (st.win === me ? 'Você venceu a rodada!' : ctx.nameOf(st.win) + ' venceu a rodada');
      else u.status.textContent = myTurn ? 'Sua vez: ' + turnHint(st) : 'Vez de ' + ctx.nameOf(st.cur) + (st.pend ? ' (+' + st.pend + ' acumulado)' : '');
      u.info.textContent = 'Rodada ' + st.r + '/' + st.rounds + ' · ' + (st.dir === 1 ? '↻' : '↺');
      ctx.setStatus(st.phase === 'end' ? 'fim da rodada' : myTurn ? 'sua vez!' : 'vez de ' + ctx.nameOf(st.cur));

      u.seats.replaceChildren(...st.order.map((id) => {
        const n = st.counts[id];
        const x = el('div', 'uno-seat' + (id === st.cur && st.phase === 'play' ? ' cur' : '') + (id === me ? ' me' : ''));
        x.append(el('span', 'nm', ctx.nameOf(id)), el('span', 'ct', String(n)));
        if (n === 1 && st.said.includes(id)) x.append(el('b', 'uno-badge', 'UNO!'));
        if (st.rounds > 1) x.append(el('span', 'pts', (st.scores[id] || 0) + ' pts'));
        return x;
      }));

      u.table.replaceChildren();
      if (st.phase === 'end') {
        const res = el('div', 'uno-res');
        res.append(el('b', '', (st.win === me ? 'Você ganhou' : ctx.nameOf(st.win) + ' ganhou') + ' +' + ((st.gains && st.gains[st.win]) || 0) + ' pontos (as cartas que sobraram com os outros)'));
        if (st.reveal) {
          const rows = el('div', 'rows');
          st.order.forEach((id) => {
            const h = st.reveal[id]; if (id === st.win || !h || !h.length) return;
            const r = el('div', 'row'); const cards = el('div', 'cards');
            sortHand(h).forEach((c) => cards.append(cardEl(c)));
            r.append(el('span', '', ctx.nameOf(id)), cards); rows.append(r);
          });
          res.append(rows);
        }
        res.append(el('div', 'jg-muted', st.r < st.rounds ? 'Próxima rodada já já…' : 'Contando o resultado…'));
        u.table.append(res);
      } else {
        const canDraw = myTurn && !busy && !(S.drawn && st.drew.includes(me));
        const deck = el('button', 'uno-deck' + (canDraw ? ' can' : ''));
        deck.title = 'Comprar'; deck.append(cardBack(), el('small', '', st.deck + ' no monte'));
        deck.onclick = () => drawAct();
        const pile = el('div', 'uno-pile');
        const topCard = cardEl(st.top, 'big' + (S.pop ? ' pop' : ''));
        topCard.style.boxShadow = '0 0 0 4px ' + COLOR_HEX[st.color] + ', 0 6px 16px rgba(0,0,0,.5)';
        pile.append(topCard, el('small', '', 'cor da vez: ' + COLOR_NAME[st.color]));
        if (st.pend) pile.append(el('b', 'uno-pend', '+' + st.pend));
        u.table.append(deck, pile);
      }
      S.pop = false;

      u.acts.replaceChildren();
      if (st.phase === 'play' && playing) {
        const n = S.hand.length;
        if (myTurn && S.drawn && st.drew.includes(me)) {
          const p = el('button', 'jg-btn ghost', 'Passar a vez'); p.disabled = busy; p.onclick = () => act('pass', { tn: st.tn }); u.acts.append(p);
        } else if (myTurn) {
          const d = el('button', 'jg-btn ghost', st.pend ? '🃏 Comprar ' + st.pend : '🃏 Comprar'); d.disabled = busy; d.onclick = () => drawAct(); u.acts.append(d);
        }
        if ((myTurn && n === 2) || (n === 1 && st.miss === me)) {
          const c = el('button', 'uno-call' + (S.armed ? ' on' : ''), S.armed ? 'UNO! ✓' : 'UNO!');
          c.title = n === 2 ? 'Aperte antes de jogar a penúltima carta' : 'Grite antes que te peguem!';
          c.onclick = () => { if (S.hand.length === 1) act('uno', {}); else { S.armed = !S.armed; render(); } };
          u.acts.append(c);
        }
        if (st.miss && st.miss !== me) {
          const g = el('button', 'jg-btn blue', '🫵 ' + ctx.nameOf(st.miss) + ' não gritou UNO! Pegar');
          g.onclick = () => act('catch', { who: st.miss }); u.acts.append(g);
        }
      }

      u.hand.replaceChildren();
      if (!playing) u.hand.append(el('div', 'jg-muted jg-center', 'Você está assistindo. Entra na próxima rodada.'));
      else {
        sortHand(S.hand).forEach((c) => {
          const ok = myTurn && !busy && canPlay(c, st) && (!S.drawn || !st.drew.includes(me) || c === S.drawn);
          const x = cardEl(c, myTurn ? (ok ? 'ok' : 'no') : '');
          if (ok) x.onclick = () => playCard(c);
          u.hand.append(x);
        });
      }
      if (!myTurn) { const p = u.root.querySelector('.uno-picker'); if (p) p.remove(); }
      updateTimer();
    }

    function updateTimer() {
      const u = S.ui, st = S.st; if (!u || !st) return;
      if (st.phase !== 'play') { u.time.textContent = ''; u.fill.style.width = '0%'; return; }
      const rest = Math.max(0, (S.deadline - Date.now()) / 1000);
      u.fill.style.width = Math.min(100, rest / st.lim * 100) + '%';
      u.time.textContent = Math.ceil(rest) + 's';
    }

    function feedAdd(node, cls) {
      if (cls) node.className = cls;
      S.feed.push(node); if (S.feed.length > 50) S.feed.shift();
      if (S.ui) { S.ui.feed.append(node.cloneNode(true)); while (S.ui.feed.childNodes.length > 50) S.ui.feed.firstChild.remove(); S.ui.feed.scrollTop = S.ui.feed.scrollHeight; }
    }
    function evLine(e) {
      if (!Array.isArray(e) || typeof e[0] !== 'string') return;
      const [t, w, x, y] = e; const who = ctx.nameOf(String(w || ''));
      const line = el('div');
      if (t === 'p' && typeof x === 'string' && CARD_RE.test(x)) {
        line.append(who + ' jogou ', chip(x));
        if (x[0] === 'w' && COLOR_NAME[y]) line.append(' e escolheu ', colorChip(y));
        if (x[1] === 'R') line.append(' e inverteu a ordem');
        feedAdd(line); return;
      }
      const n = int(x);
      const txt = {
        d: [who + ' comprou ' + n + (n === 1 ? ' carta' : ' cartas')],
        s: [who + ' perdeu a vez'],
        u: [who + ' gritou UNO!', 'hot'],
        c: [who + ' pegou ' + obj(String(x || '')) + ' sem gritar UNO: +2 cartas', 'hot'],
        t: [w === me ? 'Seu tempo acabou' : 'Acabou o tempo de ' + who, 'sys'],
        l: [who + ' saiu do jogo', 'sys'],
        w: ['🏆 ' + who + ' venceu a rodada! +' + n + ' pontos', 'ok'],
        n: ['— Rodada ' + int(w) + ' —', 'sys'],
        pa: [who + ' passou a vez'],
        rs: ['O monte acabou: a mesa foi embaralhada de novo', 'sys'],
      }[t];
      if (!txt) return;
      line.textContent = txt[0]; feedAdd(line, txt[1]);
    }

    // ---------------- ações de quem joga ----------------
    function act(a, d) {
      S.busyAt = Date.now();
      if (ctx.isMaster) mAct(me, a, d); else emit(a, d);
      render();
      later(render, 1600);   // se o mestre recusou a jogada, os botões voltam
    }
    function drawAct() {
      const st = S.st;
      if (!st || st.phase !== 'play' || st.cur !== me || Date.now() - S.busyAt < 1500 || (S.drawn && st.drew.includes(me))) return;
      act('draw', { tn: st.tn });
    }
    function playCard(c) {
      const send = (color) => { const uno = S.armed; S.armed = false; act('play', { tn: S.st.tn, card: c, color, uno }); };
      if (c[0] !== 'w') { send(''); return; }
      const old = S.ui.root.querySelector('.uno-picker'); if (old) old.remove();
      const o = el('div', 'uno-picker');
      o.append(el('b', '', 'Escolha a cor'));
      const row = el('div', 'uno-colors');
      'rygb'.split('').forEach((k) => {
        const bt = el('button', 'uno-col'); bt.style.background = COLOR_HEX[k]; bt.title = COLOR_NAME[k];
        bt.onclick = () => { o.remove(); send(k); };
        row.append(bt);
      });
      const cancel = el('button', 'jg-btn ghost', 'Cancelar'); cancel.onclick = () => o.remove();
      o.append(row, cancel);
      S.ui.root.append(o);
    }

    // ---------------- quem recebe ----------------
    function onSt(d) {
      if (!Number.isInteger(d.seq) || d.seq < S.lastSeq || !Array.isArray(d.order) || typeof d.top !== 'string' || !CARD_RE.test(d.top)) return;
      const fresh = d.seq > S.lastSeq; S.lastSeq = d.seq;
      const st = {
        r: int(d.r), rounds: int(d.rounds) || 1, tn: int(d.tn), order: d.order.slice(0, MAX_PLAYERS).map(String), counts: {},
        cur: String(d.cur || ''), dir: d.dir === -1 ? -1 : 1, top: d.top, color: COLOR_NAME[d.color] ? d.color : 'r',
        pend: Math.min(200, int(d.pend)), pt: d.pt === 'F' ? 'F' : 'D', deck: int(d.deck), phase: d.phase === 'end' ? 'end' : 'play',
        miss: d.miss ? String(d.miss) : null, said: ids(d.said), drew: ids(d.drew), stack: !!d.stack, lim: Math.min(120, int(d.lim)) || 30,
        scores: clean(d.scores), win: d.win ? String(d.win) : null, gains: clean(d.gains), reveal: null,
      };
      st.order.forEach((id) => { st.counts[id] = Math.min(200, int(d.counts && d.counts[id])); });
      if (d.reveal && typeof d.reveal === 'object') {
        st.reveal = {};
        st.order.forEach((id) => { const h = d.reveal[id]; if (Array.isArray(h)) st.reveal[id] = h.filter((c) => typeof c === 'string' && CARD_RE.test(c)).slice(0, 120); });
      }
      S.deadline = Date.now() + Math.min(st.lim, Math.max(0, Number(d.rest) || 0)) * 1000;
      if (!S.st || S.st.r !== st.r) S.armed = false;
      S.st = st; S.busyAt = 0;
      if (fresh && Array.isArray(d.ev)) {
        d.ev.slice(0, 30).forEach(evLine);
        S.pop = d.ev.some((e) => Array.isArray(e) && e[0] === 'p');
      }
      if (S.phase !== 'game') screenGame(); else render();
    }
    async function onHand(d) {
      if (d.to !== me || !Number.isInteger(d.v) || d.v <= S.hv) return;
      let p = null;
      if (typeof d.ct === 'string') {
        try {
          const k = await keys; if (!k) return;
          const key = await aesWith(String(d.mk));
          const plain = await SUBTLE.decrypt({ name: 'AES-GCM', iv: unb64(d.iv), additionalData: enc(me + ':' + d.v) }, key, unb64(d.ct));
          p = JSON.parse(new TextDecoder().decode(plain));
        } catch (e) { return; }
      } else p = { h: d.h, d: d.d };
      applyHand(p, d.v);
    }
    function applyHand(p, v) {
      if (S.closed || v <= S.hv || !p || !Array.isArray(p.h)) return;
      S.hv = v;
      S.hand = p.h.filter((c) => typeof c === 'string' && CARD_RE.test(c)).slice(0, 120);
      S.drawn = typeof p.d === 'string' && CARD_RE.test(p.d) ? p.d : null;
      if (S.hand.length !== 2) S.armed = false;
      render();
    }
    function onFinal(d) {
      if (S.phase === 'final') return;
      S.phase = 'final'; S.ui = null;
      const scores = clean(d.scores);
      ctx.setStatus('fim');
      const b = ctx.body; b.replaceChildren();
      const list = Object.keys(scores).sort((a, c) => scores[c] - scores[a]);
      // empate divide a medalha: a posição é quantos fizeram mais pontos
      const place = (id) => list.filter((x) => scores[x] > scores[id]).length;
      const MEDAL = ['🥇', '🥈', '🥉'];
      b.append(el('div', 'jg-center jg-big', '🏆'));
      const pod = el('div', 'jg-podium');
      [[1, 'p2'], [0, 'p1'], [2, 'p3']].forEach(([i, cls]) => {
        const id = list[i]; const x = el('div', id ? ['p1', 'p2', 'p3'][place(id)] || cls : cls);
        if (id) x.append(el('div', 'em', MEDAL[place(id)] || '🏅'), el('div', '', ctx.nameOf(id)), el('b', '', scores[id] + ' pts')); else x.style.visibility = 'hidden';
        pod.append(x);
      });
      const tab = el('div', 'jg-score');
      list.forEach((id) => { const r = el('div', id === me ? 'me' : ''); r.append(el('span', '', ctx.nameOf(id)), el('b', '', String(scores[id]))); tab.append(r); });
      b.append(pod, tab);
      const row = el('div', 'jg-row'); row.style.cssText = 'margin-top:12px;justify-content:center';
      if (ctx.isMaster) {
        const again = el('button', 'jg-btn', 'Jogar de novo'); again.onclick = () => { S.m = null; S.st = null; S.feed = []; screenSetup(); };
        const end = el('button', 'jg-btn ghost', 'Encerrar'); end.onclick = () => ctx.end('Jogo encerrado');
        row.append(again, end);
      } else row.append(el('div', 'jg-muted', 'Aguardando ' + ctx.nameOf(ctx.master) + ' decidir se joga de novo.'));
      b.append(row);
      if (list.length) api.sysChat('🃏 UNO: ' + list.slice(0, 3).map((id) => MEDAL[place(id)] + ' ' + ctx.rawName(id) + ' (' + scores[id] + ')').join('  '));
    }

    function handle(from, a, d) {
      if (S.closed || typeof a !== 'string' || !d || typeof d !== 'object') return;
      if (ctx.isMaster && from !== me) mAct(from, a, d);
      if (from !== ctx.master) return;
      if (a === 'st') onSt(d);
      else if (a === 'hand') onHand(d);
      else if (a === 'final') { S.feed = []; S.st = null; onFinal(d); }
    }

    // ---------------- mestre ----------------
    function mTable() { const M = S.m; return { top: M.top, color: M.color, pend: M.pend, pt: M.pt, stack: M.cfg.stack }; }
    function mBegin() {
      const ppl = ctx.people().slice(0, MAX_PLAYERS);
      if (ppl.length < 2) { api.toast('Precisa de pelo menos 2 pessoas.'); return; }
      const seats = ctx.shuffle(ppl);
      const scores = {}; seats.forEach((id) => { scores[id] = 0; });
      S.feed = [];
      S.m = { cfg: Object.assign({}, S.cfg), seats, scores, r: 0, tn: 0, afk: {}, ev: [], dirty: new Set() };
      mRound();
    }
    function mRound() {
      const M = S.m;
      // quem saiu fica de fora; quem chegou entra no fim da roda
      const here = ctx.people();
      const seats = M.seats.filter((id) => here.includes(id));
      here.forEach((id) => { if (!seats.includes(id)) seats.push(id); });
      M.seats = seats.slice(0, MAX_PLAYERS);
      if (M.seats.length < 2) { mFinal(); return; }
      M.r++;
      M.seats.forEach((id) => { if (!(id in M.scores)) M.scores[id] = 0; });
      M.order = M.seats.slice();
      M.deck = ctx.shuffle(newDeck()); M.discard = [];
      M.hands = {}; M.drawn = {};
      M.order.forEach((id) => { M.hands[id] = M.deck.splice(0, HAND0); M.dirty.add(id); });
      const first = M.deck.findIndex((c) => /[0-9]/.test(c[1]));   // a mesa começa com um número
      M.top = M.deck.splice(first, 1)[0]; M.discard.push(M.top); M.color = M.top[0];
      M.dir = 1; M.pend = 0; M.pt = null; M.miss = null; M.said = new Set(); M.win = null; M.gains = null;
      M.cur = M.order[(M.r - 1) % M.order.length];
      M.phase = 'play'; M.ev.push(['n', M.r]);
      mTurn(); mPublish();
    }
    function mTurn() {
      const M = S.m;
      M.tn++;
      M.lim = (M.afk[M.cur] || 0) >= 2 ? 8 : M.cfg.limit;   // quem sumiu ganha só 8 s por vez
      M.deadline = Date.now() + M.lim * 1000;
    }
    function mStep(k) {
      const M = S.m, n = M.order.length, i = M.order.indexOf(M.cur);
      M.cur = M.order[(((i + M.dir * k) % n) + n) % n];
    }
    function mTake(id, n) {
      const M = S.m, got = [];
      for (let k = 0; k < n; k++) {
        if (!M.deck.length) {
          const top = M.discard.pop();
          if (!M.discard.length) { M.discard.push(top); break; }
          M.deck = ctx.shuffle(M.discard); M.discard = [top];
          M.ev.push(['rs']);
        }
        got.push(M.deck.pop());
      }
      M.hands[id].push(...got);
      if (M.hands[id].length > 1) M.said.delete(id);
      M.dirty.add(id);
      return got;
    }
    function mState(ev) {
      const M = S.m;
      const counts = {}; M.order.forEach((id) => { counts[id] = M.hands[id].length; });
      return {
        seq: S.seq, r: M.r, rounds: M.cfg.rounds, tn: M.tn, order: M.order, counts, cur: M.cur, dir: M.dir, top: M.top, color: M.color,
        pend: M.pend, pt: M.pt, deck: M.deck.length, phase: M.phase, miss: M.miss, said: [...M.said], stack: M.cfg.stack,
        lim: M.lim, rest: Math.max(0, Math.round((M.deadline - Date.now()) / 100) / 10), drew: Object.keys(M.drawn).filter((id) => M.drawn[id]),
        scores: M.scores, win: M.win, gains: M.gains, ev, reveal: M.phase === 'end' ? M.hands : undefined,
      };
    }
    function mPublish() {
      const M = S.m;
      S.seq++;
      const ev = M.ev; M.ev = [];
      emitAll('st', mState(ev));
      M.dirty.forEach((id) => mSendHand(id)); M.dirty.clear();
    }
    async function mSendHand(id) {
      const M = S.m; if (!M || !M.hands || !M.hands[id]) return;
      const v = S.hvs[id] = (S.hvs[id] || 0) + 1;
      const payload = { h: M.hands[id].slice(), d: M.drawn[id] || null };
      if (id === me) { applyHand(payload, v); return; }
      const pk = S.pks[id];
      if (pk === undefined) return;   // ainda não mandou a chave: a mão vai quando ela chegar
      const k = await keys;
      if (S.closed || S.m !== M) return;
      if (k && typeof pk === 'string') {
        try {
          const key = await aesWith(pk);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ct = await SUBTLE.encrypt({ name: 'AES-GCM', iv, additionalData: enc(id + ':' + v) }, key, enc(JSON.stringify(payload)));
          if (!S.closed) emit('hand', { to: id, v, mk: k.pub, iv: b64(iv), ct: b64(ct) });
          return;
        } catch (e) {}
      }
      emit('hand', { to: id, v, h: payload.h, d: payload.d });
    }
    function mAct(from, a, d) {
      if (a === 'pk') {
        S.pks[from] = typeof d.k === 'string' && d.k.length < 200 ? d.k : null;
        if (S.m && S.m.hands && S.m.hands[from]) mSendHand(from);
        if (S.phase === 'setup') screenSetup();
        return;
      }
      const M = S.m;
      if (!M || M.phase !== 'play' || !M.hands[from]) return;
      if (a === 'uno') {
        if (M.miss === from) { M.miss = null; M.said.add(from); M.ev.push(['u', from]); mPublish(); }
        return;
      }
      if (a === 'catch') {
        const who = String(d.who || '');
        if (M.miss !== who || who === from) return;
        M.miss = null; mTake(who, 2); M.ev.push(['c', from, who]); mPublish();
        return;
      }
      if (d.tn !== M.tn || from !== M.cur) return;
      M.afk[from] = 0;
      if (a === 'play') mPlay(from, String(d.card || ''), String(d.color || ''), !!d.uno);
      else if (a === 'draw') mDraw(from, false);
      else if (a === 'pass' && M.drawn[from]) { M.drawn[from] = null; M.dirty.add(from); M.ev.push(['pa', from]); mStep(1); mTurn(); mPublish(); }
    }
    function mPlay(from, card, color, uno) {
      const M = S.m, hand = M.hands[from];
      const i = hand.indexOf(card);
      if (i < 0 || !canPlay(card, mTable())) return;
      if (M.drawn[from] && card !== M.drawn[from]) return;   // depois de comprar, só a carta comprada
      if (card[0] === 'w' && !COLOR_NAME[color]) return;
      hand.splice(i, 1); M.dirty.add(from); M.drawn[from] = null;
      M.miss = null;
      M.discard.push(card); M.top = card; M.color = card[0] === 'w' ? color : card[0];
      M.ev.push(['p', from, card, card[0] === 'w' ? color : '']);
      if (hand.length === 1) { if (uno) { M.said.add(from); M.ev.push(['u', from]); } else M.miss = from; }
      else M.said.delete(from);
      if (!hand.length) { mWin(from); return; }
      const two = M.order.length === 2;
      if (card[1] === 'R') { M.dir *= -1; mStep(two ? 2 : 1); }   // com 2 pessoas, inverter é igual a pular
      else if (card[1] === 'S') { mStep(1); M.ev.push(['s', M.cur]); mStep(1); }
      else if (card[1] === 'D' || card[1] === 'F') {
        const n = card[1] === 'D' ? 2 : 4;
        mStep(1);
        if (M.cfg.stack) { M.pend += n; M.pt = card[1]; }
        else { const got = mTake(M.cur, n); M.ev.push(['d', M.cur, got.length], ['s', M.cur]); mStep(1); }
      } else mStep(1);
      mTurn(); mPublish();
    }
    function mDraw(from, auto) {
      const M = S.m;
      if (M.drawn[from]) return;
      M.miss = null;
      if (M.pend > 0) {
        const got = mTake(from, M.pend); M.ev.push(['d', from, got.length], ['s', from]);
        M.pend = 0; M.pt = null; mStep(1); mTurn(); mPublish(); return;
      }
      const got = mTake(from, 1); M.ev.push(['d', from, got.length]);
      const c = got[0];
      if (c && !auto && canPlay(c, mTable())) {
        M.drawn[from] = c; M.tn++; M.deadline = Math.max(M.deadline, Date.now() + 10000);
        mPublish(); return;
      }
      mStep(1); mTurn(); mPublish();
    }
    function mWin(win) {
      const M = S.m;
      let pts = 0;
      M.order.forEach((id) => { if (id !== win) M.hands[id].forEach((c) => { pts += points(c); }); });
      M.scores[win] = (M.scores[win] || 0) + pts;
      M.win = win; M.gains = { [win]: pts }; M.phase = 'end'; M.miss = null; M.pend = 0;
      M.ev.push(['w', win, pts]);
      mPublish();
      later(() => { if (S.m !== M) return; if (M.r < M.cfg.rounds) mRound(); else mFinal(); }, 9000);
    }
    function mFinal() { const M = S.m; M.phase = 'final'; emitAll('final', { scores: M.scores }); }
    function mDrop(id) {
      const M = S.m;
      if (!M.order.includes(id)) return;
      M.ev.push(['l', id]);
      if (M.cur === id) { mStep(1); mTurn(); }
      M.deck.unshift(...M.hands[id]);
      delete M.hands[id]; delete M.drawn[id]; M.said.delete(id); if (M.miss === id) M.miss = null;
      M.order.splice(M.order.indexOf(id), 1);
      if (M.order.length === 1) mWin(M.order[0]);
      else if (!M.order.length) mFinal();
    }
    // relógio do mestre: tempo de cada jogada e quem saiu da sala
    function mTick() {
      const M = S.m;
      if (!M || M.phase !== 'play') return;
      const here = ctx.people();
      const gone = M.order.filter((id) => !here.includes(id));
      if (gone.length) { gone.forEach((id) => { if (M.phase === 'play') mDrop(id); }); if (M.phase === 'play') mPublish(); return; }
      if (Date.now() < M.deadline) return;
      const who = M.cur;
      M.afk[who] = (M.afk[who] || 0) + 1;
      M.ev.push(['t', who]);
      if (M.drawn[who]) { M.drawn[who] = null; M.dirty.add(who); mStep(1); mTurn(); mPublish(); }
      else mDraw(who, true);   // compra (ou leva o acumulado) e passa a vez
    }
    function resync() {
      const M = S.m; if (!M) return;
      if (M.phase === 'final') { emit('final', { scores: M.scores }); return; }
      if (M.order) emit('st', mState([]));
    }

    // a mão não bate com a contagem da mesa: pede de novo (manda a chave outra vez)
    function selfCheck() {
      const st = S.st;
      if (ctx.isMaster || !st || st.phase !== 'play' || !st.order.includes(me) || st.counts[me] === S.hand.length) { S.bad = 0; return; }
      if (++S.bad >= 2) { S.bad = 0; keys.then((k) => { if (!S.closed) emit('pk', { k: k ? k.pub : null }); }); }
    }

    S.tick = setInterval(() => { if (ctx.isMaster) mTick(); updateTimer(); }, 250);
    S.check = setInterval(selfCheck, 2500);
    S.onMsg = (c, from, a, d) => {
      if (a !== 'b' || !d || !Array.isArray(d.l)) return;
      d.l.slice(0, 60).forEach((x) => { if (Array.isArray(x)) handle(from, x[0], x[1] || {}); });
    };
    S.resync = resync;
    S.destroy = () => { S.closed = true; S.timers.forEach(clearTimeout); clearInterval(S.tick); clearInterval(S.check); clearTimeout(qTimer); Q.length = 0; };
    if (!ctx.isMaster) keys.then((k) => { if (!S.closed) emit('pk', { k: k ? k.pub : null }); });
    screenSetup();
  }

  window.CZJogoUno = {
    start,
    onMsg: (ctx, from, a, d) => ctx.state.onMsg(ctx, from, a, d),
    resync: (ctx) => ctx.state.resync(),
    destroy: (ctx) => ctx.state.destroy(),
  };
})();
