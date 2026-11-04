// Tira os anúncios do player do YouTube. Roda DENTRO do player (só nos apps: o navegador não deixa o site mexer lá).
// O app de PC injeta pelo electron/preload.js e o Android pelo MainActivity.java, antes de qualquer código do YouTube.
(() => {
  if (window.__czNoAds) return;
  const stats = window.__czNoAds = { pruned: 0, skipped: 0 };
  // Diagnóstico: no app de PC, abra com CZ_DEBUG=1 para ver essas linhas no terminal
  const log = (...a) => { try { console.log('[cz-noads]', ...a); } catch (e) {} };

  // 1) Limpa: apaga a lista de anúncios da resposta do YouTube antes de o player ler (mesma ideia do uBlock Origin).
  //    Sem a lista, o player nem sabe que havia anúncio.
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
  const strip = (o) => {
    let hit = false;
    AD_KEYS.forEach((k) => { if (k in o) { delete o[k]; hit = true; } });
    return hit;
  };
  const clean = (o) => {
    try {
      if (!o || typeof o !== 'object') return o;
      let hit = strip(o);
      if (o.playerResponse && typeof o.playerResponse === 'object') hit = strip(o.playerResponse) || hit;
      if (Array.isArray(o)) o.forEach((x) => { if (x && x.playerResponse && typeof x.playerResponse === 'object') hit = strip(x.playerResponse) || hit; });
      if (hit) { stats.pruned++; log('lista de anúncios removida da resposta (' + stats.pruned + ')'); }
    } catch (e) {}
    return o;
  };
  JSON.parse = new Proxy(JSON.parse, { apply: (fn, self, args) => clean(Reflect.apply(fn, self, args)) });
  Response.prototype.json = new Proxy(Response.prototype.json, { apply: (fn, self, args) => Reflect.apply(fn, self, args).then(clean) });
  let initial;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', { configurable: true, get: () => initial, set: (v) => { initial = clean(v); } });
  } catch (e) {}

  // 2) Pula: se mesmo assim um anúncio começar, deixa mudo, põe na velocidade máxima e corre até o fim (ou aperta "Pular").
  //    A velocidade máxima faz o anúncio passar em poucos segundos mesmo quando a duração dele ainda não é conhecida
  //    (aí o pulo direto não funciona e, sem isso, a tela ficaria preta até o anúncio acabar).
  //    Ao terminar, devolve o som e a velocidade como estavam.
  let adVideo = null, wasMuted = false, wasRate = 1, adStart = 0;
  setInterval(() => {
    const player = document.querySelector('.html5-video-player');
    const v = player && player.querySelector('video');
    const ad = !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    if (ad && v) {
      if (adVideo !== v) {
        adVideo = v; wasMuted = v.muted; wasRate = v.playbackRate || 1; adStart = Date.now(); stats.skipped++;
        log('anúncio apareceu (duração ' + v.duration + ')');
      }
      v.muted = true;
      try { v.playbackRate = 16; } catch (e) {}
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.1) v.currentTime = v.duration;
      const skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad button');
      if (skip) skip.click();
    } else if (adVideo) {
      adVideo.muted = wasMuted;
      try { adVideo.playbackRate = wasRate; } catch (e) {}
      log('anúncio terminou em ' + (Date.now() - adStart) + ' ms');
      adVideo = null;
    }
  }, 150);
})();
