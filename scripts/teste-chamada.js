// Teste automático do CallZinha: roda antes de gerar os apps (e dá para rodar na mão: npm test).
// Abre duas pessoas em dois Chromes separados (microfone falso), entra numa sala aleatória e confere:
//   - a versão está igual em app/7-chat-extras.js, no ?v= do index.html, no package.json, no build.gradle e na tag;
//   - as duas se conectam e o áudio chega dos dois lados, sem picotar;
//   - os filtros de ruído (IA e IA forte) ligam;
//   - nenhum erro de JavaScript apareceu na página.
// Usa o servidor público do PeerJS, então precisa de internet. Se a sala falhar por instabilidade, tenta de novo.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const falhas = [];
const ok = (msg) => console.log('  ok  ' + msg);
const falha = (msg) => { console.log('  FALHOU  ' + msg); falhas.push(msg); };

function acharChrome() {
  const c = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const achado = c.find((p) => fs.existsSync(p));
  if (!achado) throw new Error('Chrome não encontrado (defina CHROME_PATH)');
  return achado;
}

// Servidor de arquivos simples (só a pasta do projeto, só leitura)
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8' };
function servir() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.normalize(path.join(ROOT, p));
      if (!f.startsWith(ROOT) || /node_modules|\.git/.test(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); resp.end(); return; }
      resp.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// Cliente mínimo do protocolo de depuração do Chrome (WebSocket nativo do Node 22)
async function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pend = new Map(), erros = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') erros.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const avaliar = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 60000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, avaliar, erros, fechar: () => ws.close() };
}

async function abrirChrome(chrome, url, perfil) {
  const porta = 9500 + Math.floor(Math.random() * 400);
  const args = ['--headless=new', '--remote-debugging-port=' + porta, '--user-data-dir=' + perfil, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank'];
  if (process.env.CI) args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: 'ignore' });
  let versao = null;
  for (let i = 0; i < 100 && !versao; i++) { try { versao = await (await fetch('http://127.0.0.1:' + porta + '/json/version')).json(); } catch (e) { await sleep(200); } }
  if (!versao) { proc.kill(); throw new Error('o Chrome não abriu'); }
  const alvo = await (await fetch('http://127.0.0.1:' + porta + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
  const pg = await conectar(alvo.webSocketDebuggerUrl);
  await pg.send('Runtime.enable');
  for (let i = 0; i < 60; i++) { try { if (await pg.avaliar("location.href.startsWith('http') && !!window.$ && !!$('joinBtn')")) break; } catch (e) {} await sleep(250); }
  return { proc, pg };
}

function conferirVersao() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const html = (/const APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'app', '7-chat-extras.js'), 'utf8')) || [])[1];
  // os arquivos de app/ levam ?v=versão no index.html: assim ninguém fica com um pedaço velho no cache do navegador
  const vs = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/app\/[\w.-]+\?v=([\w.-]+)/g)].map((m) => m[1]);
  if (vs.length >= 8 && vs.every((v) => v === pkg)) ok('index.html carrega os ' + vs.length + ' arquivos de app/ com ?v=' + pkg);
  else falha('?v= dos arquivos de app/ no index.html não bate com a versão ' + pkg + ': ' + [...new Set(vs)].join(', '));
  const gradle = (/versionName "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8')) || [])[1];
  if (pkg === html && pkg === gradle) ok('versão ' + pkg + ' igual no app, no package.json e no build.gradle');
  else falha('versões diferentes: package.json ' + pkg + ', app ' + html + ', build.gradle ' + gradle);
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
  if (tag) { if (tag === 'v' + pkg) ok('tag ' + tag + ' bate com a versão'); else falha('a tag ' + tag + ' não bate com a versão ' + pkg); }
}

