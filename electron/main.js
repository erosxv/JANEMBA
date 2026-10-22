// App de desktop do CallZinha (Windows e Linux): abre o site que está em www/ numa janela própria.
const { app, BrowserWindow, protocol, net, session, desktopCapturer, dialog, shell } = require('electron');
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
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, enableWebSQL: false }
  });
  win.loadURL('app://callzinha/index.html');

  // Links externos abrem no navegador, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
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

  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
