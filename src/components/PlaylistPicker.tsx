import { assetUrl } from "../config/assets";
import type { Playlist } from "../types/playlist";

interface PlaylistPickerProps {
  playlists: Playlist[];
  onSelect: (playlist: Playlist) => void;
}

export default function PlaylistPicker({ playlists, onSelect }: PlaylistPickerProps) {
  return (
    <section className="start-screen panel" aria-labelledby="picker-title">
      <p className="start-kicker">Escolha a playlist</p>
      <h2 id="picker-title" className="start-title">
        Com qual a gente joga?
      </h2>
      <div className="picker-list">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            className="picker-item"
            onClick={() => onSelect(playlist)}
          >
            <PlaylistCover playlist={playlist} />
            <span className="picker-name">{playlist.name}</span>
            <span className="picker-count">
              {playlist.songs.length} música{playlist.songs.length === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </div>
      <p className="start-footnote">
        Para adicionar mais: <code>node scripts/convert-csv.mjs playlist.csv "Nome"</code>
      </p>
    </section>
  );
}

function PlaylistCover({ playlist }: { playlist: Playlist }) {
  const src = playlist.cover ? assetUrl(playlist.cover) : null;
  if (src) {
    return <img className="picker-cover" src={src} alt="" loading="lazy" />;
  }
  // Fallback: iniciais da playlist (nada quebra sem imagem)
  return (
    <span className="picker-cover picker-cover--fallback" aria-hidden="true">
      {playlist.name.slice(0, 2).toUpperCase()}
    </span>
  );
}