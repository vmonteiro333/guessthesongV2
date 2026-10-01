import { STAGES, STAGE_POINTS, formatSeconds, getStageSeconds } from "../utils/gameRules";

interface StageIndicatorProps {
  stageIndex: number;
}

export default function StageIndicator({ stageIndex }: StageIndicatorProps) {
  const seconds = formatSeconds(getStageSeconds(stageIndex));
  const critical = stageIndex >= STAGES.length - 1;

  return (
    <section
      className={`stage panel${critical ? " stage--critical" : ""}`}
      aria-label={`Etapa ${stageIndex + 1} de ${STAGES.length}: trecho de ${seconds}, vale ${STAGE_POINTS[stageIndex]} pontos`}
    >
      <div className="stage-meta">
        <span className="stage-count">
          Rodada {stageIndex + 1} / {STAGES.length}
        </span>
        {critical && <span className="stage-critical-tag">última chance</span>}
        {/* key remonta o span a cada etapa → animação de queda de valor */}
        <span key={stageIndex} className="stage-points">
          vale {STAGE_POINTS[stageIndex]} pts
        </span>
      </div>

      <p className="stage-time" aria-hidden="true">
        {seconds}
      </p>

      {/* escada de valor: 7 → 1, perdidos riscados, atual em destaque */}
      <div className="value-ladder" aria-hidden="true">
        {STAGE_POINTS.map((points, index) => (
          <span
            key={points}
            className={
              index < stageIndex
                ? "lad lad--lost"
                : index === stageIndex
                  ? "lad lad--current"
                  : "lad"
            }
          >
            {points}
          </span>
        ))}
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