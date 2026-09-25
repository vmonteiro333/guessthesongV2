export default function EmptyState() {
  return (
    <section className="empty-screen panel" aria-labelledby="empty-title">
      <h2 id="empty-title">Nenhuma playlist cadastrada.</h2>
      <p>
        Exporte uma playlist no{" "}
        <a href="https://exportify.app" target="_blank" rel="noreferrer noopener">
          Exportify
        </a>
        , salve o CSV na raiz do projeto e rode:
      </p>
      <p>
        <code>node scripts/convert-csv.mjs playlist.csv "Nome da Playlist"</code>
      </p>
    </section>
  );
}