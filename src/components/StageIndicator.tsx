import type { SnippetPhase } from "../hooks/useAudio";
import { STAGES, formatSeconds, getStagePoints, getStageSeconds } from "../utils/gameRules";

interface StageIndicatorProps {
  stageIndex: number;
  phase: SnippetPhase;
  /** Muda a cada "Ouvir" → reinicia a animação da barra. */
  animKey: string;
}

export default function StageIndicator({ stageIndex, phase, animKey }: StageIndicatorProps) {
  const seconds = formatSeconds(getStageSeconds(stageIndex));
  return (
    <section
      className="stage panel"
      aria-label={`Etapa ${stageIndex + 1} de ${STAGES.length}: trecho de ${seconds}`}
    >
      <div className="stage-meta">
        <span className="stage-count">
          Etapa {stageIndex + 1}/{STAGES.length}
        </span>
        <span className="stage-points">vale {getStagePoints(stageIndex)} pts</span>
        {phase === "playing" && (
          <span className="eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      <p className="stage-time" aria-hidden="true">
        {seconds}
      </p>
      <div className="stage-track" aria-hidden="true">
        {phase === "playing" ? (
          <div
            key={animKey}
            className="stage-fill stage-fill--drain"
            style={{ animationDuration: `${getStageSeconds(stageIndex)}s` }}
          />
        ) : phase === "buffering" ? (
          <div className="stage-fill stage-fill--buffer" />
        ) : (
          <div className="stage-fill stage-fill--idle" />
        )}
      </div>
      <ol className="stage-steps" aria-hidden="true">
        {STAGES.map((value, index) => (
          <li
            key={value}
            className={
              index < stageIndex
                ? "step step--done"
                : index === stageIndex
                  ? "step step--current"
                  : "step"
            }
            title={formatSeconds(value)}
          />
        ))}
      </ol>
    </section>
  );
}