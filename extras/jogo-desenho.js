// Jogo "Desenha e adivinha" (no estilo do Gartic): cada um desenha na sua vez, escolhendo 1 de 3 palavras,
// e o resto chuta pelo campo de resposta. Acertar primeiro vale mais; quem desenha ganha quando acertam o desenho.
//
// Quem abriu o jogo é o mestre: decide a ordem, cronometra e conta os pontos. Só quem desenha conhece a palavra:
// é o navegador dele que confere os chutes, dá as dicas de letras e revela a palavra no fim da vez.
// Todas as mensagens saem por uma fila própria, no máximo uma a cada 60 ms (o anfitrião descarta mais rápido que isso),
// juntando os pedaços de traço que se acumularem nesse intervalo.
(function () {
  'use strict';

  const W = 800, H = 600;
  const COLORS = ['#000000', '#ffffff', '#7f8c8d', '#c0392b', '#ff5a5f', '#e67e22', '#f1c40f', '#2ecc71', '#1e8449',
    '#5dade2', '#2e86c1', '#1f3a93', '#8e44ad', '#ff8fc8', '#8d5524', '#f5cba7'];
  const SIZES = [4, 10, 22, 44];
  const ERASER = 1;   // borracha = pincel branco

  const T = {
    animais: { name: 'Animais', words: ['cachorro', 'gato', 'elefante', 'girafa', 'leão', 'tigre', 'macaco', 'cobra', 'tartaruga', 'peixe',
      'tubarão', 'baleia', 'polvo', 'caranguejo', 'borboleta', 'abelha', 'aranha', 'formiga', 'joaninha', 'sapo', 'coelho', 'rato',
      'cavalo', 'vaca', 'porco', 'galinha', 'pato', 'coruja', 'pinguim', 'papagaio', 'jacaré', 'canguru', 'zebra', 'camelo', 'urso',
      'lobo', 'raposa', 'morcego', 'caracol', 'flamingo', 'golfinho', 'minhoca', 'dinossauro', 'unicórnio', 'lagosta', 'ovelha'] },
    comidas: { name: 'Comidas', words: ['pizza', 'hambúrguer', 'cachorro-quente', 'sorvete', 'bolo', 'pipoca', 'banana', 'maçã', 'abacaxi',
      'melancia', 'uva', 'morango', 'cenoura', 'milho', 'ovo frito', 'pão', 'queijo', 'brigadeiro', 'coxinha', 'pastel', 'sushi',
      'macarrão', 'batata frita', 'chocolate', 'pirulito', 'rosquinha', 'café', 'laranja', 'limão', 'tomate', 'pimenta', 'coco',
      'sanduíche', 'panqueca', 'pudim', 'picolé', 'feijão', 'arroz', 'feijoada', 'cereja', 'abacate', 'churrasco', 'açaí', 'pão de queijo', 'cupcake', 'algodão-doce'] },
    objetos: { name: 'Objetos', words: ['cadeira', 'guarda-chuva', 'óculos', 'relógio', 'celular', 'televisão', 'computador', 'chave',
      'tesoura', 'lâmpada', 'vela', 'livro', 'lápis', 'mochila', 'sapato', 'chapéu', 'bola', 'violão', 'escova de dentes', 'espelho',
      'garrafa', 'xícara', 'garfo', 'panela', 'geladeira', 'ventilador', 'cama', 'sofá', 'escada', 'bicicleta', 'carro', 'avião', 'navio',
      'foguete', 'trem', 'skate', 'balão', 'pipa', 'guitarra', 'microfone', 'fone de ouvido', 'câmera', 'martelo', 'ímã', 'presente',
      'coroa', 'anel', 'tênis', 'videogame', 'cadeado'] },
    lugares: { name: 'Natureza e lugares', words: ['praia', 'montanha', 'vulcão', 'ilha', 'castelo', 'hospital', 'escola', 'cinema',
      'estádio', 'piscina', 'floresta', 'deserto', 'cachoeira', 'ponte', 'farol', 'fazenda', 'circo', 'parque', 'aeroporto', 'sol', 'lua',
      'estrela', 'nuvem', 'chuva', 'arco-íris', 'raio', 'boneco de neve', 'árvore', 'flor', 'cacto', 'cogumelo', 'fogueira', 'tornado',
      'planeta', 'pirâmide', 'pôr do sol', 'Cristo Redentor', 'Torre Eiffel', 'iglu', 'barraca'] },
    pessoas: { name: 'Profissões e personagens', words: ['médico', 'bombeiro', 'policial', 'professor', 'cozinheiro', 'palhaço', 'astronauta',
      'pirata', 'mágico', 'pintor', 'jogador de futebol', 'cantor', 'dentista', 'carteiro', 'pescador', 'piloto', 'mergulhador', 'ninja',
      'rei', 'princesa', 'fantasma', 'vampiro', 'zumbi', 'bruxa', 'robô', 'super-herói', 'padeiro', 'goleiro', 'sereia', 'alienígena',
      'cowboy', 'detetive', 'Papai Noel', 'anjo', 'esqueleto'] },
    acoes: { name: 'Ações', words: ['dormir', 'correr', 'nadar', 'dançar', 'cantar', 'chorar', 'rir', 'pular', 'voar', 'pescar', 'cozinhar',
      'ler', 'pintar', 'dirigir', 'surfar', 'espirrar', 'bocejar', 'abraçar', 'tomar banho', 'escovar os dentes', 'jogar bola',
      'andar de bicicleta', 'tirar foto', 'fazer careta', 'acampar', 'patinar', 'mergulhar', 'tocar violão', 'regar plantas', 'empinar pipa'] },
  };
  const THEMES = Object.assign({ geral: { name: 'Tudo misturado', words: [].concat(...Object.keys(T).map((k) => T[k].words)) } }, T);

  const CSS = `
  .dz { display: flex; flex-direction: column; gap: 8px; }
  .dz-top { display: flex; align-items: center; gap: 10px; }
  .dz-word { flex: 1; min-width: 0; font-size: 22px; font-weight: 800; letter-spacing: .12em; white-space: pre-wrap; overflow-wrap: anywhere; }
  .dz-word small { font-size: 12px; font-weight: 500; letter-spacing: 0; color: #8a919b; margin-left: 6px; }
  .dz-time { font-size: 18px; font-weight: 800; color: #f5c000; min-width: 44px; text-align: right; }
  .dz-main { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 10px; align-items: start; }
  .dz-cw { position: relative; width: min(100%, calc((100dvh - 350px) * 4 / 3)); min-width: 220px; margin: 0 auto; }
  .dz-cw canvas { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 10px; background: #fff; touch-action: none; }
  .dz-cw.can canvas { cursor: crosshair; }
  .dz-over { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    padding: 14px; border-radius: 10px; background: rgba(15,17,21,.86); text-align: center; color: #eaeaea; }
  .dz-over[hidden] { display: none; }
  .dz-over .big { font-size: 26px; font-weight: 800; overflow-wrap: anywhere; }
  .dz-picks { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .dz-picks button { padding: 12px 16px; border-radius: 12px; background: #3ddc97; color: #06140d; font-size: 16px; font-weight: 800; }
  .dz-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .dz-players { display: flex; flex-direction: column; gap: 3px; }
  .dz-players div { display: flex; justify-content: space-between; gap: 6px; padding: 5px 8px; border-radius: 8px; background: #1b1f26; font-size: 13px; }
  .dz-players div.me { outline: 1px solid #5b8cff; }
  .dz-players div.hit { background: rgba(61,220,151,.16); }
  .dz-players span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dz-players b { color: #f5c000; }
  .dz-feed { display: flex; flex-direction: column; gap: 2px; height: 180px; overflow-y: auto; padding: 6px 8px; border-radius: 8px; background: #0f1115; font-size: 13px; overflow-wrap: anywhere; }
  .dz-feed .ok { color: #3ddc97; font-weight: 700; }
  .dz-feed .close { color: #ff9f43; font-weight: 600; }
  .dz-tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; background: #ff9f43; color: #1a0e00; font-size: 11px; font-weight: 800; }
  .dz-feed .sys { color: #8a919b; font-style: italic; }
  .dz-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 5px; }
  .dz-sw { width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 2px solid #2a2e37; }
  .dz-sw.on { border-color: #fff; box-shadow: 0 0 0 2px #5b8cff; }
  .dz-tb { min-width: 32px; height: 32px; padding: 0 7px; border-radius: 9px; background: #22252d; border: 1px solid #2a2e37; color: #eaeaea; font-size: 15px; }
  .dz-tb.on { border-color: #5b8cff; background: #2a3550; }
  .dz-dot { display: inline-block; border-radius: 50%; background: #eaeaea; vertical-align: middle; }
  .dz-sep { width: 1px; height: 24px; background: #2a2e37; margin: 0 2px; }
  @media (max-width: 640px) {
    .dz-main { grid-template-columns: minmax(0, 1fr); }
    .dz-cw { width: min(100%, calc((100dvh - 360px) * 4 / 3)); }
    .dz-players { flex-direction: row; flex-wrap: wrap; }
    .dz-feed { height: 96px; }
    .dz-word { font-size: 18px; }
  }`;

  // quantas letras faltam, sobram, trocam ou estão invertidas ("baleai" fica a 1 de "baleia")
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    let pp = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      }
      pp = prev; prev = cur;
    }
    return prev[b.length];
  }
  // chute "perto" (g e w já normalizados): uma letra errada, mesma raiz ("feijoada" para "feijão") ou parte da resposta
  function closeTo(g, w) {
    if (w.length < 3 || g.length < 3) return false;
    const gw = g.replace(/ /g, ''), ww = w.replace(/ /g, '');
    if (ww.length >= 4 && lev(gw, ww) <= Math.max(1, Math.floor(ww.length / 4))) return true;
    let p = 0;
    while (p < gw.length && p < ww.length && gw[p] === ww[p]) p++;
    if (p >= 4 && p >= Math.ceil(Math.min(gw.length, ww.length) * 0.6)) return true;
    if (ww.length >= 4 && gw.includes(ww)) return true;
    return w.includes(' ') && w.split(' ').some((part) => part.length >= 3 && part === g);
  }
  const isLetter = (ch) => /[a-zà-öø-ÿ]/i.test(ch);
  const maskOf = (w) => [...w].map((ch) => (isLetter(ch) ? '_' : ch)).join('');
  const letterCount = (w) => [...w].filter(isLetter).length;
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function start(ctx) {
    const { el, api } = ctx;
    if (!document.getElementById('dz-css')) { const st = el('style'); st.id = 'dz-css'; st.textContent = CSS; document.head.appendChild(st); }
    try { ctx.body.parentElement.style.width = 'min(920px, calc(100vw - 20px))'; } catch (e) {}

    const S = ctx.state = {
      closed: false, timers: [], tick: null,
      cfg: { theme: 'geral', rounds: 2, limit: 80 },
      phase: 'setup', n: 0, drawer: null, round: 0, rounds: 0, total: 0, limit: 80, t0: 0,
      mask: '', word: null, hitters: new Set(), scores: {}, used: new Set(),
      ops: [], strokes: new Map(), sid: 0, feed: [], ui: null,
      tool: 'pen', color: 0, size: 1, myHit: false, lastGuess: '', gk: 0, myGuesses: {},
      m: null,   // estado só do mestre
    };
    const me = ctx.me;
    const later = (fn, ms) => { const t = setTimeout(() => { if (!S.closed) fn(); }, ms); S.timers.push(t); return t; };
    const present = (id) => ctx.people().includes(id);

    // ---------------- fila de envio (uma mensagem a cada 60 ms, juntando traços) ----------------
    const Q = []; let qTimer = null, lastSent = 0;
    function emit(a, d) {
      const last = Q[Q.length - 1];
      if (a === 'seg' && last && last[0] === 'seg' && last[1].i === d.i && last[1].n === d.n && last[1].p.length < 600) last[1].p = last[1].p.concat(d.p);
      else Q.push([a, d]);
      pump();
    }
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

    // ---------------- telas ----------------
    function screenSetup() {
      S.phase = 'setup'; S.ui = null;
      const b = ctx.body; b.replaceChildren();
      ctx.setStatus('');
      if (!ctx.isMaster) { b.append(el('div', 'jg-center jg-muted', 'Esperando ' + ctx.nameOf(ctx.master) + ' escolher o tema…')); return; }
      b.append(el('div', 'jg-muted', 'Tema das palavras'));
      const chips = el('div', 'jg-chips'); chips.style.margin = '6px 0 12px';
      Object.keys(THEMES).forEach((k) => {
        const ch = el('button', 'jg-chip' + (S.cfg.theme === k ? ' on' : ''), THEMES[k].name);
        ch.onclick = () => { S.cfg.theme = k; screenSetup(); };
        chips.append(ch);
      });
      const row = el('div', 'jg-row');
      const rs = el('select', 'jg-select');
      [1, 2, 3].forEach((n) => { const o = el('option', '', 'Cada um desenha ' + n + 'x'); o.value = n; o.selected = n === S.cfg.rounds; rs.append(o); });
      rs.onchange = () => { S.cfg.rounds = Number(rs.value); };
      const ts = el('select', 'jg-select');
      [60, 80, 100, 120].forEach((n) => { const o = el('option', '', n + ' s por desenho'); o.value = n; o.selected = n === S.cfg.limit; ts.append(o); });
      ts.onchange = () => { S.cfg.limit = Number(ts.value); };
      const enough = ctx.people().length >= 2;
      const go = el('button', 'jg-btn', 'Começar ▶'); go.disabled = !enough; go.onclick = () => masterBegin();
      row.append(rs, ts, go);
      const tip = el('div', 'jg-muted'); tip.style.marginTop = '12px';
      tip.textContent = enough ? 'Na sua vez, escolha 1 de 3 palavras e desenhe. Os outros chutam no campo de resposta: quem acerta primeiro ganha mais.'
        : 'Precisa de pelo menos 2 pessoas na sala para jogar.';
      b.append(chips, row, tip);
    }

    function screenGame() {
      const b = ctx.body; b.replaceChildren();
      const root = el('div', 'dz');
      const top = el('div', 'dz-top'); const word = el('div', 'dz-word'); const time = el('div', 'dz-time'); top.append(word, time);
      const bar = el('div', 'jg-bar'); const fill = el('i'); fill.style.width = '100%'; bar.append(fill);
      const main = el('div', 'dz-main');
      const cw = el('div', 'dz-cw'); const cv = el('canvas'); cv.width = W; cv.height = H;
      const over = el('div', 'dz-over'); over.hidden = true; cw.append(cv, over);
      const side = el('div', 'dz-side'); const players = el('div', 'dz-players'); const feed = el('div', 'dz-feed'); side.append(players, feed);
      main.append(cw, side);
      const bottom = el('div');
      root.append(top, bar, main, bottom);
      b.append(root);
      const g = cv.getContext('2d', { willReadFrequently: true });
      S.ui = { word, time, fill, cw, cv, g, over, players, feed, bottom };
      bindCanvas();
      redraw();
      renderFeed();
      renderAll();
    }

    function renderAll() {
      if (!S.ui) return;
      renderWord(); renderPlayers(); renderBottom(); renderOverlay(); updateTimer();
      ctx.setStatus(S.phase === 'final' ? 'fim' : 'vez ' + S.n + '/' + S.total + (S.drawer ? ' · ' + (S.drawer === me ? 'você desenha' : ctx.nameOf(S.drawer) + ' desenha') : ''));
      S.ui.cw.classList.toggle('can', S.drawer === me && S.phase === 'draw');
    }
    function renderWord() {
      const u = S.ui; u.word.replaceChildren();
      if (S.drawer === me && S.word) { u.word.append('Desenhe: ' + S.word.toUpperCase()); return; }
      if (S.myHit && S.lastGuess) { u.word.append('✅ ' + S.lastGuess.toUpperCase()); return; }
      if (!S.mask) { u.word.append(el('small', '', S.phase === 'pick' ? 'escolhendo a palavra…' : '')); return; }
      u.word.append([...S.mask].map((ch) => (ch === ' ' ? '  ' : ch)).join(' ').toUpperCase());
      const parts = S.mask.split(/[\s-]+/).filter(Boolean).map((w) => [...w].filter((c) => c === '_' || isLetter(c)).length);
      u.word.append(el('small', '', '(' + parts.join(' ') + ')'));
    }
    function renderPlayers() {
      const u = S.ui; u.players.replaceChildren();
      const ids = Object.keys(S.scores);
      ctx.people().forEach((id) => { if (!ids.includes(id)) ids.push(id); });
      ids.sort((a, c) => (S.scores[c] || 0) - (S.scores[a] || 0)).forEach((id) => {
        const r = el('div', (id === me ? 'me ' : '') + (S.hitters.has(id) ? 'hit' : ''));
        r.append(el('span', '', (id === S.drawer ? '✏️ ' : S.hitters.has(id) ? '✅ ' : '') + ctx.nameOf(id)), el('b', '', String(S.scores[id] || 0)));
        u.players.append(r);
      });
    }
    // tag: etiqueta depois do texto (o "perto!" dos chutes quase certos)
    const feedEl = (f) => { const d = el('div', f.cls || '', f.text); if (f.tag) d.append(el('span', 'dz-tag', f.tag)); return d; };
    function feedLine(text, cls, tag) {
      const f = { text, cls, tag };
      S.feed.push(f); if (S.feed.length > 60) S.feed.shift();
      if (S.ui) { S.ui.feed.append(feedEl(f)); while (S.ui.feed.childNodes.length > 60) S.ui.feed.firstChild.remove(); S.ui.feed.scrollTop = S.ui.feed.scrollHeight; }
    }
    function renderFeed() { const u = S.ui; u.feed.replaceChildren(...S.feed.map(feedEl)); u.feed.scrollTop = u.feed.scrollHeight; }

    function renderBottom() {
      const u = S.ui;
      // só refaz quando muda algo que aparece aqui: assim não apaga o chute que a pessoa está digitando
      const key = [S.n, S.phase, S.drawer === me, S.myHit, S.tool, S.color, S.size].join('|');
      if (u.bottomKey === key) return;
      u.bottomKey = key; u.bottom.replaceChildren();
      if (S.phase !== 'draw' && S.phase !== 'pick') return;
      if (S.drawer === me) {
        if (S.phase !== 'draw') return;
        const tools = el('div', 'dz-tools');
        COLORS.forEach((c, i) => {
          const sw = el('button', 'dz-sw' + (S.color === i && S.tool !== 'eraser' ? ' on' : '')); sw.style.background = c; sw.title = 'Cor';
          sw.onclick = () => { S.color = i; if (S.tool === 'eraser') S.tool = 'pen'; renderBottom(); };
          tools.append(sw);
        });
        tools.append(el('span', 'dz-sep'));
        SIZES.forEach((s, i) => {
          const bt = el('button', 'dz-tb' + (S.size === i ? ' on' : '')); bt.title = 'Espessura';
          const dot = el('span', 'dz-dot'); const px = Math.max(4, Math.round(s / 2.2)); dot.style.width = dot.style.height = px + 'px';
          bt.append(dot); bt.onclick = () => { S.size = i; renderBottom(); };
          tools.append(bt);
        });
        tools.append(el('span', 'dz-sep'));
        const tb = (label, title, on, fn) => { const x = el('button', 'dz-tb' + (on ? ' on' : ''), label); x.title = title; x.onclick = fn; tools.append(x); };
        tb('✏️', 'Lápis', S.tool === 'pen', () => { S.tool = 'pen'; renderBottom(); });
        tb('🧽', 'Borracha', S.tool === 'eraser', () => { S.tool = 'eraser'; renderBottom(); });
        tb('🪣', 'Balde de tinta', S.tool === 'fill', () => { S.tool = 'fill'; renderBottom(); });
        tb('↩️', 'Desfazer', false, () => { if (S.ops.length) { emitAll('undo', { n: S.n }); } });
        tb('🗑️', 'Limpar tudo', false, () => { if (S.ops.length && confirm('Apagar o desenho todo?')) emitAll('clear', { n: S.n }); });
        tb('⏭️', 'Pular a vez', false, () => { if (confirm('Pular sua vez? Ninguém ganha pontos nesse desenho.')) emitAll('skip', { n: S.n }); });
        u.bottom.append(tools);
        return;
      }
      const row = el('form', 'jg-row');
      const inp = el('input', 'jg-input'); inp.maxLength = 60; inp.autocomplete = 'off';
      inp.placeholder = S.myHit ? 'Você acertou! Espere a próxima vez' : S.phase === 'pick' ? 'Espere o desenho começar…' : 'Seu chute…';
      inp.disabled = S.myHit || S.phase !== 'draw';
      const send = el('button', 'jg-btn', 'Chutar'); send.type = 'submit'; send.disabled = inp.disabled;
      row.onsubmit = (e) => {
        e.preventDefault();
        const t = api.cleanText(inp.value).slice(0, 60);
        if (!t || S.myHit || S.phase !== 'draw') return;
        inp.value = '';
        S.lastGuess = t;
        const k = ++S.gk; S.myGuesses[k] = t;   // a resposta de "perto" volta só com o número do chute
        emit('guess', { n: S.n, t, k });
      };
      row.append(inp, send);
      u.bottom.append(row);
      // foca o campo sozinho só no computador, e só se a pessoa não estiver digitando em outro lugar (no chat, por exemplo)
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      if (!inp.disabled && !touch) setTimeout(() => {
        try {
          const a = document.activeElement;
          if (!S.closed && (!a || a === document.body || ctx.body.contains(a))) inp.focus({ preventScroll: true });
        } catch (e) {}
      }, 30);
    }

    function renderOverlay() {
      const u = S.ui, o = u.over; o.replaceChildren(); o.hidden = false;
      if (S.phase === 'pick') {
        if (S.drawer === me && S.options) {
          o.append(el('div', 'big', 'Sua vez de desenhar!'), el('div', 'jg-muted', 'Escolha uma palavra:'));
          const picks = el('div', 'dz-picks');
          S.options.forEach((w) => { const bt = el('button', '', w); bt.onclick = () => choose(w); picks.append(bt); });
          o.append(picks);
          if (!S.rerolled) { const rr = el('button', 'jg-btn ghost', '🔄 Outras palavras'); rr.onclick = () => { S.rerolled = true; S.options = pickOptions(); renderOverlay(); }; o.append(rr); }
          const left = el('div', 'jg-muted'); left.dataset.pickLeft = '1'; o.append(left);
        } else {
          o.append(el('div', 'big', '✏️ ' + ctx.nameOf(S.drawer)), el('div', 'jg-muted', 'está escolhendo a palavra…'));
        }
        return;
      }
      if (S.phase === 'stop') {
        o.append(el('div', 'big', S.stopText || 'Fim da vez'), el('div', 'jg-muted', 'Revelando a palavra…'));
        return;
      }
      if (S.phase === 'result') {
        o.append(el('div', 'jg-muted', S.stopText || ''), el('div', 'jg-muted', 'A palavra era'), el('div', 'big', S.revealed ? S.revealed.toUpperCase() : '???'));
        const g = S.gains || {};
        const list = el('div', 'jg-score'); list.style.minWidth = '220px';
        Object.keys(g).sort((a, c) => g[c] - g[a]).forEach((id) => { const r = el('div'); r.append(el('span', '', ctx.nameOf(id)), el('b', '', '+' + g[id])); list.append(r); });
        if (!Object.keys(g).length) list.append(el('div', 'jg-muted jg-center', 'Ninguém acertou dessa vez'));
        o.append(list, el('div', 'jg-muted', S.n < S.total ? 'Próxima vez já já…' : 'Contando o resultado…'));
        return;
      }
      o.hidden = true;
    }

    function updateTimer() {
      if (!S.ui) return;
      if (S.phase === 'pick' && S.drawer === me && S.pickUntil) {
        const left = Math.max(0, Math.ceil((S.pickUntil - Date.now()) / 1000));
        const lb = S.ui.over.querySelector('[data-pick-left]'); if (lb) lb.textContent = 'Escolha automática em ' + left + 's';
        if (left <= 0 && S.options && !S.word) choose(S.options[0]);
      }
      if (S.phase !== 'draw') { S.ui.time.textContent = ''; S.ui.fill.style.width = S.phase === 'pick' ? '100%' : '0%'; return; }
      const rest = Math.max(0, S.limit - (Date.now() - S.t0) / 1000);
      S.ui.fill.style.width = (rest / S.limit * 100) + '%';
      S.ui.time.textContent = Math.ceil(rest) + 's';
    }

    // ---------------- desenho ----------------
    function drawStroke(op, from) {
      const g = S.ui && S.ui.g; if (!g) return;
      const p = op.p; if (p.length < 2) return;
      g.strokeStyle = g.fillStyle = COLORS[op.c] || '#000';
      g.lineWidth = op.w; g.lineCap = 'round'; g.lineJoin = 'round';
      if (p.length === 2) { g.beginPath(); g.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2); g.fill(); return; }
      const s = Math.max(0, from - 2);
      g.beginPath(); g.moveTo(p[s], p[s + 1]);
      for (let k = s + 2; k < p.length; k += 2) g.lineTo(p[k], p[k + 1]);
      if (s === 0 && p.length === 4 && p[0] === p[2] && p[1] === p[3]) { g.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2); g.fill(); return; }
      g.stroke();
    }
    function floodFill(x, y, c) {
      const g = S.ui && S.ui.g; if (!g) return;
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const img = g.getImageData(0, 0, W, H), d = img.data;
      const [r, gg, b] = hexRgb(COLORS[c] || '#000');
      const i0 = (y * W + x) * 4;
      const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
      if (Math.abs(tr - r) < 4 && Math.abs(tg - gg) < 4 && Math.abs(tb - b) < 4) return;
      const TOL = 60;
      const same = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= TOL;
      const seen = new Uint8Array(W * H);
      const stack = [x, y];
      while (stack.length) {
        const py = stack.pop(), px0 = stack.pop();
        let px = px0;
        while (px >= 0 && !seen[py * W + px] && same((py * W + px) * 4)) px--;
        px++;
        let up = false, down = false;
        while (px < W && !seen[py * W + px] && same((py * W + px) * 4)) {
          const k = py * W + px, i = k * 4;
          seen[k] = 1; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
          if (py > 0) { const ok = !seen[k - W] && same(i - W * 4); if (ok && !up) { stack.push(px, py - 1); up = true; } else if (!ok) up = false; }
          if (py < H - 1) { const ok = !seen[k + W] && same(i + W * 4); if (ok && !down) { stack.push(px, py + 1); down = true; } else if (!ok) down = false; }
          px++;
        }
      }
      g.putImageData(img, 0, 0);
    }
    function redraw() {
      const g = S.ui && S.ui.g; if (!g) return;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      S.ops.forEach((op) => { if (op.t === 's') drawStroke(op, 0); else if (op.t === 'f') floodFill(op.x, op.y, op.c); });
    }
    function applyOp(a, d) {
      if (a === 'seg') {
        if (!Number.isInteger(d.i) || !Array.isArray(d.p)) return;
        const c = Number.isInteger(d.c) && d.c >= 0 && d.c < COLORS.length ? d.c : 0;
        const w = SIZES.includes(d.w) ? d.w : SIZES[1];
        const pts = d.p.slice(0, 2400).map((v, k) => Math.max(0, Math.min(k % 2 ? H : W, Math.round(Number(v) || 0))));
        if (pts.length % 2) pts.pop();
        let op = S.strokes.get(d.i);
        if (!op) { op = { t: 's', i: d.i, c, w, p: [] }; S.strokes.set(d.i, op); S.ops.push(op); }
        const from = op.p.length; op.p.push(...pts);
        drawStroke(op, from);
      } else if (a === 'fill') {
        const op = { t: 'f', x: Number(d.x) || 0, y: Number(d.y) || 0, c: Number.isInteger(d.c) && d.c >= 0 && d.c < COLORS.length ? d.c : 0 };
        S.ops.push(op); floodFill(op.x, op.y, op.c);
      } else if (a === 'undo') {
        const op = S.ops.pop(); if (op && op.t === 's') S.strokes.delete(op.i); redraw();
      } else if (a === 'clear') {
        S.ops = []; S.strokes = new Map(); redraw();
      }
    }
    function bindCanvas() {
      const cv = S.ui.cv; let cur = null, lx = 0, ly = 0;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * W / r.width), Math.round((e.clientY - r.top) * H / r.height)]; };
      cv.addEventListener('pointerdown', (e) => {
        if (S.drawer !== me || S.phase !== 'draw') return;
        e.preventDefault();
        const [x, y] = pos(e);
        if (S.tool === 'fill') { emitAll('fill', { n: S.n, x, y, c: S.color }); return; }
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        const id = ++S.sid;
        const c = S.tool === 'eraser' ? ERASER : S.color, w = SIZES[S.size];
        cur = { id, c, w }; lx = x; ly = y;
        applyOp('seg', { i: id, c, w, p: [x, y] });
        emit('seg', { n: S.n, i: id, c, w, p: [x, y] });
      });
      cv.addEventListener('pointermove', (e) => {
        if (!cur || S.phase !== 'draw') return;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        const pts = [];
        (evs.length ? evs : [e]).forEach((ev) => { const [x, y] = pos(ev); if (Math.abs(x - lx) + Math.abs(y - ly) >= 3) { pts.push(x, y); lx = x; ly = y; } });
        if (!pts.length) return;
        applyOp('seg', { i: cur.id, c: cur.c, w: cur.w, p: pts });
        emit('seg', { n: S.n, i: cur.id, c: cur.c, w: cur.w, p: pts });
      });
      const end = () => { cur = null; };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('lostpointercapture', end);
    }

    // ---------------- quem desenha ----------------
    function pickOptions() {
      const words = THEMES[S.theme] ? THEMES[S.theme].words : THEMES.geral.words;
      const free = words.filter((w) => !S.used.has(ctx.norm(w)));
      return ctx.shuffle(free.length >= 3 ? free : words).slice(0, 3);
    }
    function choose(w) {
      if (S.phase !== 'pick' || S.drawer !== me || S.word) return;
      S.word = w; S.used.add(ctx.norm(w));
      emitAll('chosen', { n: S.n, mask: maskOf(w) });
      renderAll();
    }
    function scheduleHints() {
      const w = S.word; if (!w) return;
      const L = letterCount(w), n = S.n;
      const reveal = () => {
        if (S.n !== n || S.phase !== 'draw') return;
        const idx = [...S.mask].map((ch, i) => (ch === '_' ? i : -1)).filter((i) => i >= 0);
        if (idx.length <= 2) return;
        const i = idx[ctx.rnd(idx.length)];
        const m = [...S.mask]; m[i] = [...w][i];
        emitAll('hint', { n, mask: m.join('') });
      };
      if (L >= 4) later(reveal, S.limit * 500);
      if (L >= 6) later(reveal, S.limit * 750);
    }
    function checkGuess(from, t, k) {
      if (S.hitters.has(from) || from === me) return;
      const g = ctx.norm(t), w = ctx.norm(S.word);
      if (!g) return;
      const ok = g === w || (' ' + g + ' ').includes(' ' + w + ' ');
      const close = !ok && closeTo(g, w);
      // o chute "perto" não vai para a sala (seria dica para os outros): quem desenha vê aqui, quem chutou vê pelo número k
      if (close) feedLine(ctx.nameOf(from) + ': ' + t, 'close', 'perto');
      emitAll('verdict', { n: S.n, who: from, ok, close, k: Number.isInteger(k) ? k : 0, t: ok || close ? '' : t });
    }

    // ---------------- mestre ----------------
    function masterBegin() {
      const order = ctx.shuffle(ctx.people());
      if (order.length < 2) { api.toast('Precisa de pelo menos 2 pessoas.'); return; }
      const scores = {}; order.forEach((id) => { scores[id] = 0; });
      S.m = { order, total: order.length * S.cfg.rounds, t: 0, phase: 'idle', hits: [], gains: {}, scores, t0: 0, cfg: Object.assign({}, S.cfg) };
      masterNext();
    }
    function masterNext() {
      const M = S.m;
      for (let guard = 0; guard <= M.order.length; guard++) {
        M.t++;
        if (M.t > M.total) { M.phase = 'final'; emitAll('final', { scores: M.scores }); return; }
        const drawer = M.order[(M.t - 1) % M.order.length];
        if (!present(drawer)) continue;
        M.phase = 'pick'; M.hits = []; M.gains = {}; M.drawer = drawer;
        emitAll('turn', { n: M.t, total: M.total, drawer, round: Math.ceil(M.t / M.order.length), rounds: M.cfg.rounds, theme: M.cfg.theme, limit: M.cfg.limit, scores: M.scores });
        M.timer = later(() => masterStop('nopick'), 25000);
        return;
      }
      M.phase = 'final'; emitAll('final', { scores: M.scores });
    }
    function masterStop(reason) {
      const M = S.m; if (!M || (M.phase !== 'pick' && M.phase !== 'draw')) return;
      M.phase = 'stop'; clearTimeout(M.timer);
      emitAll('stop', { n: M.t, reason });
      M.timer = later(() => masterResult(null), 3000);
    }
    function masterResult(word) {
      const M = S.m; if (!M || M.phase !== 'stop') return;
      M.phase = 'result'; clearTimeout(M.timer);
      emitAll('res', { n: M.t, word, scores: M.scores, gains: M.gains });
      M.timer = later(masterNext, 6000);
    }
    function masterHandle(from, a, d) {
      const M = S.m; if (!M || d.n !== M.t) return;
      if (a === 'chosen' && from === M.drawer && M.phase === 'pick') {
        clearTimeout(M.timer);
        M.phase = 'draw'; M.t0 = Date.now();
        M.mask = typeof d.mask === 'string' ? d.mask.slice(0, 40) : '';
        emitAll('go', { n: M.t, mask: M.mask, limit: M.cfg.limit });
        M.timer = later(() => masterStop('time'), M.cfg.limit * 1000);
      } else if (a === 'hint' && from === M.drawer) {
        if (typeof d.mask === 'string') M.mask = d.mask.slice(0, 40);
      } else if (a === 'verdict' && from === M.drawer && M.phase === 'draw' && d.ok) {
        const who = String(d.who || '');
        if (!who || who === M.drawer || M.hits.includes(who)) return;
        const rank = M.hits.length; M.hits.push(who);
        const pts = Math.max(5, 10 - rank), dpts = rank === 0 ? 10 : 1;
        M.scores[who] = (M.scores[who] || 0) + pts; M.scores[M.drawer] = (M.scores[M.drawer] || 0) + dpts;
        M.gains[who] = (M.gains[who] || 0) + pts; M.gains[M.drawer] = (M.gains[M.drawer] || 0) + dpts;
        emitAll('hit', { n: M.t, who, pts, dpts, scores: M.scores });
        const guessers = ctx.people().filter((id) => id !== M.drawer);
        if (guessers.length && guessers.every((id) => M.hits.includes(id))) masterStop('all');
      } else if (a === 'skip' && from === M.drawer) {
        masterStop('skip');
      } else if (a === 'reveal' && from === M.drawer && M.phase === 'stop') {
        masterResult(typeof d.word === 'string' ? d.word.slice(0, 40) : null);
      }
    }
    // quem desenha saiu da sala: a vez acaba
    S.watch = setInterval(() => {
      const M = S.m;
      if (ctx.isMaster && M && (M.phase === 'pick' || M.phase === 'draw') && !present(M.drawer)) masterStop('left');
    }, 2000);

    // ---------------- todos ----------------
    const STOP_TEXT = { time: '⏰ Acabou o tempo!', all: '🎉 Todo mundo acertou!', skip: '⏭️ Pulou a vez', left: '🚪 Quem desenhava saiu', nopick: '⌛ Não escolheu a palavra' };
    function clean(o) { const r = {}; if (o && typeof o === 'object') Object.keys(o).slice(0, 40).forEach((k) => { const v = Number(o[k]); if (Number.isFinite(v)) r[String(k).slice(0, 80)] = Math.round(v); }); return r; }

    function handle(from, a, d) {
      if (S.closed || typeof a !== 'string' || !d || typeof d !== 'object') return;
      if (ctx.isMaster) masterHandle(from, a, d);

      if (from === ctx.master) {
        if (a === 'turn') { onTurn(d); return; }
        if (a === 'final') { onFinal(d); return; }
        if (a === 'sync') { onSync(d); return; }
        if (a === 'syncops') { onSyncOps(d); return; }
        if (d.n === S.n) {
          if (a === 'go') {
            S.phase = 'draw'; S.mask = typeof d.mask === 'string' ? d.mask.slice(0, 40) : '';
            S.limit = Math.min(300, Number(d.limit) || 80);
            const rest = Number(d.rest) > 0 ? Math.min(S.limit, Number(d.rest)) : S.limit;
            S.t0 = Date.now() - (S.limit - rest) * 1000;
            if (S.drawer === me) scheduleHints();
            feedLine(S.drawer === me ? 'Desenhe! Os outros estão chutando.' : '✏️ ' + ctx.nameOf(S.drawer) + ' começou a desenhar', 'sys');
            renderAll(); return;
          }
          if (a === 'hit') {
            const who = String(d.who || '');
            S.scores = clean(d.scores); S.hitters.add(who);
            if (who === me) S.myHit = true;
            feedLine('🎉 ' + ctx.nameOf(who) + ' acertou! +' + (Number(d.pts) || 0), 'ok');
            renderAll(); return;
          }
          if (a === 'stop') {
            S.phase = 'stop'; S.stopText = STOP_TEXT[d.reason] || 'Fim da vez';
            if (S.drawer === me) emitAll('reveal', { n: S.n, word: S.word || '' });
            renderAll(); return;
          }
          if (a === 'res') {
            S.phase = 'result'; S.scores = clean(d.scores); S.gains = clean(d.gains);
            if (typeof d.word === 'string' && d.word) S.revealed = api.cleanText(d.word).slice(0, 40);
            if (S.revealed) { S.used.add(ctx.norm(S.revealed)); feedLine('A palavra era: ' + S.revealed, 'sys'); }
            renderAll(); return;
          }
        }
      }

      if (from === S.drawer && d.n === S.n) {
        if (a === 'seg' || a === 'fill' || a === 'undo' || a === 'clear') { if (from !== me) applyOp(a, d); else if (a !== 'seg') applyOp(a, d); return; }
        if (a === 'hint') { if (typeof d.mask === 'string' && from !== me) S.mask = d.mask.slice(0, 40); else if (from === me) S.mask = d.mask; renderWord(); feedLine('💡 Dica: uma letra apareceu', 'sys'); return; }
        if (a === 'verdict') {
          const who = String(d.who || ''); const t = api.cleanText(d.t || '').slice(0, 60);
          if (d.ok) { if (who === me) { S.myHit = true; renderAll(); } return; }
          if (d.close) {
            if (who === me) feedLine('Você: ' + (S.myGuesses[d.k] || S.lastGuess), 'close', 'perto!');
            else if (S.drawer !== me) feedLine(ctx.nameOf(who) + ' chutou algo perto!', 'close');
          } else feedLine(ctx.nameOf(who) + ': ' + t);
          return;
        }
        if (a === 'reveal') { if (typeof d.word === 'string' && d.word) S.revealed = api.cleanText(d.word).slice(0, 40); return; }
      }

      if (a === 'guess' && S.drawer === me && d.n === S.n && S.phase === 'draw' && typeof d.t === 'string') checkGuess(from, api.cleanText(d.t).slice(0, 60), d.k);
    }

    function resetTurn(d) {
      S.n = d.n; S.total = Number(d.total) || 1; S.drawer = String(d.drawer || ''); S.round = Number(d.round) || 1; S.rounds = Number(d.rounds) || 1;
      S.theme = THEMES[d.theme] ? d.theme : 'geral'; S.limit = Math.min(300, Number(d.limit) || 80);
      S.scores = clean(d.scores); S.hitters = new Set(); S.myHit = false; S.lastGuess = ''; S.myGuesses = {};
      S.mask = ''; S.word = null; S.revealed = null; S.gains = {}; S.stopText = '';
      S.ops = []; S.strokes = new Map(); S.options = null; S.rerolled = false; S.pickUntil = 0;
    }
    function onTurn(d) {
      if (!Number.isInteger(d.n)) return;
      if (S.n === d.n && S.phase !== 'setup' && S.phase !== 'final') return;
      if (d.n === 1) S.feed = [];
      resetTurn(d);
      S.phase = 'pick';
      if (S.drawer === me) { S.options = pickOptions(); S.pickUntil = Date.now() + 15000; }
      if (!S.ui) screenGame(); else { redraw(); renderAll(); }
      feedLine('— Vez ' + S.n + ' de ' + S.total + ': ' + (S.drawer === me ? 'você desenha' : ctx.nameOf(S.drawer) + ' desenha') + ' —', 'sys');
      clearInterval(S.tick); S.tick = setInterval(updateTimer, 250);
    }
    function onFinal(d) {
      if (S.phase === 'final') return;
      S.phase = 'final'; clearInterval(S.tick); S.ui = null;
      S.scores = clean(d.scores);
      ctx.setStatus('fim');
      const b = ctx.body; b.replaceChildren();
      const ids = Object.keys(S.scores).sort((a, c) => S.scores[c] - S.scores[a]);
      // empate divide a medalha: a posição é quantos fizeram mais pontos
      const place = (id) => ids.filter((x) => S.scores[x] > S.scores[id]).length;
      const MEDAL = ['🥇', '🥈', '🥉'];
      b.append(el('div', 'jg-center jg-big', '🏆'));
      const pod = el('div', 'jg-podium');
      [[1, 'p2'], [0, 'p1'], [2, 'p3']].forEach(([i, cls]) => {
        const id = ids[i]; const x = el('div', id ? ['p1', 'p2', 'p3'][place(id)] || cls : cls);
        if (id) x.append(el('div', 'em', MEDAL[place(id)] || '🏅'), el('div', '', ctx.nameOf(id)), el('b', '', S.scores[id] + ' pts')); else x.style.visibility = 'hidden';
        pod.append(x);
      });
      const list = el('div', 'jg-score');
      ids.forEach((id) => { const r = el('div', id === me ? 'me' : ''); r.append(el('span', '', ctx.nameOf(id)), el('b', '', String(S.scores[id]))); list.append(r); });
      b.append(pod, list);
      const row = el('div', 'jg-row'); row.style.cssText = 'margin-top:12px;justify-content:center';
      if (ctx.isMaster) {
        const again = el('button', 'jg-btn', 'Jogar de novo'); again.onclick = () => { S.m = null; S.n = 0; S.feed = []; screenSetup(); };
        const end = el('button', 'jg-btn ghost', 'Encerrar'); end.onclick = () => ctx.end('Jogo encerrado');
        row.append(again, end);
      } else row.append(el('div', 'jg-muted', 'Aguardando ' + ctx.nameOf(ctx.master) + ' decidir se joga de novo.'));
      b.append(row);
      if (ids.length) api.sysChat('✏️ Desenha e adivinha: ' + ids.slice(0, 3).map((id) => MEDAL[place(id)] + ' ' + ctx.rawName(id) + ' (' + S.scores[id] + ')').join('  '));
    }

    // quem entrou no meio do jogo recebe o estado da vez e o desenho até aqui
    function onSync(d) {
      if (!Number.isInteger(d.n) || ctx.isMaster) return;
      const inTurn = S.n === d.n && S.phase !== 'setup';
      if (!inTurn) {
        resetTurn(d);
        S.phase = ['pick', 'draw', 'stop', 'result'].includes(d.phase) ? d.phase : 'pick';
        S.mask = typeof d.mask === 'string' ? d.mask.slice(0, 40) : '';
        (Array.isArray(d.hits) ? d.hits : []).forEach((id) => S.hitters.add(String(id)));
        const rest = Number(d.rest) > 0 ? Math.min(S.limit, Number(d.rest)) : S.limit;
        S.t0 = Date.now() - (S.limit - rest) * 1000;
        S.wantOps = true;
        if (!S.ui) screenGame(); else { redraw(); renderAll(); }
        clearInterval(S.tick); S.tick = setInterval(updateTimer, 250);
      } else S.wantOps = S.ops.length < (Number(d.count) || 0) && S.ops.length === 0;
    }
    function onSyncOps(d) {
      if (!S.wantOps || d.n !== S.n || !Array.isArray(d.ops)) return;
      d.ops.slice(0, 400).forEach((op) => {
        if (!op || typeof op !== 'object') return;
        if (op.t === 's') applyOp('seg', { i: -1 - S.ops.length, c: op.c, w: op.w, p: op.p });
        else if (op.t === 'f') applyOp('fill', op);
      });
      if (d.last) S.wantOps = false;
    }
    function resync() {
      const M = S.m; if (!M) return;
      if (M.phase === 'final') { emit('final', { scores: M.scores }); return; }
      if (M.phase === 'idle') return;
      const rest = M.phase === 'draw' ? Math.max(3, M.cfg.limit - (Date.now() - M.t0) / 1000) : M.cfg.limit;
      emit('sync', { n: M.t, total: M.total, drawer: M.drawer, round: Math.ceil(M.t / M.order.length), rounds: M.cfg.rounds, theme: M.cfg.theme,
        limit: M.cfg.limit, scores: M.scores, phase: M.phase, mask: M.mask || '', rest, hits: M.hits, count: S.ops.length });
      let chunk = [], size = 0;
      const flushChunk = (last) => { emit('syncops', { n: M.t, ops: chunk, last }); chunk = []; size = 0; };
      S.ops.forEach((op) => {
        let o = op.t === 's' ? { t: 's', c: op.c, w: op.w, p: op.p } : { t: 'f', x: op.x, y: op.y, c: op.c };
        if (o.t === 's' && o.p.length > 800) { const p = []; for (let k = 0; k < o.p.length; k += 4) p.push(o.p[k], o.p[k + 1]); o = Object.assign({}, o, { p }); }
        const s = JSON.stringify(o).length;
        if (chunk.length && size + s > 4500) flushChunk(false);
        chunk.push(o); size += s;
      });
      flushChunk(true);
    }

    S.onMsg = (c, from, a, d) => {
      if (a !== 'b' || !d || !Array.isArray(d.l)) return;
      d.l.slice(0, 300).forEach((x) => { if (Array.isArray(x)) handle(from, x[0], x[1] || {}); });
    };
    S.resync = resync;
    S.destroy = () => { S.closed = true; S.timers.forEach(clearTimeout); clearInterval(S.tick); clearInterval(S.watch); clearTimeout(qTimer); Q.length = 0; };
    screenSetup();
  }

  window.CZJogoDesenho = {
    start,
    onMsg: (ctx, from, a, d) => ctx.state.onMsg(ctx, from, a, d),
    resync: (ctx) => ctx.state.resync(),
    destroy: (ctx) => ctx.state.destroy(),
  };
})();
