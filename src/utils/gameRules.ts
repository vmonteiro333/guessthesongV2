/** Estágios de cada rodada, em segundos. Sempre começa em 0,1s. */
export const STAGES = [0.1, 0.5, 1, 2, 4, 8, 16];

/** Pontos de acerto completo (artista + música) por estágio. */
export const STAGE_POINTS = [7, 6, 5, 4, 3, 2, 1];

export const LAST_STAGE_INDEX = STAGES.length - 1;

export function getStageSeconds(index: number): number {
  return STAGES[clampIndex(index)];
}

export function getStagePoints(index: number): number {
  return STAGE_POINTS[clampIndex(index)];
}

/** Pontos quando SOMENTE o artista é descoberto: floor(pontos / 2). */
export function getArtistPoints(index: number): number {
  return Math.floor(getStagePoints(index) / 2);
}

export function isLastStage(index: number): boolean {
  return index >= LAST_STAGE_INDEX;
}

/** Próximo estágio ou null no último (SKIP nunca cria índice inválido). */
export function getNextStageIndex(index: number): number | null {
  if (isLastStage(index)) return null;
  return index + 1;
}

export function formatSeconds(seconds: number): string {
  return `${seconds.toString().replace(".", ",")}s`;
}

function clampIndex(index: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  if (index > LAST_STAGE_INDEX) return LAST_STAGE_INDEX;
  return Math.floor(index);
}