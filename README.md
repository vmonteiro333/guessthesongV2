Guess the Song
Jogo de adivinhar músicas: você ouve trechos cada vez mais longos (áudiocompleto via Spotify Premium) e tenta acertar qual é a música. Quanto menosáudio precisar, mais pontos vale.

Tecnologias
React 18 + TypeScript + Vite
Web Playback SDK do Spotify (o navegador vira um device do Spotify Connect)
Spotify Web API (play/pause/posição/estado)
Login OAuth 2.0 com PKCE (sem segredos no frontend)
Vitest (testes unitários)
GitHub Pages (deploy automático via GitHub Actions)
Instalação
npm install
Desenvolvimento
npm run dev
Importante: abra o endereço exatamente como o Vite anunciar(http://127.0.0.1:5173/guessthesongV2/) — o login do Spotify valida oredirect URI contra a lista do dashboard.

Pré-requisitos para o áudio
Conta Spotify Premium (o áudio completo exige);
Um app no dashboard do Spotifycom Web API e Web Playback SDK habilitados;
Redirect URIs cadastrados no app (ex.):
https://SEU-USUARIO.github.io/SEU-REPO/ (produção)
http://127.0.0.1:5173/guessthesongV2/ (desenvolvimento)
O SPOTIFY_CLIENT_ID do app em src/config/spotify.ts(é identificador público, não é segredo).
Como adicionar músicas
O catálogo é gerado por script (evite editar src/data/songs.ts à mão):

# Opção A — direto da API (playlists públicas):npm run import:playlist -- "https://open.spotify.com/playlist/ID"# Opção B — via CSV do Exportify (https://exportify.app):# exporte a playlist, salve como playlist.csv na raiz e rode:node scripts/convert-csv.mjs playlist.csv
Campos gerados por música:

id — identificador único interno;
title — nome da faixa (resposta esperada);
artist — artistas separados por vírgula (alimentam a dica amarela);
artistAliases — gerado automaticamente para artistas com vírgula no nome(ex.: "Tyler, The Creator" → aceita "Tyler The Creator");
spotifyUrl — link open.spotify.com/track/... usado pelo player.
Como o jogo funciona
Cada música tem 7 estágios; a rodada sempre começa no menor trecho:

0.1s → 0.5s → 1s → 2s → 4s → 8s → 16s
Ouvir o trecho: toca do início da música e corta no limite da etapa(controle via Spotify Connect; pausa confirmada com retry);
Palpite: sempre o nome de uma música (só o artista não vale);
🟢 Verde: acertou → rodada encerra, pontos cheios da etapa;
🟡 Amarelo: chutou uma música cadastrada cujo artista participa dasecreta → dica do artista, a rodada continua;
🔴 Vermelho: não é essa — continue; no 16s, errar encerra e revela.
Pontuação
Estágio	Acerto completo	Só o artista
0.1s	7	3
0.5s	6	3
1s	5	2
2s	4	2
4s	3	1
8s	2	1
16s	1	0
O artista é "descoberto" pela dica amarela; os pontos finais são atribuídosuma única vez no encerramento da rodada (sem dupla contagem).

Arquitetura
useGame (estado do jogo)   ↓useAudio (sessão + trechos + retry)   ↓SpotifyWebPlayer (singleton; SDK p/ device + Web API p/ controle)   ↓Spotify (Connect + Web API)
O player é um singleton de página: sobrevive ao remount do StrictMode ereusa a conexão. O corte do trecho usa: evidência de progresso real → pauseantecipado (compensa a latência do comando) → cap absoluto → enforceStopcom confirmação de estado.

Build
npm run build
Testes
npm test
Deploy
Push em main dispara o workflow (.github/workflows/deploy.yml) quepublica em GitHub Pages.

Limitações conhecidas (honestas)
Precisão do corte: o comando de pause leva ~200–400ms para surtirefeito no Spotify Connect; o jogo antecipa o pause e usa cap absoluto.Trechos curtos (0,1s/0,5s) têm folga perceptível de ~0,1–0,3s.
Primeiro play de cada faixa: 1–3s de silêncio de buffering.
Travadas raras de rede: retry automático reativando o device; sepersistir, ouvir de novo resolve.
Sessão: exige login (Premium) e expira; renovada automaticamente,novo login quando necessário. Não abra duas abas do jogo.
Faixas sem preview de metadados: raras; viram "Indisponível".