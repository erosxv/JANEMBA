// Roda no começo de cada frame (a página do CallZinha e os players do YouTube dentro dela).
// Só age dentro do YouTube: põe o limpador de anúncios (yt-noads.js) antes de o código do YouTube rodar.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) {
  const src = ipcRenderer.sendSync('cz-noads');
  if (src) {
    try { contextBridge.executeInMainWorld({ func: new Function(src) }); }
    catch (e) { webFrame.executeJavaScript(src).catch(() => {}); }
  }
}
