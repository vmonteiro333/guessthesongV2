export type Unsubscribe = () => void;

/**
 * Abstração do player. O resto da aplicação NÃO conhece a IFrame API do
 * Spotify — apenas esta interface. Implementação: SpotifyPlayer (embed
 * oficial do Spotify, prévias públicas de 30s, sem login).
 */
export interface AudioPlayer {
  init(): Promise<void>;
  load(url: string): Promise<void>;
  /** Volta ao início e começa a tocar. */
  playFromStart(): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  getPosition(): Promise<number>;
  getDuration(): Promise<number>;
  destroy(): void;

  onReady(listener: () => void): Unsubscribe;
  onPlay(listener: () => void): Unsubscribe;
  onPause(listener: () => void): Unsubscribe;
  onProgress(listener: (positionMs: number) => void): Unsubscribe;
  onFinish(listener: () => void): Unsubscribe;
  onError(listener: (message: string) => void): Unsubscribe;
}