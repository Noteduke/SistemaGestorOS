import { useEffect, useState } from "react";
import {
  errorMessage,
  getServiceOrder,
  listServiceOrderEvents,
  type Paginated,
  type ServiceOrderDetail,
  type ServiceOrderEvent,
} from "../../api/serviceOrders";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";
import { SnapshotCard } from "../../components/SnapshotCard";

const PAGE_SIZE = 20;

interface ServiceOrderDetailPageProps {
  publicId: string;
  section: "details" | "events";
  eventsPage: number;
  onSectionChange: (section: "details" | "events") => void;
  onEventsPageChange: (page: number) => void;
  onBack: () => void;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function eventValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function eventLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

export function ServiceOrderDetailPage({ publicId, section, eventsPage, onSectionChange, onEventsPageChange, onBack }: ServiceOrderDetailPageProps) {
  const [order, setOrder] = useState<ServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Paginated<ServiceOrderEvent> | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getServiceOrder(publicId, controller.signal)
      .then((response) => setOrder(response.data))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason, "detail"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [publicId, reload]);

  useEffect(() => {
    if (section !== "events") return;
    const controller = new AbortController();
    setEventsLoading(true);
    setEventsError(null);
    listServiceOrderEvents(publicId, eventsPage, PAGE_SIZE, controller.signal)
      .then(setEvents)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setEventsError(errorMessage(reason, "events"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false);
      });
    return () => controller.abort();
  }, [publicId, section, eventsPage, reload]);

  return (
    <section className="page-section">
      <button className="back-link" onClick={onBack}>← Voltar para Ordens de Serviço</button>
      <AsyncState loading={loading} error={error} onRetry={() => setReload((value) => value + 1)} />
      {!loading && !error && order && (
        <>
          <div className="page-heading detail-heading">
            <div>
              <p className="eyebrow">Ordem de Serviço confirmada</p>
              <h1>{order.visibleNumber}</h1>
              <p className="muted">Cliente: {order.customer.name} · {order.equipment.type} {order.equipment.brand} {order.equipment.model}</p>
            </div>
            <span className="status-badge">{order.operationalSituation}</span>
          </div>

          <div className="tabs" role="group" aria-label="Seções da Ordem de Serviço">
            <button aria-pressed={section === "details"} className={section === "details" ? "tab tab--active" : "tab"} onClick={() => onSectionChange("details")}>Resumo</button>
            <button aria-pressed={section === "events"} className={section === "events" ? "tab tab--active" : "tab"} onClick={() => onSectionChange("events")}>Histórico</button>
          </div>

          {section === "details" ? (
            <div className="detail-content">
              <section className="info-card">
                <div className="section-heading"><div><h2>Dados da OS</h2><p>Informações atuais da ordem confirmada</p></div><span className="status-badge">{order.macroStatus}</span></div>
                <dl className="detail-grid">
                  <div><dt>Número</dt><dd>{order.visibleNumber}</dd></div>
                  <div><dt>Valor numérico</dt><dd>{order.numberValue}</dd></div>
                  <div><dt>Situação operacional</dt><dd>{order.operationalSituation}</dd></div>
                  <div><dt>Cliente</dt><dd>{order.customer.name}</dd></div>
                  <div><dt>Equipamento</dt><dd>{[order.equipment.type, order.equipment.brand, order.equipment.model].filter(Boolean).join(" · ")}</dd></div>
                  <div><dt>Número de série</dt><dd>{order.equipment.serialNumber || "Não identificado"}</dd></div>
                  <div><dt>Confirmada em</dt><dd>{dateLabel(order.confirmedAt)}</dd></div>
                  <div><dt>Atualizada em</dt><dd>{dateLabel(order.updatedAt)}</dd></div>
                  {order.complaint && <div className="detail-grid__wide"><dt>Reclamação</dt><dd>{order.complaint}</dd></div>}
                  {order.intakeObservations && <div className="detail-grid__wide"><dt>Observações de entrada</dt><dd>{order.intakeObservations}</dd></div>}
                </dl>
              </section>
              <div className="snapshot-grid-cards">
                <SnapshotCard title="Retrato do cliente" snapshot={order.customerSnapshotJson} />
                <SnapshotCard title="Retrato do equipamento" snapshot={order.equipmentSnapshotJson} />
              </div>
            </div>
          ) : (
            <section className="history-section">
              <div className="section-heading"><div><h2>Histórico da OS</h2><p>Eventos registrados pelo sistema, do mais recente para o mais antigo.</p></div></div>
              <AsyncState loading={eventsLoading} error={eventsError} empty={!eventsLoading && !eventsError && !events?.data.length} emptyMessage="Esta OS ainda não possui eventos para exibir." onRetry={() => setReload((value) => value + 1)} />
              {events?.data.length ? (
                <>
                  <ol className="timeline">
                    {events.data.map((event, index) => (
                      <li className="timeline-item" key={`${event.eventType}-${event.occurredAt}-${index}`}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <article className="event-card">
                          <div className="event-heading"><div><h3>{event.eventType.replaceAll("_", " ")}</h3><p>{dateLabel(event.occurredAt)}</p></div><span className="event-number">{event.visibleNumber}</span></div>
                          {event.actor && <p className="event-actor">Responsável: <strong>{event.actor.username}</strong></p>}
                          {event.payload && Object.keys(event.payload).length > 0 && (
                            <dl className="event-payload">
                              {Object.entries(event.payload).map(([key, value]) => <div key={key}><dt>{eventLabel(key)}</dt><dd>{eventValue(value)}</dd></div>)}
                            </dl>
                          )}
                        </article>
                      </li>
                    ))}
                  </ol>
                  <PaginationControls page={events.pagination.page} totalPages={events.pagination.totalPages} total={events.pagination.total} onPageChange={onEventsPageChange} />
                </>
              ) : null}
            </section>
          )}
        </>
      )}
    </section>
  );
}
