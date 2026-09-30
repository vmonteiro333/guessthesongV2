import type { SnippetPhase } from "../hooks/useAudio";

interface AudioVizProps {
  phase: SnippetPhase;
}

const BARS = 13;

/** Barras de equalizador reativas ao estado do áudio (CSS puro). */
export default function AudioViz({ phase }: AudioVizProps) {
  return (
    <div
      className={
        phase === "playing"
          ? "viz viz--playing"
          : phase === "buffering"
            ? "viz viz--buffering"
            : "viz"
      }
      aria-hidden="true"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} style={{ animationDelay: `${(i * 61) % 700}ms` }} />
      ))}
    </div>
  );
}