export interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

export interface SpotifyWebPlaybackTrack {
  id: string | null;
  uri: string;
  name: string;
  artists: { uri: string; name: string }[];
  album: { uri: string; name: string; images: { url: string }[] };
}

export interface SpotifyWebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: SpotifyWebPlaybackTrack };
}

export interface SpotifyWebPlaybackPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  addListener(event: "ready", cb: (event: { device_id: string }) => void): boolean;
  addListener(event: "not_ready", cb: (event: { device_id: string }) => void): boolean;
  addListener(
    event: "player_state_changed",
    cb: (state: SpotifyWebPlaybackState | null) => void
  ): boolean;
  addListener(
    event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
    cb: (event: { message: string }) => void
  ): boolean;
  getCurrentState(): SpotifyWebPlaybackState | null;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(milliseconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: SpotifyPlayerOptions) => SpotifyWebPlaybackPlayer;
    };
  }
}