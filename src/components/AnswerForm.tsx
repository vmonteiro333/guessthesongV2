import { useEffect, useRef } from "react";
import { SkipIcon } from "./icons";

type AnswerField = "artist" | "title";

interface AnswerFormProps {
  artist: string;
  title: string;
  onChange: (field: AnswerField, value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  canType: boolean;
  canAnswer: boolean;
  canSkip: boolean;
  isLastStage: boolean;
}

export default function AnswerForm({
  artist,
  title,
  onChange,
  onSubmit,
  onSkip,
  canType,
  canAnswer,
  canSkip,
  isLastStage,
}: AnswerFormProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const artistRef = useRef<HTMLInputElement>(null);
  const hasSong = title.trim().length > 0;

  useEffect(() => {
    if (!canAnswer) return;
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover)").matches) return;
    if (!title.trim()) titleRef.current?.focus();
    else if (!artist.trim()) artistRef.current?.focus();
  }, [canAnswer, title, artist]);

  return (
    <form
      className="answer-form panel"
      aria-label="Sua resposta"
      onSubmit={(event) => {
        event.preventDefault();
        if (canAnswer && hasSong) onSubmit();
      }}
    >
      <h2 className="panel-title">Sua vez</h2>

      <div className="field">
        <label htmlFor="answer-title">Música</label>
        <input
          ref={titleRef}
          id="answer-title"
          name="title"
          type="text"
          value={title}
          placeholder="Qual é a música?"
          autoComplete="off"
          spellCheck={false}
          disabled={!canType}
          aria-describedby="answer-help"
          onChange={(event) => onChange("title", event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="answer-artist">Artista da sua tentativa</label>
        <input
          ref={artistRef}
          id="answer-artist"
          name="artist"
          type="text"
          value={artist}
          placeholder="Quem canta a música que você chutou? (opcional)"
          autoComplete="off"
          spellCheck={false}
          disabled={!canType}
          aria-describedby="answer-help"
          onChange={(event) => onChange("artist", event.target.value)}
        />
      </div>

      <p className="hint" id="answer-help">
        O palpite é sempre uma <strong>música</strong> — só o artista não vale. Se a música
        chutada for de um artista que participa da música secreta, você ganha a dica amarela.{" "}
        <kbd>Enter</kbd> envia.
      </p>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!canAnswer || !hasSong}>
          Tentar
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={!canSkip}>
          <SkipIcon />
          {isLastStage ? "Não sei — encerrar" : "Pular etapa"}
        </button>
      </div>
    </form>
  );
}