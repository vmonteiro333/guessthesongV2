import { getArtistPoints, getStagePoints } from "./gameRules";

export interface RoundScoreInput {
  solved: boolean;
  solvedAtStage: number | null;
  artistCorrect: boolean;
  artistAtStage: number | null;
}

/**
 * ESTRATÉGIA DE PONTUAÇÃO (matematicamente sem dupla contagem):
 *
 * - Acerto completo (artista + música) no estágio S: pontos CHEIOS de S,
 *   atribuídos UMA única vez no encerramento da rodada. Um "amarelo"
 *   anterior NÃO adiciona pontos (registra apenas artistCorrect/artistAtStage).
 * - Rodada encerrada sem acertar a música: floor(pontos / 2) do estágio em
 *   que o ARTISTA foi descoberto (0 se o artista nunca foi descoberto).
 *
 * Tabela resultante (completa / só artista):
 *   0,1s → 7 / 3   0,5s → 6 / 3   1s → 5 / 2   2s → 4 / 2
 *   4s → 3 / 1     8s → 2 / 1     16s → 1 / 0
 */
export function computeRoundPoints(input: RoundScoreInput): number {
  if (input.solved && input.solvedAtStage !== null) {
    return getStagePoints(input.solvedAtStage);
  }
  if (!input.solved && input.artistCorrect && input.artistAtStage !== null) {
    return getArtistPoints(input.artistAtStage);
  }
  return 0;
}