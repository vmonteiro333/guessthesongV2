import { useEffect, useRef } from "react";
import { SkipIcon } from "./icons";

interface AnswerFormProps {
  title: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  canType: boolean;
  canAnswer: boolean;
  canSkip: boolean;
  isLastStage: boolean;
}

export default function AnswerForm({
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
  const hasSong = title.trim().length > 0;

  useEffect(() => {
    if (!canAnswer) return;
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover)").matches) return;
    titleRef.current?.focus();
  }, [canAnswer]);

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
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <p className="hint">
        O palpite é sempre uma <strong>música</strong>. Chutou uma música de um artista que
        participa da secreta? Você recebe a dica amarela. <kbd>Enter</kbd> envia.
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