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

// Os apps sabem a própria versão (para o aviso de versão nova no Android); o site fica com o marcador e ignora
const { version } = require(path.join(root, 'package.json'));
const idx = path.join(out, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace("'__CZ_APP_VERSION__'", JSON.stringify(version)));
console.log('www/ pronto');
