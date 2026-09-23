interface SpotifyConnectProps {
  onConnect: () => void;
  error?: string | null;
}

export default function SpotifyConnect({ onConnect, error }: SpotifyConnectProps) {
  return (
    <section className="start-screen panel" aria-labelledby="connect-title">
      <p className="start-kicker">Spotify Premium</p>
      <h2 id="connect-title" className="start-title">
        Conectar ao Spotify
      </h2>
      <p className="start-tagline">
        O jogo toca a música completa usando a sua conta. O navegador vira um device
        do Spotify Connect chamado “Guess the Song”.
      </p>
      <ul className="start-rules">
        <li>Requer Spotify Premium na conta usada no login</li>
        <li>Você autoriza uma vez; a sessão se renova sozinha</li>
        <li>Se a sessão expirar, é só conectar de novo</li>
      </ul>
      {error && (
        <p className="feedback feedback--wrong" role="alert">
          <span className="feedback-message">{error}</span>
        </p>
      )}
      <button type="button" className="btn btn-primary btn-large" onClick={onConnect}>
        Entrar com o Spotify
      </button>
    </section>
  );
}