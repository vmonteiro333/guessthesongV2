export interface SpotifyPlaybackUpdateData {
    position: number;
    duration: number;
  }
  
  export interface SpotifyEmbedController {
    loadUri(uri: string): void;
    play(): void;
    pause(): void;
    resume(): void;
    togglePlay(): void;
    seek(seconds: number): void;
    addListener(event: "ready", listener: () => void): void;
    addListener(
      event: "playback_update",
      listener: (event: { data: SpotifyPlaybackUpdateData }) => void
    ): void;
    addListener(event: string, listener: (payload: unknown) => void): void;
  }
  
  export interface SpotifyIframeApi {
    createController(
      element: HTMLElement,
      options: { uri: string; width?: string | number; height?: string | number },
      callback: (controller: SpotifyEmbedController, error?: Error) => void
    ): void;
  }
  
  declare global {
    interface Window {
      onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    }
  }