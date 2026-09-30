/** Fitas de luz verdes (estilo Conference League) fixas na base da tela. */
export default function Ribbons() {
    const paths = [
      "M-100 640 C 280 500, 560 720, 880 560 S 1360 460, 1620 560",
      "M-100 680 C 300 560, 620 760, 940 600 S 1400 520, 1620 620",
      "M-120 600 C 260 470, 600 660, 920 520 S 1340 420, 1620 500",
      "M-100 710 C 340 600, 660 790, 980 640 S 1420 560, 1620 660",
      "M-120 560 C 240 440, 580 620, 900 480 S 1320 380, 1620 450",
    ];
    return (
      <svg
        className="ribbons"
        viewBox="0 0 1440 760"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ribbon-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#00e676" stopOpacity="0" />
            <stop offset="0.45" stopColor="#00e676" stopOpacity="0.55" />
            <stop offset="0.75" stopColor="#00c853" stopOpacity="0.3" />
            <stop offset="1" stopColor="#00c853" stopOpacity="0" />
          </linearGradient>
        </defs>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="url(#ribbon-grad)"
            strokeWidth={i % 2 === 0 ? 2.5 : 1.5}
            strokeLinecap="round"
            opacity={0.35 + (i % 3) * 0.18}
            transform={`translate(0 ${i * -14})`}
          />
        ))}
      </svg>
    );
  }