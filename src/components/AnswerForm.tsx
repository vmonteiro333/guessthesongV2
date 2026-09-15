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
  const artistRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const hasInput = artist.trim().length > 0 || title.trim().length > 0;

  // Foco no primeiro campo vazio quando a resposta é liberada — apenas em
  // dispositivos com ponteiro, para não "puxar" o teclado virtual no celular.
  useEffect(() => {
    if (!canAnswer) return;
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover)").matches) return;
    if (!artist.trim()) artistRef.current?.focus();
    else if (!title.trim()) titleRef.current?.focus();
  }, [canAnswer, artist, title]);

  return (
    <form
      className="answer-form panel"
      aria-label="Sua resposta"
      onSubmit={(event) => {
        event.preventDefault();
        if (canAnswer) onSubmit();
      }}
    >
      <h2 className="panel-title">Sua vez</h2>

      <div className="field">
        <label htmlFor="answer-artist">Artista</label>
        <input
          ref={artistRef}
          id="answer-artist"
          name="artist"
          type="text"
          value={artist}
          placeholder="Quem canta?"
          autoComplete="off"
          spellCheck={false}
          disabled={!canType}
          aria-describedby="answer-help"
          onChange={(event) => onChange("artist", event.target.value)}
        />
      </div>

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

      <p className="hint" id="answer-help">
        Pode responder só o artista, só a música ou os dois. <kbd>Enter</kbd> envia.
      </p>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!canAnswer || !hasInput}>
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