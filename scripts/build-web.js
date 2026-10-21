// Copia os arquivos do site para www/, que é a pasta usada pelo Electron e pelo Capacitor.
// O site em si continua na raiz do repositório (é o que o GitHub Pages publica).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'icons', 'extras'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of FILES) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
console.log('www/ pronto');
