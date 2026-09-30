import { NoteIcon } from "./icons";

interface GameHeaderProps {
  score: number;
  total: number;
  doneCount: number;
  playlistName: string;
  onOpenResults: () => void;
  onExit: () => void;
}

export default function GameHeader({
  score,
  total,
  doneCount,
  playlistName,
  onOpenResults,
  onExit,
}: GameHeaderProps) {
  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <NoteIcon />
        </span>
        <h1 className="brand-name">Guess the Song</h1>
      </div>
      <div className="header-meta">
        <button
          type="button"
          className="chip btn-exit"
          onClick={onExit}
          aria-label="Voltar para a escolha de playlists"
        >
          ←
        </button>
        <span className="chip chip-score" aria-label={`Pontuação: ${score} pontos`}>
          {score} pts
        </span>
        <button
          type="button"
          className="chip btn-results"
          onClick={onOpenResults}
          aria-label={`Ver resultados: ${doneCount} de ${total} rodadas concluídas`}
        >
          Resultados {doneCount}/{total}
        </button>
        <span className="chip chip-playlist" title={playlistName}>
          {playlistName}
        </span>
      </div>
    </header>
  );
}