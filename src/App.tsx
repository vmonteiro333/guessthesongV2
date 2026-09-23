import type { ReactNode } from "react";
import { useGame } from "./hooks/useGame";
import { useAudio } from "./hooks/useAudio";
import GameHeader from "./components/GameHeader";
import GameScreen from "./components/GameScreen";
import GameOver from "./components/GameOver";
import StartScreen from "./components/StartScreen";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import SpotifyConnect from "./components/SpotifyConnect";
import { songs as catalog } from "./data/songs";

export default function App() {
  const audio = useAudio();
  const game = useGame(audio);

  let screen: ReactNode;
  if (catalog.length === 0) {
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
  } else if (game.gameStatus === "idle") {
    screen = <StartScreen totalSongs={catalog.length} onStart={game.startGame} />;
  } else if (game.gameStatus === "game_over") {
    screen = <GameOver score={game.score} history={game.history} onRestart={game.startGame} />;
  } else {
    screen = <GameScreen game={game} audio={audio} />;
  }

  const showHeader =
    catalog.length > 0 &&
    audio.serviceStatus === "ready" &&
    game.gameStatus !== "idle" &&
    game.gameStatus !== "game_over";

  return (
    <div className="app">
      {showHeader && (
        <GameHeader
          score={game.score}
          currentIndex={Math.min(game.currentSongIndex + 1, game.queue.length)}
          total={game.queue.length}
        />
      )}
      <main className="app-main">{screen}</main>
    </div>
  );
}