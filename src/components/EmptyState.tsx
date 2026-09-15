export default function EmptyState() {
    return (
      <section className="empty-screen panel" aria-labelledby="empty-title">
        <h2 id="empty-title">Nenhuma música cadastrada.</h2>
        <p>
          Adicione músicas em <code>src/data/songs.ts</code> e recarregue a página.
        </p>
      </section>
    );
  }