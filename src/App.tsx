import type { ReactNode } from "react";
import { useGame } from "./hooks/useGame";
import { useAudio } from "./hooks/useAudio";
import GameHeader from "./components/GameHeader";
import GameScreen from "./components/GameScreen";
import GameOver from "./components/GameOver";
import StartScreen from "./components/StartScreen";
import EmptyState from "./components/EmptyState";
import { songs as catalog } from "./data/songs";

export default function App() {
  const audio = useAudio();
  const game = useGame(audio);
  const { gameStatus } = game;

  const showHeader =
    catalog.length > 0 && gameStatus !== "idle" && gameStatus !== "game_over";

  let screen: ReactNode;
  if (catalog.length === 0) {
    screen = <EmptyState />;
  } else if (gameStatus === "idle") {
    screen = <StartScreen totalSongs={catalog.length} onStart={game.startGame} />;
  } else if (gameStatus === "game_over") {
    screen = <GameOver score={game.score} history={game.history} onRestart={game.startGame} />;
  } else {
    screen = <GameScreen game={game} audio={audio} />;
  }

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