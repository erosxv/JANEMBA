// Jogo "Adivinhe a música": toca um trecho e quem digitar o nome primeiro ganha mais pontos.
// O mestre (quem abriu) escolhe as músicas da lista abaixo, acha o vídeo pela busca do /play e conta os pontos.
// O nome da música só vai para os outros no fim da rodada.
(function () {
  'use strict';

  const THEMES = {
    br: { name: 'Brasil', songs: [
      'Envolver|Anitta', 'Show das Poderosas|Anitta', 'Vai Malandra|Anitta', 'Trem-Bala|Ana Vilela', 'Ainda Bem|Marisa Monte',
      'Garota de Ipanema|Tom Jobim', 'Aquarela|Toquinho', 'País Tropical|Jorge Ben Jor', 'Mas Que Nada|Jorge Ben Jor', 'Evidências|Chitãozinho e Xororó',
      'Tempo Perdido|Legião Urbana', 'Que País É Este|Legião Urbana', 'Ai Se Eu Te Pego|Michel Teló', 'Chuva de Arroz|Luan Santana', 'Ousadia e Alegria|Thiaguinho',
      'Deixa Acontecer|Grupo Revelação', 'Ela Vai Voltar|Charlie Brown Jr', 'Zóio de Lula|Charlie Brown Jr', 'Velha Infância|Tribalistas', 'Já Sei Namorar|Tribalistas',
      'Juntos|Paula Fernandes', 'Asa Branca|Luiz Gonzaga', 'Pétala|Djavan', 'Oceano|Djavan', 'Sozinho|Caetano Veloso',
    ] },
    funk: { name: 'Funk', songs: [
      'Baile de Favela|MC João', 'Bum Bum Tam Tam|MC Fioti', 'Olha a Explosão|MC Kevinho', 'Deu Onda|MC G15', 'Vai Embrazando|MC Zaac',
      'Que Tiro Foi Esse|Jojo Maronttinni', 'Ela é do Tipo|Kevin O Chris', 'Tudo de Bom|Ludmilla', 'Malandramente|Dennis DJ', 'Hoje|Ludmilla',
      'Parado no Bailão|MC L da Vinte', 'Sentadão|Pedro Sampaio', 'Rave de Favela|MC Lan', 'Agora Vai Sentar|MC Jhowzinho e MC Kadinho', 'Tchutchuca|Bonde do Tigrão',
      'Cerol na Mão|Bonde do Tigrão', 'Rap da Felicidade|Cidinho e Doca', 'Eu Só Quero É Ser Feliz|Cidinho e Doca', 'Tá Tranquilo Tá Favorável|MC Bin Laden', 'Dançarina|Pedro Sampaio',
    ] },
    sertanejo: { name: 'Sertanejo', songs: [
      'Evidências|Chitãozinho e Xororó', 'Infiel|Marília Mendonça', 'Supera|Marília Mendonça', 'Todo Mundo Vai Sofrer|Marília Mendonça', 'Notificação Preferida|Zé Neto e Cristiano',
      'Largado às Traças|Zé Neto e Cristiano', 'Camaro Amarelo|Munhoz e Mariano', 'Ai Se Eu Te Pego|Michel Teló', 'Fio de Cabelo|Chitãozinho e Xororó', 'Cuida Bem Dela|Henrique e Juliano',
      'Medo Bobo|Maiara e Maraisa', 'Seu Astral|Jorge e Mateus', 'Logo Eu|Jorge e Mateus', 'Sentimento Louco|Marília Mendonça', 'Fui Fiel|Gusttavo Lima',
      'Balada|Gusttavo Lima', 'Coração Cachorro|Ávine Vinny', 'Batom de Cereja|Israel e Rodolffo', 'Propaganda|Jorge e Mateus', 'Liberdade Provisória|Henrique e Juliano',
    ] },
    pop: { name: 'Pop internacional', songs: [
      'Work|Rihanna', 'Umbrella|Rihanna', 'Shape of You|Ed Sheeran', 'Blinding Lights|The Weeknd', 'Bad Guy|Billie Eilish',
      'Shake It Off|Taylor Swift', 'Rolling in the Deep|Adele', 'Uptown Funk|Bruno Mars', 'Levitating|Dua Lipa', 'Despacito|Luis Fonsi',
      'Poker Face|Lady Gaga', 'Bad Romance|Lady Gaga', 'Toxic|Britney Spears', 'Baby|Justin Bieber', 'Happy|Pharrell Williams',
      'Firework|Katy Perry', 'Halo|Beyoncé', 'Flowers|Miley Cyrus', 'As It Was|Harry Styles', 'Someone Like You|Adele',
    ] },
    rock: { name: 'Rock', songs: [
      'Bohemian Rhapsody|Queen', 'Smells Like Teen Spirit|Nirvana', 'Sweet Child O Mine|Guns N Roses', 'Back in Black|AC/DC', 'Highway to Hell|AC/DC',
      'Hotel California|Eagles', 'Stairway to Heaven|Led Zeppelin', 'Livin on a Prayer|Bon Jovi', 'In the End|Linkin Park', 'Numb|Linkin Park',
      'Seven Nation Army|The White Stripes', 'Mr Brightside|The Killers', 'Wonderwall|Oasis', 'Basket Case|Green Day', 'Boulevard of Broken Dreams|Green Day',
      'Californication|Red Hot Chili Peppers', 'Enter Sandman|Metallica', 'We Will Rock You|Queen', 'Pra Frente|Raimundos', 'Mulher de Fases|Raimundos',
    ] },
    anos2000: { name: 'Anos 2000', songs: [
      'Crazy in Love|Beyoncé', 'Hips Dont Lie|Shakira', 'Toxic|Britney Spears', 'Hey Ya|OutKast', 'In Da Club|50 Cent',
      'Yeah|Usher', 'Complicated|Avril Lavigne', 'Since U Been Gone|Kelly Clarkson', 'Umbrella|Rihanna', 'I Gotta Feeling|Black Eyed Peas',
      'Boulevard of Broken Dreams|Green Day', 'Mr Brightside|The Killers', 'Hey There Delilah|Plain White Ts', 'Viva la Vida|Coldplay', 'Clocks|Coldplay',
      'Beautiful Day|U2', 'Single Ladies|Beyoncé', 'Gimme More|Britney Spears', 'Promiscuous|Nelly Furtado', 'Bleeding Love|Leona Lewis',
    ] },
  };
  THEMES.mix = { name: 'Tudo misturado', songs: [].concat(...Object.values(THEMES).map((t) => t.songs)).filter((v, i, a) => a.indexOf(v) === i) };

  const ROUND_SECS = 25, HINT_AT = 12, REVEAL_SECS = 6;

  // distância de edição (para aceitar erro de digitação pequeno)
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
    }
    return d[n];
  }

  function start(ctx) {
    const { el, api } = ctx;
    const S = ctx.state = {
      phase: 'setup', theme: 'mix', total: 10, n: 0, scores: {}, got: {}, round: null, last: null,
      timers: [], player: null, playerReady: null, queue: [], closed: false, tick: null,
    };

    // ---------------- telas ----------------
    function scoreList(highlightGot) {
      const box = el('div', 'jg-score');
      const ids = Object.keys(S.scores).sort((a, b) => S.scores[b] - S.scores[a]);
      if (!ids.length) box.append(el('div', 'jg-muted', 'Ninguém pontuou ainda.'));
      ids.forEach((id) => {
        const r = el('div', id === ctx.me ? 'me' : '');
        r.append(el('span', '', (highlightGot && S.got[id] ? '✅ ' : '') + ctx.nameOf(id)), el('b', '', String(S.scores[id])));
        box.append(r);
      });
      return box;
    }
    function screenSetup() {
      const b = ctx.body; b.replaceChildren();
      if (!ctx.isMaster) {
        b.append(el('div', 'jg-center jg-muted', 'Esperando ' + ctx.nameOf(ctx.master) + ' escolher o tema…'));
        return;
      }
      b.append(el('div', 'jg-muted', 'Tema'));
      const chips = el('div', 'jg-chips'); chips.style.margin = '6px 0 12px';
      Object.keys(THEMES).forEach((k) => {
        const c = el('button', 'jg-chip' + (S.theme === k ? ' on' : ''), THEMES[k].name);
        c.onclick = () => { S.theme = k; screenSetup(); };
        chips.append(c);
      });
      b.append(chips);
      const row = el('div', 'jg-row');
      const sel = el('select', 'jg-select');
      [5, 10, 15].forEach((n) => { const o = el('option', '', n + ' rodadas'); o.value = n; if (n === S.total) o.selected = true; sel.append(o); });
      sel.onchange = () => { S.total = Number(sel.value); };
      const go = el('button', 'jg-btn', 'Começar ▶');
      go.onclick = () => { go.disabled = true; go.textContent = 'Preparando…'; masterBegin(); };
      row.append(sel, go);
      b.append(row);
      const tip = el('div', 'jg-muted'); tip.style.marginTop = '12px';
      tip.textContent = 'Toca um trecho de cada música. Digite o nome dela: quanto mais rápido, mais pontos. A música da sala fica muda durante o jogo.';
      b.append(tip);
    }
    function screenRound() {
      const r = S.round, b = ctx.body; b.replaceChildren();
      ctx.setStatus('rodada ' + r.n + '/' + r.total);
      const top = el('div', 'jg-row'); top.style.justifyContent = 'space-between';
      top.append(el('b', '', 'Rodada ' + r.n + ' de ' + r.total), el('span', 'jg-muted', ''));
      const left = top.lastChild;
      const bar = el('div', 'jg-bar'); const fill = el('i'); bar.append(fill); bar.style.margin = '8px 0 14px';
      const center = el('div', 'jg-center'); center.style.margin = '6px 0 14px';
      const big = el('div', 'jg-big', '🎵'); center.append(big);
      const hint = el('div', 'jg-muted', 'Dica aparece em ' + HINT_AT + 's'); hint.style.marginTop = '6px'; center.append(hint);
      const unlock = el('button', 'jg-btn blue', '🔊 Toque aqui para ouvir'); unlock.hidden = true; unlock.style.marginTop = '10px';
      unlock.onclick = () => { try { S.player.playVideo(); } catch (e) {} unlock.hidden = true; };
      center.append(unlock);
      const form = el('form', 'jg-row');
      const inp = el('input', 'jg-input'); inp.placeholder = 'Qual é a música?'; inp.autocomplete = 'off'; inp.maxLength = 80;
      const send = el('button', 'jg-btn', 'Chutar'); send.type = 'submit';
      form.append(inp, send);
      const fb = el('div', 'jg-muted'); fb.style.minHeight = '20px'; fb.style.marginTop = '6px';
      form.onsubmit = (e) => {
        e.preventDefault();
        const t = api.cleanText(inp.value).slice(0, 80);
        if (!t || S.got[ctx.me]) return;
        inp.value = '';
        fb.textContent = 'Conferindo "' + t + '"…';
        ctx.toMaster('guess', { t });
      };
      b.append(top, bar, center, form, fb);
      const feed = el('div', 'jg-feed'); feed.style.marginTop = '10px'; b.append(feed);
      S.ui = { left, fill, hint, unlock, inp, fb, feed, big };
      if (S.got[ctx.me]) lockInput();
      setTimeout(() => inp.focus(), 50);
      updateTimer();
    }
    function lockInput() { if (!S.ui) return; S.ui.inp.disabled = true; S.ui.inp.placeholder = 'Você acertou! 🎉'; S.ui.fb.textContent = ''; }
    function updateTimer() {
      if (!S.round || !S.ui) return;
      const el2 = (Date.now() - S.round.t0) / 1000, rest = Math.max(0, S.round.dur - el2);
      S.ui.fill.style.width = (rest / ROUND_SECS * 100) + '%';
      S.ui.left.textContent = Math.ceil(rest) + 's';
    }
    function screenReveal(d) {
      const b = ctx.body; b.replaceChildren();
      const c = el('div', 'jg-center'); c.style.marginBottom = '14px';
      c.append(el('div', 'jg-muted', 'Era…'), el('div', 'jg-big', d.title));
      const a = el('div', '', d.artist); a.style.fontSize = '16px'; a.style.color = '#c9cdd3'; c.append(a);
      b.append(c, scoreList(true));
      if (d.n < d.total) { const nx = el('div', 'jg-muted jg-center', 'Próxima rodada em instantes…'); nx.style.marginTop = '10px'; b.append(nx); }
    }
    function screenFinal() {
      ctx.setStatus('fim');
      const b = ctx.body; b.replaceChildren();
      const ids = Object.keys(S.scores).sort((a, c) => S.scores[c] - S.scores[a]);
      b.append(el('div', 'jg-center jg-big', '🏆'));
      const pod = el('div', 'jg-podium');
      [[1, '🥈', 'p2'], [0, '🥇', 'p1'], [2, '🥉', 'p3']].forEach(([i, em, cls]) => {
        const id = ids[i]; const d = el('div', cls);
        if (id) { d.append(el('div', 'em', em), el('div', '', ctx.nameOf(id)), el('b', '', S.scores[id] + ' pts')); } else d.style.visibility = 'hidden';
        pod.append(d);
      });
      b.append(pod, scoreList(false));
      const row = el('div', 'jg-row'); row.style.marginTop = '12px'; row.style.justifyContent = 'center';
      if (ctx.isMaster) {
        const again = el('button', 'jg-btn', 'Jogar de novo'); again.onclick = () => { S.phase = 'setup'; S.scores = {}; screenSetup(); };
        const end = el('button', 'jg-btn ghost', 'Encerrar'); end.onclick = () => ctx.end('Jogo encerrado');
        row.append(again, end);
      } else row.append(el('div', 'jg-muted', 'Aguardando ' + ctx.nameOf(ctx.master) + ' decidir se joga de novo.'));
      b.append(row);
      if (ids.length) api.sysChat('🎵 Adivinhe a música: ' + ids.slice(0, 3).map((id, i) => ['🥇', '🥈', '🥉'][i] + ' ' + ctx.rawName(id) + ' (' + S.scores[id] + ')').join('  '));
    }

    // ---------------- player escondido ----------------
    async function getPlayer() {
      if (S.player) return S.player;
      if (!S.playerReady) {
        S.playerReady = (async () => {
          await api.ensureYT();
          const holder = el('div'); holder.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden';
          const inner = el('div'); holder.append(inner); document.body.append(holder);
          S.holder = holder;
          return new Promise((ok) => {
            const p = new window.YT.Player(inner, {
              width: '2', height: '2',
              playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, origin: location.origin },
              events: { onReady: () => { S.player = p; try { p.setVolume(85); } catch (e) {} ok(p); } },
            });
          });
        })();
      }
      return S.playerReady;
    }
    async function playClip(id, startAt) {
      const p = await getPlayer();
      if (S.closed) return;
      api.duckMusic(true);
      try { p.loadVideoById({ videoId: id, startSeconds: startAt }); } catch (e) {}
      setTimeout(() => {
        try { if (S.ui && S.round && p.getPlayerState() !== window.YT.PlayerState.PLAYING) S.ui.unlock.hidden = false; } catch (e) {}
      }, 2500);
    }
    function stopClip() { try { if (S.player) S.player.pauseVideo(); } catch (e) {} }

    // ---------------- mestre ----------------
    function later(fn, ms) { const t = setTimeout(() => { if (!S.closed) fn(); }, ms); S.timers.push(t); return t; }
    async function resolveSong() {
      while (S.queue.length) {
        const [title, artist] = S.queue.shift().split('|');
        try {
          const res = await api.searchMusic(title + ' ' + artist, 4);
          if (!res) continue;
          for (const r of res) {
            const info = r.ok ? {} : await api.fetchVideoInfo(r.id);
            if (!info.blocked) return { id: r.id, title, artist };
          }
        } catch (e) {}
      }
      return null;
    }
    async function masterBegin() {
      S.queue = ctx.shuffle(THEMES[S.theme].songs);
      S.scores = {}; ctx.people().forEach((id) => { S.scores[id] = 0; });
      S.n = 0; S.revealed = 0; S.phase = 'starting';
      S.next = resolveSong();
      masterRound();
    }
    async function masterRound() {
      const song = await S.next;
      if (S.closed) return;
      if (!song) { ctx.broadcast('final', { scores: S.scores }); api.toast('Acabaram as músicas que deu para achar. Fim de jogo!'); return; }
      S.n++;
      S.answer = song; S.got = {}; S.firstDone = false;
      const d = { n: S.n, total: S.total, id: song.id, start: 30 + ctx.rnd(30), dur: ROUND_SECS, scores: S.scores };
      S.roundStart = Date.now();
      ctx.broadcast('round', d);
      S.next = S.n < S.total ? resolveSong() : Promise.resolve(null);
      later(() => ctx.broadcast('hint', { artist: song.artist, len: song.title.length }), HINT_AT * 1000);
      S.endTimer = later(masterReveal, ROUND_SECS * 1000);
    }
    function masterReveal() {
      if (S.revealed === S.n) return;
      S.revealed = S.n;
      clearTimeout(S.endTimer);
      ctx.broadcast('reveal', { n: S.n, total: S.total, title: S.answer.title, artist: S.answer.artist, scores: S.scores, got: S.got });
      later(() => { if (S.n < S.total) masterRound(); else ctx.broadcast('final', { scores: S.scores }); }, REVEAL_SECS * 1000);
    }
    function isRight(guess, title) {
      const g = ctx.norm(guess), t = ctx.norm(title.replace(/\(.*?\)/g, ''));
      if (!g) return false;
      if (g === t || g.includes(t)) return true;
      if (t.includes(g) && g.length >= Math.max(4, t.length * 0.6)) return true;
      return lev(g, t) <= Math.floor(t.length / 5);
    }
    function masterGuess(from, t) {
      if (!S.answer || S.revealed === S.n || S.got[from]) return;
      if (!(from in S.scores)) S.scores[from] = 0;
      if (isRight(t, S.answer.title)) {
        const secs = (Date.now() - S.roundStart) / 1000;
        let pts = Math.max(20, 100 - Math.floor(secs * 3));
        if (!S.firstDone) { pts += 20; S.firstDone = true; }
        S.got[from] = pts; S.scores[from] += pts;
        ctx.broadcast('hit', { p: from, pts, scores: S.scores });
        const present = ctx.people().filter((id) => id in S.scores);
        if (present.every((id) => S.got[id])) later(masterReveal, 1200);
      } else ctx.broadcast('miss', { p: from });
    }

    // ---------------- todos ----------------
    function onMsg(c, from, a, d) {
      if (S.closed) return;
      const fromMaster = from === ctx.master;
      if (a === 'guess') { if (ctx.isMaster && d && typeof d.t === 'string') masterGuess(from, api.cleanText(d.t).slice(0, 80)); return; }
      if (!fromMaster) return;
      if (a === 'round') {
        if (!Number.isInteger(d.n) || typeof d.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(d.id)) return;
        if (S.round && S.round.n === d.n && S.phase === 'round') return;   // repetido (reenvio para quem chegou)
        S.phase = 'round';
        S.round = { n: d.n, total: Number(d.total) || 10, t0: Date.now(), dur: Math.min(ROUND_SECS, Number(d.dur) || ROUND_SECS) };
        S.got = {}; if (d.scores && typeof d.scores === 'object') S.scores = sanitizeScores(d.scores);
        screenRound();
        playClip(d.id, Math.max(0, Math.min(120, Number(d.start) || 30)));
        clearInterval(S.tick); S.tick = setInterval(updateTimer, 250);
      } else if (a === 'hint') {
        if (S.ui) S.ui.hint.textContent = 'Dica: ' + api.cleanText(d.artist).slice(0, 60) + ' · ' + (Number(d.len) || '?') + ' letras';
      } else if (a === 'hit') {
        if (typeof d.p !== 'string') return;
        S.got[d.p] = Number(d.pts) || 1;
        if (d.scores) S.scores = sanitizeScores(d.scores);
        if (S.ui) {
          S.ui.feed.prepend(el('div', '', '✅ ' + ctx.nameOf(d.p) + ' acertou! +' + (Number(d.pts) || 0)));
          if (d.p === ctx.me) { lockInput(); S.ui.big.textContent = '🎉'; }
        }
      } else if (a === 'miss') {
        if (d.p === ctx.me && S.ui) S.ui.fb.textContent = '❌ Não é essa. Tente de novo!';
      } else if (a === 'reveal') {
        S.phase = 'reveal'; clearInterval(S.tick); stopClip();
        if (d.scores) S.scores = sanitizeScores(d.scores);
        if (d.got && typeof d.got === 'object') S.got = d.got;
        S.ui = null; S.round = null;
        screenReveal({ n: d.n, total: d.total, title: api.cleanText(d.title).slice(0, 80), artist: api.cleanText(d.artist).slice(0, 60) });
        ctx.setStatus('rodada ' + d.n + '/' + d.total);
      } else if (a === 'final') {
        if (S.phase === 'final') return;
        S.phase = 'final'; clearInterval(S.tick); stopClip(); api.duckMusic(false);
        if (d.scores) S.scores = sanitizeScores(d.scores);
        S.ui = null; S.round = null;
        screenFinal();
      }
      // o mestre guarda a última fase para reenviar a quem chegar no meio
      if (ctx.isMaster && (a === 'round' || a === 'reveal' || a === 'final')) S.last = { phase: { a, d }, hint: null };
      if (ctx.isMaster && a === 'hint' && S.last) S.last.hint = { a, d };
    }
    function sanitizeScores(o) {
      const r = {}; Object.keys(o).slice(0, 40).forEach((k) => { const v = Number(o[k]); if (Number.isFinite(v)) r[String(k).slice(0, 80)] = Math.round(v); }); return r;
    }

    ctx.state.onMsg = onMsg;
    ctx.state.resync = () => {
      const l = S.last; if (!l || !l.phase) return;
      const d = Object.assign({}, l.phase.d);
      if (l.phase.a === 'round') d.dur = Math.max(3, ROUND_SECS - (Date.now() - S.roundStart) / 1000);
      ctx.broadcastOnly(l.phase.a, d);
      if (l.hint) ctx.broadcastOnly('hint', l.hint.d);
    };
    screenSetup();
  }

  window.CZJogoMusica = {
    start,
    onMsg: (ctx, from, a, d) => ctx.state.onMsg(ctx, from, a, d),
    resync: (ctx) => ctx.state.resync(),
    destroy: (ctx) => {
      const S = ctx.state; S.closed = true;
      S.timers.forEach(clearTimeout); clearInterval(S.tick);
      try { if (S.player) S.player.destroy(); } catch (e) {}
      if (S.holder) S.holder.remove();
      ctx.api.duckMusic(false);
    },
  };
})();
