import type { Song } from "../types/song";

/**
 * CATÁLOGO DO JOGO — cadastro 100% manual, somente neste arquivo.
 * Nada de busca automática, scraping ou API de descoberta.
 *
 * Como pegar a URL: na página da faixa no SoundCloud, botão "Compartilhar"
 * → "Copiar link" (ex.: https://soundcloud.com/artista/nome-da-faixa).
 *
 * Importante:
 * - A faixa precisa permitir incorporação (embed). Faixas removidas,
 *   privadas ou bloqueadas para embed são detectadas (timeout/erro do
 *   widget) e a rodada é pulada automaticamente — o jogo não quebra.
 * - Cadastre `title` e `artist` EXATAMENTE como quer aceitar como resposta
 *   (a comparação ignora acentos, maiúsculas, pontuação e espaços, mas é
 *   estrita: não aceita "quase igual").
 * - Prefira títulos sem "feat."/"(Remix)", a menos que queira exigi-los.
 */

export const songs: Song[] = [
  // Exemplo (remova/comente e cadastre as suas):
  // {
  //   id: "song-001",
  //   title: "Nome da Música",
  //   artist: "Nome do Artista",
  //   soundcloudUrl: "https://soundcloud.com/artista/nome-da-faixa",
  //   coverUrl: "https://i1.sndcdn.com/artworks/....jpg" // opcional
  // },
];