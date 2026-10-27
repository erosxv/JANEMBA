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

  createWindow();
  setupAutoUpdate();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
