import { useEffect, useState } from "react";
import { errorMessage, listServiceOrders, type Paginated, type ServiceOrderSummary } from "../../api/serviceOrders";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";

const PAGE_SIZE = 20;

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

interface ServiceOrderListPageProps {
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (publicId: string) => void;
  onStartOpening: () => void;
}

export function ServiceOrderListPage({ page, onPageChange, onOpen, onStartOpening }: ServiceOrderListPageProps) {
  const [result, setResult] = useState<Paginated<ServiceOrderSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [awaitingPickup, setAwaitingPickup] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listServiceOrders(page, PAGE_SIZE, controller.signal, awaitingPickup)
      .then(setResult)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason, "list"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, reload, awaitingPickup]);

  const hasRows = Boolean(result?.data.length);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Atendimento técnico</p>
          <h1>Ordens de Serviço</h1>
          <p className="muted">Consulte ordens confirmadas e seus registros.</p>
        </div>
        <div className="page-heading__actions">
          <label className="compact-filter"><input type="checkbox" checked={awaitingPickup} onChange={(event) => setAwaitingPickup(event.target.checked)} />Aguardando retirada</label>
          <span className="count-pill">{result?.pagination.total ?? "—"} registros</span>
          <button className="button button--primary" type="button" onClick={onStartOpening}>Nova OS</button>
        </div>
      </div>

      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyMessage={result?.pagination.total ? "Não há Ordens de Serviço nesta página." : "Ainda não há Ordens de Serviço confirmadas."}
        onRetry={() => setReload((value) => value + 1)}
      />

      {hasRows && result && (
        <>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Número</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Aberta em</th><th><span className="sr-only">Ação</span></th></tr>
                </thead>
                <tbody>
                  {result.data.map((order) => (
                    <tr key={order.publicId}>
                      <td><span className="order-number">{order.visibleNumber}</span><span className="table-subtext">{order.macroStatus}</span></td>
                      <td>{order.customer.name}</td>
                      <td><span>{[order.equipment.type, order.equipment.brand, order.equipment.model].filter(Boolean).join(" · ")}</span><span className="table-subtext">Série: {order.equipment.serialNumber || "Não identificada"}</span></td>
                      <td><span className="status-badge">{order.operationalSituation}</span></td>
                      <td>{dateLabel(order.confirmedAt || order.openedAt || order.createdAt)}</td>
                      <td><button className="text-button" onClick={() => onOpen(order.publicId)}>Ver detalhes <span aria-hidden="true">→</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationControls page={result.pagination.page} totalPages={result.pagination.totalPages} total={result.pagination.total} onPageChange={onPageChange} />
        </>
      )}
    </section>
  );
}