async function testarSala(chrome, base) {
  const sala = 'teste-ci-' + Math.floor(1000 + Math.random() * 9000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cz-teste-'));
  const pessoas = [];
  try {
    for (const nome of ['Ana', 'Beto']) {
      const p = await abrirChrome(chrome, base + '?room=' + sala, path.join(tmp, nome));
      pessoas.push(p);
      await p.pg.avaliar(`$('nameInput').value='${nome}'; $('joinBtn').click(); true`);
      await sleep(nome === 'Ana' ? 4000 : 500);
    }
    const estado = `(() => { const c = Object.values(calls)[0]; const pc = c && c.peerConnection;
      return { ice: pc ? pc.iceConnectionState : 'nenhuma', stream: !!(c && c._gotStream), tiles: document.querySelectorAll('#grid .tile').length }; })()`;
    let conectou = false;
    for (let i = 0; i < 60 && !conectou; i++) {
      const st = await Promise.all(pessoas.map((p) => p.pg.avaliar(estado)));
      conectou = st.every((s) => s.stream && ['connected', 'completed'].includes(s.ice) && s.tiles === 2);
      if (!conectou) await sleep(1000);
    }
    if (!conectou) return { tentarDeNovo: true, motivo: 'as duas pessoas não se conectaram em 60 s' };
    ok('duas pessoas conectadas na sala ' + sala);
    await sleep(6000);
    const audio = `(async () => { let bytes = 0, conc = 0, total = 0; const pc = Object.values(calls)[0].peerConnection; const r = await pc.getStats();
      r.forEach((x) => { if (x.type === 'inbound-rtp' && x.kind === 'audio') { bytes += x.bytesReceived || 0; conc += x.concealedSamples || 0; total += x.totalSamplesReceived || 0; } });
      return { bytes, reconstruida: total ? 100 * conc / total : 100 }; })()`;
    const a = await Promise.all(pessoas.map((p) => p.pg.avaliar(audio)));
    a.forEach((x, i) => {
      if (x.bytes > 10000 && x.reconstruida < 20) ok('áudio chegando para ' + ['Ana', 'Beto'][i] + ' (' + Math.round(x.bytes / 1024) + ' KB, ' + x.reconstruida.toFixed(1) + '% reconstruída)');
      else falha('áudio ruim para ' + ['Ana', 'Beto'][i] + ': ' + JSON.stringify(x));
    });
    // Filtros de ruído: troca nos Ajustes e confere se o processador certo entrou
    for (const [modo, no] of [['ai', 'rnnoiseNode'], ['dfn', 'dfnNode']]) {
      await pessoas[0].pg.avaliar(`(() => { const s = $('setNoise'); s.value = '${modo}'; s.dispatchEvent(new Event('change')); return true; })()`);
      let ligou = false;
      for (let i = 0; i < 40 && !ligou; i++) { ligou = await pessoas[0].pg.avaliar(`effectiveNoise() === '${modo}' && !!${no}`); if (!ligou) await sleep(500); }
      if (ligou) ok('filtro de ruído "' + modo + '" ligou'); else falha('filtro de ruído "' + modo + '" não ligou (' + await pessoas[0].pg.avaliar('effectiveNoise()') + ')');
    }
    const diag = await pessoas[0].pg.avaliar('buildDiagText()');
    if (/Ligações \(1\)/.test(diag)) ok('diagnóstico gerado'); else falha('diagnóstico sem a ligação: ' + diag.slice(0, 200));
    pessoas.forEach((p, i) => { if (p.pg.erros.length) falha('erros de JavaScript em ' + ['Ana', 'Beto'][i] + ': ' + p.pg.erros.slice(0, 3).join(' | ')); });
    if (pessoas.every((p) => !p.pg.erros.length)) ok('nenhum erro de JavaScript na página');
    return { tentarDeNovo: false };
  } finally {
    // sai da sala sem o botão Sair (ele pede confirmação) e fecha o Chrome
    for (const p of pessoas) {
      await Promise.race([p.pg.avaliar('try { peer && peer.destroy() } catch (e) {} true').catch(() => {}), sleep(2000)]);
      try { p.pg.fechar(); } catch (e) {}
      try { p.proc.kill(); } catch (e) {}
    }
    await sleep(500);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

setTimeout(() => { console.error('Teste passou de 8 minutos: abortado.'); process.exit(1); }, 8 * 60e3).unref();
(async () => {
  console.log('Teste do CallZinha');
  conferirVersao();
  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const chrome = acharChrome();
  try {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const r = await testarSala(chrome, base);
      if (!r.tentarDeNovo) break;
      console.log('  ...  ' + r.motivo + (tentativa < 3 ? ', tentando de novo' : ''));
      if (tentativa === 3) falha(r.motivo);
    }
  } finally { srv.close(); }
  if (falhas.length) { console.log('\n' + falhas.length + ' problema(s). Os apps NÃO foram gerados.'); process.exit(1); }
  console.log('\nTudo certo.');
  process.exit(0);
})().catch((e) => { console.error('Erro no teste:', e); process.exit(1); });
