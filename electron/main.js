// App de desktop do CallZinha (Windows e Linux): abre o site que está em www/ numa janela própria.
const { app, BrowserWindow, protocol, net, session, desktopCapturer, dialog, shell, ipcMain, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WWW = path.join(__dirname, '..', 'www');

// app://callzinha/ é tratado como site seguro (https), então mic, áreas de transferência e AudioWorklet funcionam
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) app.quit();

// Menos memória: sem processo "reserva" de página e sem teclas de mídia do teclado mexendo no player
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,HardwareMediaKeyHandling');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: path.join(WWW, 'icons', 'icon-512.png'),
    // sem corretor ortográfico (o dicionário fica carregado na memória à toa)
    // o preload roda também dentro dos players do YouTube (nodeIntegrationInSubFrames), para tirar os anúncios
    webPreferences: {
      contextIsolation: true, sandbox: true, spellcheck: false, enableWebSQL: false,
      preload: path.join(__dirname, 'preload.js'), nodeIntegrationInSubFrames: true
    }
  });
  win.loadURL('app://callzinha/index.html');
  // a página (re)começou: os atalhos dos sons da página anterior deixam de valer até ela entrar na call de novo
  win.webContents.on('did-navigate', () => globalShortcut.unregisterAll());   // só a página principal, não os players

  // Diagnóstico (só com CZ_DEBUG=1): mostra no terminal o que o limpador de anúncios registra dentro dos players do YouTube
  if (process.env.CZ_DEBUG) {
    win.webContents.on('console-message', (e, ...rest) => {
      const m = e && typeof e.message === 'string' ? e.message : rest[1];
      if (typeof m === 'string' && m.startsWith('[cz-noads]')) console.log(m);
    });
  }

  // Links externos abrem no navegador, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Atualização automática: ao abrir (e a cada 4 h) olha a última versão publicada no GitHub, baixa em segundo plano
