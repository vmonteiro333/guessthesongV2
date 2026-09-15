import { useEffect, useRef } from "react";

interface StartScreenProps {
  totalSongs: number;
  onStart: () => void;
}

export default function StartScreen({ totalSongs, onStart }: StartScreenProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <section className="start-screen panel" aria-labelledby="start-title">
      <p className="start-kicker">{totalSongs} músicas nesta sessão</p>
      <h2 id="start-title" className="start-title">
        Qual é a música?
      </h2>
      <p className="start-tagline">
        Você ouve trechos cada vez mais longos. Quanto antes acertar, mais pontos vale.
      </p>
      <ul className="start-rules">
        <li>7 trechos por música: 0,1s → 0,5s → 1s → 2s → 4s → 8s → 16s</li>
        <li>Artista + música acertados valem os pontos cheios da etapa</li>
        <li>Só o artista vale metade — e a rodada continua</li>
        <li>Não sabe? Pule a etapa e ouça um trecho maior</li>
      </ul>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-primary btn-large"
        onClick={onStart}
      >
        Começar a jogar
      </button>
      <p className="start-footnote">
        Áudio via SoundCloud — use fones de ouvido para a melhor experiência.
      </p>
    </section>
  );
}