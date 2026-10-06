import { assetUrl } from "../config/assets";
import type { Playlist } from "../types/playlist";

interface PlaylistPickerProps {
  playlists: Playlist[];
  onSelect: (playlist: Playlist) => void;
}

export default function PlaylistPicker({ playlists, onSelect }: PlaylistPickerProps) {
  return (
    <section className="start-screen" aria-labelledby="picker-title">
      <p className="start-kicker">Escolha sua playlist</p>
      <h2 id="picker-title" className="start-title">
        Com qual vibe você vai jogar?
      </h2>
      <p className="start-tagline">
        Trechos de 0,1s a 16s. Quanto menos áudio precisar, mais pontos vale.
      </p>

      <div className="picker-list">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            className="picker-item"
            onClick={() => onSelect(playlist)}
          >
            <PlaylistCover playlist={playlist} />
            <span className="picker-item-body">
              <span className="picker-text">
                <span className="picker-name">{playlist.name}</span>
                {playlist.description && (
                  <span className="picker-description">{playlist.description}</span>
                )}
              </span>
              <span className="picker-count">
                {playlist.songs.length} música{playlist.songs.length === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="start-footnote">
        Para adicionar mais: <code>node scripts/convert-csv.mjs playlist.csv "Nome" "Descrição"</code>
      </p>
    </section>
  );
}

function PlaylistCover({ playlist }: { playlist: Playlist }) {
  const src = playlist.cover ? assetUrl(playlist.cover) : null;
  if (src) {
    return <img className="picker-cover" src={src} alt="" loading="lazy" />;
  }
  return (
    <span className="picker-cover--fallback" aria-hidden="true">
      {playlist.name.slice(0, 2).toUpperCase()}
    </span>
  );
}