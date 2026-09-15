Guess the Song
Jogo de adivinhar músicas: você ouve trechos cada vez mais longos (via SoundCloud)e tenta acertar o artista e a música. Quanto menos áudio precisar, mais pontos vale.

Tecnologias
React 18 + TypeScript
Vite
Hooks (estado local + custom hooks; sem Redux)
SoundCloud HTML5 Widget + Widget API (https://w.soundcloud.com/player/api.js)
Vitest (testes unitários)
Instalação
npm install
Desenvolvimento
npm run dev
Como adicionar músicas
Edite src/data/songs.ts. O catálogo é 100% manual — não há busca automática.

{  id: "song-002",           // identificador único, usado para o histórico  title: "Nome",            // resposta esperada para o campo MÚSICA  artist: "Artista",        // resposta esperada para o campo ARTISTA  soundcloudUrl: "https://soundcloud.com/...", // permalink da faixa  coverUrl: "https://..."   // opcional (reservado; o widget mostra a capa)}
Pegue a URL na página da faixa: Compartilhar → Copiar link.
A faixa precisa permitir embed. Removidas/privadas/bloqueadas são puladasautomaticamente com a mensagem "Não foi possível carregar esta música.".
Cadastre title/artist exatamente como quer aceitar. A comparação ignoraacentos, caixa, pontuação e espaços extras, mas é estrita (sem fuzzy).
Como o jogo funciona
Cada música tem 7 estágios. A rodada sempre começa no menor trecho:

0.1s → 0.5s → 1s → 2s → 4s → 8s → 16s
Em cada estágio você pode: Ouvir (do início, para no limite da etapa),Tentar (artista e/ou música) ou Pular etapa (trecho maior na próxima vez).

Estágio	Pontos completos	Só o artista
0.1s	7	3
0.5s	6	3
1s	5	2
2s	4	2
4s	3	1
8s	2	1
16s	1	0
Verde (artista + música): rodada encerrada, pontos cheios do estágio.
Amarelo (só artista): a rodada continua; os pontos finais saem apenasquando a rodada termina (nunca há soma dupla). Se a rodada terminar sem otítulo, você recebe metade (floor) dos pontos do estágio em que achou oartista.
Vermelho: continue tentando; no estágio de 16s, errar (ou "Não sei")encerra a rodada e revela a resposta.
SoundCloud
O áudio vem exclusivamente do SoundCloud HTML5 Widget oficial dentro de umiframe, controlado pela Widget API (SC.Widget). Um único iframe é criadopor sessão e as trocas de música usam widget.load(url, { callback }), quepreserva os listeners. Nada de áudio local, scraping ou player customizado;a atribuição do SoundCloud é preservada. Durante a rodada o widget ficadesfocado (para não entregar a resposta) e é totalmente revelado no fimda rodada.

Build
npm run build
Preview
npm run preview
Testes
npm test
Limitações conhecidas (honestas)
Precisão: a comunicação com o iframe é assíncrona; parar em 0,1s exatos éimpossível de garantir. Usamos PLAY_PROGRESS + polling de 50ms + redes desegurança de relógio; trechos curtos podem passar alguns centésimos a mais.
Faixas sem embed / lentidão: carga tem timeout de 15s → a música émarcada como indisponível e a rodada é pulada.
Aba em segundo plano: navegadores limitam timers; o corte do trecho podeatrasar se a aba não estiver visível.
Sessão não persiste: recarregar a página volta à tela inicial(apenas o recorde fica no localStorage).