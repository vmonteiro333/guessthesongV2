const COLORS = ["#f2b544", "#4ade80", "#f87171", "#60a5fa", "#fde047", "#a78bfa"];

/** Confete CSS puro no acerto (sem bibliotecas). */
export default function ConfettiBurst() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37 + 5) % 96}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 5) * 0.07}s`,
            animationDuration: `${1.3 + (i % 4) * 0.25}s`,
          }}
        />
      ))}
    </div>
  );
}