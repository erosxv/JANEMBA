// Tira os anúncios do player do YouTube. Roda DENTRO do player (só nos apps: o navegador não deixa o site mexer lá).
// O app de PC injeta pelo electron/preload.js e o Android pelo MainActivity.java, antes de qualquer código do YouTube.
(() => {
  if (window.__czNoAds) return;
  const stats = window.__czNoAds = { pruned: 0, skipped: 0 };

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
      if (hit) stats.pruned++;
    } catch (e) {}
    return o;
  };
  JSON.parse = new Proxy(JSON.parse, { apply: (fn, self, args) => clean(Reflect.apply(fn, self, args)) });
  Response.prototype.json = new Proxy(Response.prototype.json, { apply: (fn, self, args) => Reflect.apply(fn, self, args).then(clean) });
  let initial;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', { configurable: true, get: () => initial, set: (v) => { initial = clean(v); } });
  } catch (e) {}

  // 2) Pula: se mesmo assim um anúncio começar, deixa mudo e corre até o fim (ou aperta "Pular").
  //    Ao terminar, devolve o som como estava.
  let adVideo = null, wasMuted = false;
  setInterval(() => {
    const player = document.querySelector('.html5-video-player');
    const v = player && player.querySelector('video');
    const ad = !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    if (ad && v) {
      if (adVideo !== v) { adVideo = v; wasMuted = v.muted; stats.skipped++; }
      v.muted = true;
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.1) v.currentTime = v.duration;
      const skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad button');
      if (skip) skip.click();
    } else if (adVideo) {
      adVideo.muted = wasMuted;
      adVideo = null;
    }
  }, 250);
})();
