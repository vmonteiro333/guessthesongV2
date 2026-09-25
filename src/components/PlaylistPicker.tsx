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