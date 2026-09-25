import { NoteIcon } from "./icons";

interface GameHeaderProps {
  score: number;
  currentIndex: number;
  total: number;
  playlistName: string;
}

export default function GameHeader({ score, currentIndex, total, playlistName }: GameHeaderProps) {
  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <NoteIcon />
        </span>
        <h1 className="brand-name">Guess the Song</h1>
      </div>
      <div className="header-meta">
        <span className="chip chip-score" aria-label={`Pontuação: ${score} pontos`}>
          {score} pts
        </span>
        <span className="chip chip-playlist" title={playlistName}>
          {playlistName}
        </span>
        <span className="chip" aria-label={`Música ${currentIndex} de ${total}`}>
          Música {currentIndex}/{total}
        </span>
      </div>
    </header>
  );
}