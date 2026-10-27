// Copia os arquivos do site para www/, que é a pasta usada pelo Electron e pelo Capacitor.
// O site em si continua na raiz do repositório (é o que o GitHub Pages publica).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const FILES = ['index.html', 'app', 'manifest.webmanifest', 'sw.js', 'icons', 'extras', 'sons', 'yt-noads.js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of FILES) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });

// A versão que aparece na tela inicial (e que o Android compara para avisar de versão nova) sai do package.json
const { version } = require(path.join(root, 'package.json'));
const idx = path.join(out, 'app', '7-chat-extras.js');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/const APP_VERSION = '[^']*'/, "const APP_VERSION = '" + version + "'"));
console.log('www/ pronto');
