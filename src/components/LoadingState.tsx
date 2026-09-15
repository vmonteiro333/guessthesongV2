interface LoadingStateProps {
    message?: string;
  }
  
  export default function LoadingState({ message = "Carregando…" }: LoadingStateProps) {
    return (
      <div className="loading panel" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    );
  }