interface AsyncStateProps {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
}

export function AsyncState({ loading, error, empty, emptyMessage = "Nenhum registro encontrado.", onRetry }: AsyncStateProps) {
  if (loading) {
    return <div className="state-card" role="status">Carregando…</div>;
  }

  if (error) {
    return (
      <div className="state-card state-card--error" role="alert">
        <p>{error}</p>
        {onRetry && <button className="button button--secondary" onClick={onRetry}>Tentar novamente</button>}
      </div>
    );
  }

  if (empty) return <div className="state-card" role="status">{emptyMessage}</div>;
  return null;
}
