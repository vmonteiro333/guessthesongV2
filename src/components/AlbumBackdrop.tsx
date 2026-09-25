interface AlbumBackdropProps {
    coverUrl: string | null;
    /** Rodada encerrada: capa transiciona para mais nítida (revelação). */
    revealed: boolean;
  }
  
  /**
   * Fundo ambiente: a capa fica FORTEMENTE desfocada durante a rodada
   * (blur pesado = apenas manchas de cor, texto ilegível — não entrega a
   * resposta) e transiciona para mais nítida no fim, como revelação.
   */
  export default function AlbumBackdrop({ coverUrl, revealed }: AlbumBackdropProps) {
    return (
      <div className="backdrop" aria-hidden="true">
        {coverUrl && (
          <img
            key={coverUrl}
            src={coverUrl}
            alt=""
            className={revealed ? "backdrop-img backdrop-img--revealed" : "backdrop-img"}
          />
        )}
        <div className="backdrop-tint" />
      </div>
    );
  }