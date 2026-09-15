/**
 * Tipagem mínima e honesta para o SoundCloud Widget API.
 * A API oficial não publica tipos TypeScript; declaramos apenas o que o
 * projeto usa. O evento ERROR nem sempre é documentado/disparado pelo widget,
 * por isso é opcional e tratado em tempo de execução.
 */

export interface ScWidget {
    bind(eventName: string, listener: (payload?: unknown) => void): ScWidget;
    unbind(eventName: string): ScWidget;
    load(
      url: string,
      options?: {
        auto_play?: boolean;
        visual?: boolean;
        show_comments?: boolean;
        sharing?: boolean;
        single_active?: boolean;
        /** Chamado quando o widget terminou de carregar a nova faixa. */
        callback?: () => void;
        [key: string]: unknown;
      }
    ): void;
    play(): void;
    pause(): void;
    seekTo(milliseconds: number): void;
    getPosition(callback: (position: number) => void): void;
    getDuration(callback: (duration: number) => void): void;
  }
  
  export interface ScWidgetEventsMap {
    LOAD_PROGRESS: string;
    PLAY_PROGRESS: string;
    PLAY: string;
    PAUSE: string;
    FINISH: string;
    SEEK: string;
    READY: string;
    OPEN: string;
    ERROR?: string;
  }
  
  export interface ScWidgetFactory {
    (iframe: HTMLIFrameElement | string): ScWidget;
    Events: ScWidgetEventsMap;
  }
  
  export interface SoundCloudGlobal {
    Widget: ScWidgetFactory;
  }
  
  declare global {
    interface Window {
      SC?: SoundCloudGlobal;
    }
  }