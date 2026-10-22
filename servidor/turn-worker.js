// Cloudflare Worker do CallZinha: entrega credenciais TURN temporárias (24 h) para o app.
// A chave do TURN fica guardada aqui como segredo e nunca vai para o navegador. Passo a passo em TURN.md.
// Segredos (Settings → Variables and Secrets): TURN_KEY_ID e TURN_KEY_API_TOKEN.

const ORIGENS = ['https://erosxv.github.io', 'app://', 'https://localhost', 'http://localhost', 'capacitor://localhost', 'http://127.0.0.1'];

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const permitido = ORIGENS.some((o) => origin.startsWith(o));
    const cors = { 'Access-Control-Allow-Origin': permitido ? origin : ORIGENS[0], 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (!permitido) return new Response('origem não permitida', { status: 403, headers: cors });

    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + env.TURN_KEY_ID + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 })
    });
    if (!r.ok) return new Response('falha ao gerar credencial: ' + r.status, { status: 502, headers: cors });
    const j = await r.json();
    // a porta 53 é bloqueada pelos navegadores: tirar evita uma tentativa que só dá timeout
    const iceServers = (j.iceServers || []).map((s) => ({ ...s, urls: [].concat(s.urls || []).filter((u) => !/:53(\?|$)/.test(u)) }));
    return new Response(JSON.stringify({ iceServers }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
