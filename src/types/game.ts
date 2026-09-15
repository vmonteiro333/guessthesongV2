export type GameStatus =
  | "idle"            // tela inicial
  | "loading"         // carregando faixa
  | "ready"           // faixa pronta, aguardando "Ouvir"
  | "playing"         // trecho tocando
  | "waiting_answer"  // trecho encerrado, aguardando resposta
  | "finished"        // rodada encerrada (acerto ou fim)
  | "game_over"       // todas as músicas concluídas
  | "error";          // erro de carga (avanço automático em andamento)

export type GuessOutcome = "correct" | "artist" | "wrong";

/**
 * UMA música = UM resultado de rodada (atualizável).
 * Ex.: um "amarelo" hoje e um "verde" depois atualizam a MESMA entrada.
 */
export interface SongRoundResult {
  songId: string;
  artist: string;
  title: string;
  artistCorrect: boolean;
  titleCorrect: boolean;
  solved: boolean;
  /** Índice do estágio em que a música foi acertada (0 = 0,1s). */
  solvedAtStage: number | null;
  /** Estágio em que o artista foi descoberto (base dos pontos parciais). */
  artistAtStage: number | null;
  points: number;
  /** Rodada encerrada (permite revelar a resposta no histórico). */
  finalized: boolean;
  /** Falha ao carregar (faixa removida/indisponível). */
  error?: boolean;
}