// e pergunta se pode reiniciar. Se a pessoa disser "Depois", instala sozinha quando o app for fechado.
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  let updater;
  try { updater = require('electron-updater').autoUpdater; } catch (e) { return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('error', () => {});   // sem internet, GitHub fora do ar ou formato sem suporte (.deb/.tar.gz): segue sem atualizar
  let asked = false;
  updater.on('update-downloaded', async (info) => {
    if (asked) return;
    asked = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Atualização pronta',
      message: 'A versão ' + info.version + ' do CallZinha já foi baixada.',
      detail: 'Reiniciar agora leva poucos segundos. Se estiver numa call, escolha "Depois": ela é instalada quando você fechar o app.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (response === 0) updater.quitAndInstall(true, true);
  });
  const check = () => { updater.checkForUpdates().catch(() => {}); };
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

// Compartilhar tela: o Electron não tem o seletor do Chrome, então mostramos um nosso
async function pickScreen(request, callback) {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
  const options = sources.filter((s) => s.name).slice(0, 12);
  if (!options.length) return callback({});
  let chosen = options[0];
  if (options.length > 1) {
    const labels = options.map((s) => (s.id.startsWith('screen') ? '🖥 ' : '🪟 ') + s.name.slice(0, 60));
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Compartilhar tela',
      message: 'O que você quer compartilhar?',
      buttons: [...labels, 'Cancelar'],
      cancelId: labels.length,
      noLink: true
    });
    if (response === labels.length) return callback({});
    chosen = options[response];
  }
  // Som do computador junto com a tela: só o Windows suporta
  const audio = request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined;
  callback(audio ? { video: chosen, audio } : { video: chosen });
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(WWW, rel));
    if (!file.startsWith(WWW)) return new Response('Proibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const ses = session.defaultSession;
  const ALLOWED = ['media', 'display-capture', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'notifications'];
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(ALLOWED.includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => ALLOWED.includes(permission));
  ses.setDisplayMediaRequestHandler((request, callback) => {
    pickScreen(request, callback).catch(() => callback({}));
  });

  // O player do YouTube recusa tocar (erro 153) sem saber de qual site veio: dizemos que é o site público.
  // A busca de músicas também: a chave só aceita pedidos vindos do site do CallZinha.
  ses.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://www.googleapis.com/youtube/*'] },
    (details, cb) => {
      if (!details.requestHeaders.Referer || details.requestHeaders.Referer.startsWith('app:')) {
        details.requestHeaders.Referer = 'https://erosxv.github.io/';
      }
      cb({ requestHeaders: details.requestHeaders });
    }
  );

  // Importar playlist: a página pública do Spotify não manda o cabeçalho CORS, então o app de PC o acrescenta só para ela.
  ses.webRequest.onHeadersReceived({ urls: ['https://open.spotify.com/embed/*'] }, (details, cb) => {
    const h = details.responseHeaders || {};
    for (const k of Object.keys(h)) if (k.toLowerCase() === 'access-control-allow-origin') delete h[k];
    h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });

  // Bloqueio de anúncios na rede (mesma ideia do Brave e do uBlock): o pedido do anúncio é cancelado antes de sair,
  // então o player não baixa nem espera o anúncio. O yt-noads.js (abaixo) continua como reserva se algo escapar.
  const AD_URLS = [
    '*://*.doubleclick.net/*', '*://*.googlesyndication.com/*', '*://*.googleadservices.com/*', '*://*.2mdn.net/*',
    '*://*.google.com/pagead/*',
    '*://*.youtube.com/pagead/*', '*://*.youtube.com/api/stats/ads*', '*://*.youtube.com/ptracking*',
    '*://*.youtube.com/get_midroll_*', '*://*.youtube.com/youtubei/v1/player/ad_break*',
    '*://*.youtube-nocookie.com/pagead/*', '*://*.youtube-nocookie.com/api/stats/ads*', '*://*.youtube-nocookie.com/ptracking*'
  ];
  ses.webRequest.onBeforeRequest({ urls: AD_URLS }, (details, cb) => {
    if (process.env.CZ_DEBUG) console.log('[cz-noads] pedido bloqueado:', details.url.split('?')[0]);
    cb({ cancel: true });
  });

  // Limpador de anúncios do YouTube: o preload de cada player pede o código aqui
  let noAds = '';
  try { noAds = fs.readFileSync(path.join(WWW, 'yt-noads.js'), 'utf8'); } catch (e) {}
  ipcMain.on('cz-noads', (e) => {
    let host = '';
    try { host = new URL(e.senderFrame.url).hostname; } catch (err) {}
    e.returnValue = /(^|\.)youtube(-nocookie)?\.com$/.test(host) ? noAds : '';
  });

  // Atalhos dos sons do soundboard: valem no Windows/Linux inteiro, até com o CallZinha em segundo plano (jogando, por ex.).
  // A página manda a lista de teclas; devolve as que deu para registrar (outro programa pode já estar usando alguma).
  ipcMain.handle('cz-teclas', (e, lista) => {
    if (!win || e.sender !== win.webContents || !e.senderFrame.url.startsWith('app://callzinha/')) return [];
    globalShortcut.unregisterAll();
    const ok = [];
    for (const acc of (Array.isArray(lista) ? lista : []).slice(0, 60)) {
      if (typeof acc !== 'string' || acc.length > 40) continue;
      try { if (globalShortcut.register(acc, () => win && win.webContents.send('cz-tecla', acc))) ok.push(acc); } catch (err) {}
    }
    return ok;
  });

  // Botões do mouse como atalho de som (meio e laterais): precisa "escutar" o mouse no sistema, o que o Electron não faz sozinho.
  // O módulo nativo só é carregado quando alguém liga um botão a um som, e só olha cliques: nada é gravado nem enviado.
  // Se o módulo não carregar (ou o Linux estiver em Wayland), os botões continuam valendo com o CallZinha na frente.
  let uio = null, uioOn = false, uioWired = false, mouseWanted = new Set();
  const domButton = (n) => (n === 1 ? 0 : n === 2 ? 2 : n === 3 ? 1 : n === 4 ? 3 : n === 5 ? 4 : n - 1);   // numeração do hook → a do navegador
  const stopMouse = () => { if (uio && uioOn) { try { uio.uIOhook.stop(); } catch (err) {} uioOn = false; } };
  stopMouseHook = stopMouse;
  ipcMain.handle('cz-mouse', (e, lista) => {
    if (!win || e.sender !== win.webContents || !e.senderFrame.url.startsWith('app://callzinha/')) return [];
    const want = (Array.isArray(lista) ? lista : []).filter((n) => Number.isInteger(n) && (n === 1 || (n >= 3 && n <= 8))).slice(0, 8);
    mouseWanted = new Set(want);
    if (!want.length) { stopMouse(); return []; }
    try {
      if (uio === null) uio = require('uiohook-napi');
      if (!uioWired) {
        uioWired = true;
        uio.uIOhook.on('mousedown', (ev) => { const b = domButton(ev.button); if (mouseWanted.has(b) && win && !win.isDestroyed()) win.webContents.send('cz-mouse-btn', b); });
      }
      if (!uioOn) { uio.uIOhook.start(); uioOn = true; }
      return want;
    } catch (err) { uio = false; return []; }
  });

  createWindow();
  setupAutoUpdate();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let stopMouseHook = () => {};
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { stopMouseHook(); } catch (e) {} });
