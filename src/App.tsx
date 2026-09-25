import { useState } from "react";
import type { ReactNode } from "react";
import { useGame } from "./hooks/useGame";
import { useAudio } from "./hooks/useAudio";
import type { Playlist } from "./types/playlist";
import { playlists } from "./data/playlists";
import GameHeader from "./components/GameHeader";
import GameScreen from "./components/GameScreen";
import GameOver from "./components/GameOver";
import StartScreen from "./components/StartScreen";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import SpotifyConnect from "./components/SpotifyConnect";
import PlaylistPicker from "./components/PlaylistPicker";
import { loadSelectedPlaylistId, saveSelectedPlaylistId } from "./utils/storage";

function findPlaylist(id: string | null): Playlist | null {
  if (!id) return null;
  return playlists.find((p) => p.id === id) ?? null;
}

export default function App() {
  const audio = useAudio();
  const [selected, setSelected] = useState<Playlist | null>(() =>
    findPlaylist(loadSelectedPlaylistId())
  );

  const choosePlaylist = (playlist: Playlist): void => {
    setSelected(playlist);
    saveSelectedPlaylistId(playlist.id);
  };
  const backToPicker = (): void => setSelected(null);

  let screen: ReactNode;
  if (playlists.length === 0) {
    screen = <EmptyState />;
  } else if (audio.serviceStatus === "needs_login") {
    screen = <SpotifyConnect onConnect={audio.login} error={audio.serviceError} />;
  } else if (audio.serviceStatus === "boot" || audio.serviceStatus === "connecting") {
    screen = <LoadingState message="Conectando ao Spotify…" />;
  } else if (audio.serviceStatus === "error") {
    screen = (
      <section className="start-screen panel">
        <h2 className="start-title">Não foi possível conectar ao Spotify</h2>
        <p className="start-tagline">{audio.serviceError}</p>
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
      </section>
    );
  } else if (selected === null) {
    screen = <PlaylistPicker playlists={playlists} onSelect={choosePlaylist} />;
  } else {
    // key por playlist: trocar remonta o jogo com estado fresco (idle).
    screen = (
      <Game
        key={selected.id}
        playlist={selected}
        audio={audio}
        onChoosePlaylist={backToPicker}
      />
    );
  }

  return (
    <div className="app">
      <main className="app-main">{screen}</main>
    </div>
  );
}

interface GameProps {
  playlist: Playlist;
  audio: ReturnType<typeof useAudio>;
  onChoosePlaylist: () => void;
}

function Game({ playlist, audio, onChoosePlaylist }: GameProps) {
  const game = useGame(audio, playlist);
  const { gameStatus } = game;

  const showHeader = gameStatus !== "idle" && gameStatus !== "game_over";

  let screen: ReactNode;
  if (gameStatus === "idle") {
    screen = (
      <StartScreen
        playlist={playlist}
        onStart={game.startGame}
        onChoosePlaylist={onChoosePlaylist}
      />
    );
  } else if (gameStatus === "game_over") {
    screen = (
      <GameOver
        score={game.score}
        history={game.history}
        onRestart={game.startGame}
        onChoosePlaylist={onChoosePlaylist}
      />
    );
  } else {
    screen = <GameScreen game={game} audio={audio} />;
  }

  return (
    <div className="game-root">
      {showHeader && (
        <GameHeader
          playlistName={playlist.name}
          score={game.score}
          currentIndex={Math.min(game.currentSongIndex + 1, game.queue.length)}
          total={game.queue.length}
        />
      )}
      <main className="app-main">{screen}</main>
    </div>
  );
}