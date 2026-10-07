import { useState } from "react";
import type { ReactNode } from "react";
import { useGame } from "./hooks/useGame";
import { useAudio } from "./hooks/useAudio";
import type { Playlist } from "./types/playlist";
import type { GameModeId } from "./types/gameMode";
import type { DifficultyId } from "./types/difficulty";
import { playlists } from "./data/playlists";
import { getDifficulty } from "./data/difficulties";
import GameHeader from "./components/GameHeader";
import GameScreen from "./components/GameScreen";
import GameOver from "./components/GameOver";
import StartScreen from "./components/StartScreen";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import SpotifyConnect from "./components/SpotifyConnect";
import PlaylistPicker from "./components/PlaylistPicker";
import Ribbons from "./components/Ribbons";
import { loadSelectedPlaylistId, saveSelectedPlaylistId } from "./utils/storage";
import { loadSelectedModeId, saveSelectedModeId } from "./utils/storage";
import { loadSelectedDifficultyId, saveSelectedDifficultyId } from "./utils/storage";

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
    audio.stopPlayback();
    setSelected(playlist);
    saveSelectedPlaylistId(playlist.id);
  };
  const backToPicker = (): void => {
    audio.stopPlayback();
    setSelected(null);
  };

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
      <Ribbons />
    </div>
  );
}

interface GameProps {
  playlist: Playlist;
  audio: ReturnType<typeof useAudio>;
  onChoosePlaylist: () => void;
}

function Game({ playlist, audio, onChoosePlaylist }: GameProps) {
  const game = useGame(audio, playlist, getDifficulty(loadSelectedDifficultyId()));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeId, setModeId] = useState<GameModeId>(() => loadSelectedModeId() ?? "classic");
  const [difficultyId, setDifficultyId] = useState<DifficultyId>(
    () => loadSelectedDifficultyId() ?? "normal"
  );
  const difficulty = getDifficulty(difficultyId);
  const { gameStatus } = game;

  const showHeader = gameStatus !== "idle" && gameStatus !== "game_over";
  const doneCount = game.history.filter((entry) => entry.finalized).length;

  let screen: ReactNode;
  if (gameStatus === "idle") {
    screen = (
      <StartScreen
        playlist={playlist}
        modeId={modeId}
        onChangeMode={(id) => {
          setModeId(id);
          saveSelectedModeId(id);
        }}
        difficultyId={difficultyId}
        onChangeDifficulty={(id) => {
          setDifficultyId(id);
          saveSelectedDifficultyId(id);
        }}
        onStart={game.startGame}
        onChoosePlaylist={onChoosePlaylist}
      />
    );
  } else if (gameStatus === "game_over") {
    screen = (
      <GameOver
        score={game.score}
        history={game.history}
        playlistName={playlist.name}
        maxStreak={game.maxStreak}
        onRestart={game.startGame}
        onChoosePlaylist={onChoosePlaylist}
      />
    );
  } else {
    screen = (
      <GameScreen
        game={game}
        audio={audio}
        catalog={playlist.songs}
        difficulty={difficulty}
        resultsOpen={drawerOpen}
        onCloseResults={() => setDrawerOpen(false)}
      />
    );
  }

  return (
    <div className="game-root">
      {showHeader && (
        <GameHeader
          playlistName={playlist.name}
          score={game.score}
          total={game.queue.length}
          doneCount={doneCount}
          onOpenResults={() => setDrawerOpen(true)}
          onExit={onChoosePlaylist}
        />
      )}
      <main className={gameStatus === "idle" ? "app-main app-main--wide" : "app-main"}>
        {screen}
      </main>
    </div>
  );
}