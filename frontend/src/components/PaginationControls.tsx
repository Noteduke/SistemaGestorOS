interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, totalPages, total, onPageChange }: PaginationControlsProps) {
  if (total === 0) return <p className="pagination-summary">0 ordens encontradas</p>;

  return (
    <nav className="pagination" aria-label="Paginação das Ordens de Serviço">
      <span className="pagination-summary">{total} {total === 1 ? "ordem" : "ordens"} · Página {page} de {totalPages}</span>
      <div className="pagination-actions">
        <button className="button button--secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Anterior</button>
        <button className="button button--secondary" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Próxima</button>
      </div>
    </nav>
  );
}
