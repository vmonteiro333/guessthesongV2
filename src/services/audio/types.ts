export type Unsubscribe = () => void;

/**
 * Abstração do player. O resto da aplicação NÃO conhece SC.Widget —
 * apenas esta interface. A implementação concreta é SoundCloudPlayer.
 */
export interface AudioPlayer {
  /** Garante a API do widget carregada e o widget construído. */
  init(): Promise<void>;
  /** Carrega uma nova faixa no MESMO iframe (widget.load + callback). */
  load(url: string): Promise<void>;
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