# Servidor TURN do CallZinha (Cloudflare, grátis até 1.000 GB/mês)

O CallZinha liga as pessoas direto, aparelho com aparelho. Em algumas redes isso é impossível
(4G/5G com CGNAT, Wi-Fi de empresa ou faculdade) e a pessoa fica "reconectando" sem áudio.
O TURN resolve: quando a ligação direta falha, o áudio passa por um servidor da Cloudflare.
Quem consegue ligar direto continua direto, então o consumo fica pequeno.

## Passo a passo (uma vez só, ~10 minutos)

1. Crie uma conta grátis em https://dash.cloudflare.com/sign-up
2. No painel: **Realtime → TURN Server → Create**. Dê um nome (ex.: `callzinha`).
   Copie o **Turn Token ID** e o **API Token** que aparecem (o token só aparece uma vez).
3. No painel: **Workers & Pages → Create → Create Worker**. Nome: `callzinha-turn`. Clique em **Deploy**.
4. Clique em **Edit code**, apague tudo, cole o conteúdo de `servidor/turn-worker.js` e clique em **Deploy**.
5. No Worker: **Settings → Variables and Secrets → Add**, tipo **Secret**:
   - `TURN_KEY_ID` = o Turn Token ID do passo 2
   - `TURN_KEY_API_TOKEN` = o API Token do passo 2
6. Abra o endereço do Worker no navegador (algo como `https://callzinha-turn.SEU-NOME.workers.dev`).
   Deve aparecer "origem não permitida" — é o normal, ele só responde para o app.
7. Coloque esse endereço em `const TURN_URL = '...'` no `index.html` e publique.

## Como saber se está funcionando

Na chamada, abra **Ajustes → Painel de diagnóstico**. Ao lado do nome de cada pessoa aparece
"direta (rede local)", "direta (via STUN)" ou "via servidor TURN". O botão **Copiar diagnóstico**
também mostra se o TURN está ativo.

## Custos

O plano grátis da Cloudflare cobre 1.000 GB por mês (somando TURN e SFU). Uma pessoa falando
por 1 hora via TURN gasta uns 30 MB por pessoa conectada a ela. Passando do limite, custa
US$ 0,05 por GB — dá para pôr um alerta de uso no painel da Cloudflare.
