// Jogo "Stop" (adedonha): sorteia uma letra, todo mundo preenche as categorias, alguém grita STOP,
// a turma marca as respostas furadas e o mestre conta os pontos (única 10, repetida 5, vazia ou furada 0).
(function () {
  'use strict';

  const CATS = ['Nome', 'Cidade/Estado/País', 'Animal', 'Fruta/Legume', 'Cor', 'Objeto', 'Marca', 'Profissão',
    'Comida', 'Filme/Série', 'Parte do corpo', 'Música/Cantor', 'Time de futebol', 'Minha sogra é…'];
  const DEFAULT_CATS = CATS.slice(0, 8);
  const LETTERS = 'ABCDEFGIJLMNOPRSTUV'.split('');

  function start(ctx) {
    const { el, api } = ctx;
    const S = ctx.state = {
      phase: 'setup', cats: DEFAULT_CATS.slice(), total: 5, limit: 90, n: 0, used: [], scores: {},
      timers: [], tick: null, closed: false, mine: [], last: null,
    };

    function later(fn, ms) { const t = setTimeout(() => { if (!S.closed) fn(); }, ms); S.timers.push(t); return t; }
    const letterOk = (ans, letter) => { const n = ctx.norm(ans); return n.length >= 2 && n[0] === ctx.norm(letter); };

    // ---------------- telas ----------------
    function screenSetup() {
      const b = ctx.body; b.replaceChildren();
      ctx.setStatus('');
      if (!ctx.isMaster) { b.append(el('div', 'jg-center jg-muted', 'Esperando ' + ctx.nameOf(ctx.master) + ' escolher as categorias…')); return; }
      b.append(el('div', 'jg-muted', 'Categorias (toque para ligar/desligar)'));
      const chips = el('div', 'jg-chips'); chips.style.margin = '6px 0 12px';
      CATS.forEach((c) => {
        const on = S.cats.includes(c);
        const ch = el('button', 'jg-chip' + (on ? ' on' : ''), c);
        ch.onclick = () => { S.cats = on ? S.cats.filter((x) => x !== c) : CATS.filter((x) => x === c || S.cats.includes(x)); screenSetup(); };
        chips.append(ch);
      });
      b.append(chips);
      const row = el('div', 'jg-row');
      const rs = el('select', 'jg-select'); [3, 5, 7].forEach((n) => { const o = el('option', '', n + ' rodadas'); o.value = n; o.selected = n === S.total; rs.append(o); });
      rs.onchange = () => { S.total = Number(rs.value); };
      const ts = el('select', 'jg-select'); [60, 90, 120].forEach((n) => { const o = el('option', '', n + ' s por rodada'); o.value = n; o.selected = n === S.limit; ts.append(o); });
      ts.onchange = () => { S.limit = Number(ts.value); };
      const go = el('button', 'jg-btn', 'Começar ▶'); go.disabled = S.cats.length < 3;
      go.onclick = () => masterBegin();
      row.append(rs, ts, go);
      b.append(row);
      const tip = el('div', 'jg-muted'); tip.style.marginTop = '12px';
      tip.textContent = S.cats.length < 3 ? 'Escolha pelo menos 3 categorias.' : 'Quem preencher tudo pode apertar STOP. Depois a turma marca as respostas furadas.';
      b.append(tip);
    }

    function screenRound() {
      const r = S.round, b = ctx.body; b.replaceChildren();
      ctx.setStatus('rodada ' + r.n + '/' + r.total + ' · letra ' + r.letter);
      const top = el('div', 'jg-row'); top.style.justifyContent = 'space-between'; top.style.alignItems = 'flex-end';
      const lt = el('div'); lt.append(el('div', 'jg-muted', 'Rodada ' + r.n + ' de ' + r.total), el('div', 'jg-big', 'Letra ' + r.letter));
      const left = el('b', '', ''); top.append(lt, left);
      const bar = el('div', 'jg-bar'); const fill = el('i'); bar.append(fill); bar.style.margin = '8px 0 12px';
      const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px';
      const inputs = r.cats.map((c, i) => {
        const lab = el('label'); lab.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9aa0a6';
        const inp = el('input', 'jg-input'); inp.maxLength = 40; inp.autocomplete = 'off'; inp.value = S.mine[i] || '';
        inp.placeholder = r.letter + '…';
        inp.oninput = () => { S.mine[i] = inp.value; refresh(); };
        inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const nx = inputs[i + 1]; if (nx) nx.focus(); else stopBtn.focus(); } };
        lab.append(c, inp); grid.append(lab); return inp;
      });
      const stopBtn = el('button', 'jg-btn', 'STOP! ✋'); stopBtn.style.cssText = 'margin-top:12px;width:100%;font-size:16px;background:#ff5a5f;color:#fff';
      stopBtn.onclick = () => { stopBtn.disabled = true; ctx.toMaster('stop', { n: r.n }); };
      const tip = el('div', 'jg-muted jg-center'); tip.style.marginTop = '6px';
      function refresh() {
        const full = inputs.every((x) => api.cleanText(x.value));
        stopBtn.disabled = !full || S.phase !== 'round';
        tip.textContent = full ? 'Tudo preenchido! Aperte STOP para parar todo mundo.' : 'Preencha todas as categorias para poder apertar STOP.';
      }
      b.append(top, bar, grid, stopBtn, tip);
      S.ui = { inputs, fill, left, stopBtn, tip };
      refresh();
      setTimeout(() => { const f = inputs.find((x) => !x.value); if (f) f.focus(); }, 50);
      updateTimer();
    }
    function updateTimer() {
      if (!S.round || !S.ui || S.phase !== 'round') return;
      const rest = Math.max(0, S.round.limit - (Date.now() - S.round.t0) / 1000);
      S.ui.fill.style.width = (rest / S.round.full * 100) + '%';
      S.ui.left.textContent = Math.ceil(rest) + 's';
    }

    function screenReview(d, votes, scored) {
      const b = ctx.body; b.replaceChildren();
      ctx.setStatus('rodada ' + d.n + '/' + d.total + (scored ? ' · pontos' : ' · conferindo'));
      const head = el('div', 'jg-row'); head.style.justifyContent = 'space-between';
      head.append(el('b', '', (scored ? 'Pontos da rodada ' : 'Confira as respostas · letra ') + (scored ? d.n : d.letter)));
      b.append(head);
      if (!scored) { const t = el('div', 'jg-muted', 'Toque numa resposta que você acha furada. Com metade dos votos dos outros, ela vale 0.'); t.style.margin = '4px 0 10px'; b.append(t); }
      const ids = Object.keys(d.rows);
      const inv = new Set((scored ? d.inv : d.auto).map((x) => x[0] + '|' + x[1]));
      d.cats.forEach((c, ci) => {
        const box = el('div'); box.style.cssText = 'margin-bottom:10px';
        box.append(el('div', 'jg-muted', c));
        const list = el('div', 'jg-chips'); list.style.marginTop = '4px';
        ids.forEach((pid) => {
          const ans = d.rows[pid][ci] || '';
          const key = pid + '|' + ci;
          const bad = inv.has(key);
          const v = votes ? (votes[key] || 0) : 0;
          const mineVote = S.myVotes && S.myVotes[key];
          const chip = el('button', 'jg-chip' + (bad ? '' : ' on'));
          chip.style.textDecoration = bad ? 'line-through' : '';
          if (mineVote) chip.style.borderColor = '#ff8a8d';
          let txt = ctx.nameOf(pid) + ': ' + (ans || '—');
          if (scored) txt += '  ' + (d.cell[key] || 0);
          else if (v) txt += '  👎' + v;
          chip.textContent = txt;
          if (!scored && ans && !d.autoSet.has(key) && pid !== ctx.me) {
            chip.onclick = () => { S.myVotes[key] = !S.myVotes[key]; ctx.toMaster('vote', { p: pid, c: ci, v: !!S.myVotes[key] }); screenReview(d, S.votesShown || votes, false); };
          } else chip.disabled = true;
          list.append(chip);
        });
        box.append(list); b.append(box);
      });
      if (scored) b.append(scoreBox(d.scores, d.pts));
      const row = el('div', 'jg-row'); row.style.cssText = 'margin-top:12px;justify-content:center';
      if (ctx.isMaster) {
        if (!scored) { const bt = el('button', 'jg-btn', 'Contar pontos'); bt.onclick = () => masterScore(); row.append(bt); }
        else if (d.n < d.total) { const bt = el('button', 'jg-btn', 'Próxima rodada ▶'); bt.onclick = () => masterRound(); row.append(bt); }
        else { const bt = el('button', 'jg-btn', 'Ver resultado 🏆'); bt.onclick = () => ctx.broadcast('final', { scores: S.scores }); row.append(bt); }
      } else row.append(el('div', 'jg-muted', scored ? 'Aguardando ' + ctx.nameOf(ctx.master) + ' seguir.' : 'Aguardando ' + ctx.nameOf(ctx.master) + ' contar os pontos.'));
      b.append(row);
    }
    function scoreBox(scores, pts) {
      const box = el('div', 'jg-score'); box.style.marginTop = '8px';
      Object.keys(scores).sort((a, c) => scores[c] - scores[a]).forEach((id) => {
        const r = el('div', id === ctx.me ? 'me' : '');
        r.append(el('span', '', ctx.nameOf(id) + (pts && pts[id] != null ? '  (+' + pts[id] + ')' : '')), el('b', '', String(scores[id])));
        box.append(r);
      });
      return box;
    }
    function screenFinal() {
      ctx.setStatus('fim');
      const b = ctx.body; b.replaceChildren();
      const ids = Object.keys(S.scores).sort((a, c) => S.scores[c] - S.scores[a]);
      b.append(el('div', 'jg-center jg-big', '🏆'));
      const pod = el('div', 'jg-podium');
      [[1, '🥈', 'p2'], [0, '🥇', 'p1'], [2, '🥉', 'p3']].forEach(([i, em, cls]) => {
        const id = ids[i]; const d = el('div', cls);
        if (id) d.append(el('div', 'em', em), el('div', '', ctx.nameOf(id)), el('b', '', S.scores[id] + ' pts')); else d.style.visibility = 'hidden';
        pod.append(d);
      });
      b.append(pod, scoreBox(S.scores));
      const row = el('div', 'jg-row'); row.style.cssText = 'margin-top:12px;justify-content:center';
      if (ctx.isMaster) {
        const again = el('button', 'jg-btn', 'Jogar de novo'); again.onclick = () => { S.phase = 'setup'; screenSetup(); };
        const end = el('button', 'jg-btn ghost', 'Encerrar'); end.onclick = () => ctx.end('Jogo encerrado');
        row.append(again, end);
      } else row.append(el('div', 'jg-muted', 'Aguardando ' + ctx.nameOf(ctx.master) + ' decidir se joga de novo.'));
      b.append(row);
      if (ids.length) api.sysChat('🛑 Stop: ' + ids.slice(0, 3).map((id, i) => ['🥇', '🥈', '🥉'][i] + ' ' + ctx.rawName(id) + ' (' + S.scores[id] + ')').join('  '));
    }

    // ---------------- mestre ----------------
    function masterBegin() {
      S.n = 0; S.used = []; S.scores = {}; S.reviewed = S.scored = 0;
      ctx.people().forEach((id) => { S.scores[id] = 0; });
      masterRound();
    }
    function masterRound() {
      S.n++;
      const free = LETTERS.filter((l) => !S.used.includes(l));
      const letter = free[ctx.rnd(free.length)]; S.used.push(letter);
      S.answers = {}; S.votes = {}; S.halted = false;
      S.mRound = { n: S.n, total: S.total, letter, cats: S.cats.slice(), limit: S.limit, t0: Date.now() };
      ctx.broadcast('round', Object.assign({ scores: S.scores }, S.mRound));
      S.limitTimer = later(() => masterHalt(null), S.limit * 1000);
    }
    function masterHalt(by) {
      if (S.halted) return;
      S.halted = true; clearTimeout(S.limitTimer);
      ctx.broadcast('halt', { n: S.n, by });
      S.collectTimer = later(masterReview, 3500);
    }
    function masterReview() {
      if (S.reviewed === S.n) return;
      S.reviewed = S.n; clearTimeout(S.collectTimer);
      const r = S.mRound, rows = {}, auto = [];
      Object.keys(S.answers).forEach((pid) => {
        rows[pid] = r.cats.map((_, i) => api.cleanText(S.answers[pid][i] || '').slice(0, 40));
        rows[pid].forEach((a, i) => { if (!letterOk(a, r.letter)) auto.push([pid, i]); });
        if (!(pid in S.scores)) S.scores[pid] = 0;
      });
      S.rows = rows; S.auto = auto;
      ctx.broadcast('review', { n: r.n, total: r.total, letter: r.letter, cats: r.cats, rows, auto });
    }
    function masterVote(from, d) {
      if (S.reviewed !== S.n || S.scored === S.n) return;
      if (typeof d.p !== 'string' || !Number.isInteger(d.c) || !S.rows[d.p] || d.p === from) return;
      const key = d.p + '|' + d.c;
      S.votes[key] = S.votes[key] || {};
      if (d.v) S.votes[key][from] = 1; else delete S.votes[key][from];
      clearTimeout(S.voteTimer);
      S.voteTimer = later(() => {
        const counts = {}; Object.keys(S.votes).forEach((k) => { const n = Object.keys(S.votes[k]).length; if (n) counts[k] = n; });
        ctx.broadcast('votes', { n: S.n, counts });
      }, 250);
    }
    function masterScore() {
      if (S.scored === S.n) return;
      S.scored = S.n;
      const r = S.mRound, ids = Object.keys(S.rows), pts = {}, cell = {}, inv = S.auto.slice();
      const need = Math.max(1, Math.ceil((ids.length - 1) / 2));
      Object.keys(S.votes).forEach((k) => {
        if (Object.keys(S.votes[k]).length >= need) { const [p, c] = k.split('|'); if (!inv.some((x) => x[0] === p && x[1] === Number(c))) inv.push([p, Number(c)]); }
      });
      const invSet = new Set(inv.map((x) => x[0] + '|' + x[1]));
      ids.forEach((pid) => { pts[pid] = 0; });
      r.cats.forEach((_, ci) => {
        const valid = ids.filter((pid) => !invSet.has(pid + '|' + ci) && S.rows[pid][ci]);
        const count = {}; valid.forEach((pid) => { const k = ctx.norm(S.rows[pid][ci]); count[k] = (count[k] || 0) + 1; });
        valid.forEach((pid) => { const p = count[ctx.norm(S.rows[pid][ci])] > 1 ? 5 : 10; cell[pid + '|' + ci] = p; pts[pid] += p; });
      });
      ids.forEach((pid) => { S.scores[pid] = (S.scores[pid] || 0) + pts[pid]; });
      ctx.broadcast('score', { n: r.n, total: r.total, letter: r.letter, cats: r.cats, rows: S.rows, inv, cell, pts, scores: S.scores });
    }

    // ---------------- todos ----------------
    function onMsg(c, from, a, d) {
      if (S.closed) return;
      if (ctx.isMaster) {
        if (a === 'stop') { if (d.n === S.n && S.mRound && !S.halted) masterHalt(from); return; }
        if (a === 'ans') {
          if (d.n !== S.n || S.reviewed === S.n || !Array.isArray(d.a)) return;
          S.answers[from] = d.a.slice(0, S.mRound.cats.length).map((x) => String(x == null ? '' : x));
          const present = ctx.people();
          if (present.every((id) => S.answers[id])) later(masterReview, 300);
          return;
        }
        if (a === 'vote') { masterVote(from, d); return; }
      }
      if (from !== ctx.master) return;
      if (a === 'round') {
        if (!Number.isInteger(d.n) || !Array.isArray(d.cats) || typeof d.letter !== 'string') return;
        if (S.round && S.round.n === d.n && S.phase === 'round') return;
        S.phase = 'round';
        const cats = d.cats.slice(0, CATS.length).map((x) => api.cleanText(x).slice(0, 30));
        const full = Math.min(300, Number(d.limit) || 90);
        S.round = { n: d.n, total: Number(d.total) || 5, letter: api.cleanText(d.letter).slice(0, 1).toUpperCase(), cats, limit: full, full, t0: Date.now() };
        if (Number(d.rest)) S.round.limit = Math.min(full, Number(d.rest));
        if (d.scores) S.scores = clean(d.scores);
        S.mine = []; S.myVotes = {};
        screenRound();
        clearInterval(S.tick); S.tick = setInterval(updateTimer, 250);
      } else if (a === 'halt') {
        if (!S.round || d.n !== S.round.n || S.phase !== 'round') return;
        S.phase = 'halted'; clearInterval(S.tick);
        if (S.ui) {
          S.ui.inputs.forEach((x) => { x.disabled = true; });
          S.ui.stopBtn.disabled = true; S.ui.stopBtn.textContent = d.by ? '✋ STOP de ' + ctx.nameOf(d.by) + '!' : '⏰ Acabou o tempo!';
          S.ui.tip.textContent = 'Enviando respostas…';
        }
        ctx.toMaster('ans', { n: d.n, a: S.round.cats.map((_, i) => api.cleanText(S.mine[i] || '').slice(0, 40)) });
      } else if (a === 'review') {
        const rd = cleanRows(d); if (!rd) return;
        S.phase = 'review'; S.review = rd; S.votesShown = {};
        screenReview(rd, {}, false);
      } else if (a === 'votes') {
        if (S.phase !== 'review' || !S.review || d.n !== S.review.n) return;
        S.votesShown = (d.counts && typeof d.counts === 'object') ? d.counts : {};
        screenReview(S.review, S.votesShown, false);
      } else if (a === 'score') {
        const rd = cleanRows(d); if (!rd) return;
        rd.inv = Array.isArray(d.inv) ? d.inv : []; rd.cell = (d.cell && typeof d.cell === 'object') ? d.cell : {};
        rd.pts = clean(d.pts || {}); rd.scores = clean(d.scores || {});
        S.scores = rd.scores; S.phase = 'score';
        screenReview(rd, null, true);
      } else if (a === 'final') {
        if (S.phase === 'final') return;
        S.phase = 'final'; clearInterval(S.tick);
        if (d.scores) S.scores = clean(d.scores);
        screenFinal();
      }
      if (ctx.isMaster && ['round', 'review', 'score', 'final'].includes(a)) S.last = { a, d };
    }
    function clean(o) { const r = {}; Object.keys(o).slice(0, 40).forEach((k) => { const v = Number(o[k]); if (Number.isFinite(v)) r[String(k).slice(0, 80)] = Math.round(v); }); return r; }
    function cleanRows(d) {
      if (!Number.isInteger(d.n) || !Array.isArray(d.cats) || !d.rows || typeof d.rows !== 'object') return null;
      const cats = d.cats.slice(0, CATS.length).map((x) => api.cleanText(x).slice(0, 30));
      const rows = {};
      Object.keys(d.rows).slice(0, 30).forEach((pid) => { const r = d.rows[pid]; if (Array.isArray(r)) rows[pid] = cats.map((_, i) => api.cleanText(r[i] || '').slice(0, 40)); });
      const auto = Array.isArray(d.auto) ? d.auto.filter((x) => Array.isArray(x)).map((x) => [String(x[0]), Number(x[1])]) : [];
      return { n: d.n, total: Number(d.total) || 5, letter: api.cleanText(d.letter).slice(0, 1), cats, rows, auto, autoSet: new Set(auto.map((x) => x[0] + '|' + x[1])) };
    }

    S.onMsg = onMsg;
    S.resync = () => {
      const l = S.last; if (!l) return;
      const d = Object.assign({}, l.d);
      if (l.a === 'round') { if (S.halted) return; d.rest = Math.max(5, S.limit - (Date.now() - S.mRound.t0) / 1000); }
      ctx.broadcastOnly(l.a, d);
    };
    screenSetup();
  }

  window.CZJogoStop = {
    start,
    onMsg: (ctx, from, a, d) => ctx.state.onMsg(ctx, from, a, d),
    resync: (ctx) => ctx.state.resync(),
    destroy: (ctx) => { const S = ctx.state; S.closed = true; S.timers.forEach(clearTimeout); clearInterval(S.tick); },
  };
})();
