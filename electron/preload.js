// Roda no começo de cada frame (a página do CallZinha e os players do YouTube dentro dela).
// Só age dentro do YouTube: põe o limpador de anúncios (yt-noads.js) antes de o código do YouTube rodar.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Página do CallZinha: atalhos dos sons que funcionam com a janela em segundo plano (ver cz-teclas no main.js)
if (location.protocol === 'app:') {
  contextBridge.exposeInMainWorld('czTeclas', {
    definir: (lista) => ipcRenderer.invoke('cz-teclas', lista),
    aoApertar: (cb) => { ipcRenderer.on('cz-tecla', (e, acc) => cb(acc)); },
  });
}

if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) {
  const src = ipcRenderer.sendSync('cz-noads');
  if (src) {
    try { contextBridge.executeInMainWorld({ func: new Function(src) }); }
    catch (e) { webFrame.executeJavaScript(src).catch(() => {}); }
  }
}
