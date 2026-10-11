import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  assignmentsErrorMessage,
  errorMessage,
  getServiceOrder,
  listAssignableUsers,
  listServiceOrderEvents,
  operationalSituationErrorMessage,
  operationalSituationOptions,
  replaceServiceOrderAssignments,
  updateServiceOrderOperationalSituation,
  type AssignableUser,
  type OperationalSituation,
  type Paginated,
  type ServiceOrderDetail,
  type ServiceOrderEvent,
} from "../../api/serviceOrders";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";
import { SnapshotCard } from "../../components/SnapshotCard";

const PAGE_SIZE = 20;
const ASSIGNABLE_PAGE_SIZE = 100;

interface ServiceOrderDetailPageProps {
  publicId: string;
  csrfToken: string;
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

export function ServiceOrderDetailPage({ publicId, csrfToken, section, eventsPage, onSectionChange, onEventsPageChange, onBack }: ServiceOrderDetailPageProps) {
  const [order, setOrder] = useState<ServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Paginated<ServiceOrderEvent> | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [eventsReload, setEventsReload] = useState(0);
  const [selectedSituation, setSelectedSituation] = useState<OperationalSituation | "">("");
  const [updatingSituation, setUpdatingSituation] = useState(false);
  const [situationMessage, setSituationMessage] = useState<string | null>(null);
  const [situationError, setSituationError] = useState<string | null>(null);
  const [editingAssignments, setEditingAssignments] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assignablePages, setAssignablePages] = useState<Paginated<AssignableUser>["pagination"] | null>(null);
  const [assignableLoading, setAssignableLoading] = useState(false);
  const [assignableError, setAssignableError] = useState<string | null>(null);
  const [assignableSearchInput, setAssignableSearchInput] = useState("");
  const [assignableSearch, setAssignableSearch] = useState("");
  const [assignablePage, setAssignablePage] = useState(1);
  const [assignmentLabels, setAssignmentLabels] = useState<Record<string, string>>({});
  const assignmentLabelsRef = useRef<Record<string, string>>({});
  const [selectedUserPublicIds, setSelectedUserPublicIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  function mergeAssignmentLabels(labels: Record<string, string>) {
    assignmentLabelsRef.current = { ...assignmentLabelsRef.current, ...labels };
    setAssignmentLabels(assignmentLabelsRef.current);
  }

  const currentSituation = operationalSituationOptions.find(({ label }) => label === order?.operationalSituation)?.value;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getServiceOrder(publicId, controller.signal)
      .then((response) => {
        setOrder(response.data);
        const current = operationalSituationOptions.find(({ label }) => label === response.data.operationalSituation)?.value;
        setSelectedSituation(current ?? "");
      })
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
  }, [publicId, section, eventsPage, reload, eventsReload]);

  const assignedIdsKey = order?.assignedUserPublicIds.join(",") ?? "";
  useEffect(() => {
    if (!order?.assignedUserPublicIds.length) return;
    const unresolvedAtStart = order.assignedUserPublicIds.filter((id) => !assignmentLabelsRef.current[id]);
    if (!unresolvedAtStart.length) return;
    const controller = new AbortController();
    async function resolveAssignedUsernames() {
      let unresolved = unresolvedAtStart;
      let page = 1;
      let totalPages = 1;
      while (unresolved.length && page <= totalPages && !controller.signal.aborted) {
        const result = await listAssignableUsers(page, ASSIGNABLE_PAGE_SIZE, "", controller.signal);
        totalPages = result.pagination.totalPages;
        const labels = Object.fromEntries(result.data.map((user) => [user.publicId, user.username]));
        mergeAssignmentLabels(labels);
        unresolved = unresolved.filter((id) => !labels[id]);
        page += 1;
      }
    }
    // Leitores sem permissão continuam vendo o detalhe; nesse caso os nomes não são consultáveis.
    void resolveAssignedUsernames().catch(() => undefined);
    return () => controller.abort();
  }, [publicId, assignedIdsKey]);

  useEffect(() => {
    if (!editingAssignments) return;
    const controller = new AbortController();
    setAssignableLoading(true);
    setAssignableError(null);
    listAssignableUsers(assignablePage, ASSIGNABLE_PAGE_SIZE, assignableSearch, controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setAssignableUsers(result.data);
        setAssignablePages(result.pagination);
        mergeAssignmentLabels(Object.fromEntries(result.data.map((user) => [user.publicId, user.username])));

        // Os detalhes guardam os identificadores públicos atuais. Procura apenas os nomes ainda não
        // resolvidos, percorrendo páginas limitadas pelo total informado pelo servidor.
        if (assignablePage === 1 && !assignableSearch && order?.assignedUserPublicIds.length) {
          let unresolved = order.assignedUserPublicIds.filter((id) => !assignmentLabels[id]
            && !result.data.some((user) => user.publicId === id));
          let page = 2;
          while (unresolved.length && page <= result.pagination.totalPages && !controller.signal.aborted) {
            const next = await listAssignableUsers(page, ASSIGNABLE_PAGE_SIZE, "", controller.signal);
            const labels = Object.fromEntries(next.data.map((user) => [user.publicId, user.username]));
            mergeAssignmentLabels(labels);
            unresolved = unresolved.filter((id) => !labels[id]);
            page += 1;
          }
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setAssignableError(assignmentsErrorMessage(reason, "list"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAssignableLoading(false);
      });
    return () => controller.abort();
  }, [editingAssignments, assignablePage, assignableSearch, publicId]);

  async function saveSituation() {
    if (!currentSituation || !selectedSituation || selectedSituation === currentSituation || updatingSituation) return;
    setUpdatingSituation(true);
    setSituationMessage(null);
    setSituationError(null);
    try {
      const response = await updateServiceOrderOperationalSituation(publicId, selectedSituation, csrfToken);
      setOrder(response.data);
      const current = operationalSituationOptions.find(({ label }) => label === response.data.operationalSituation)?.value;
      setSelectedSituation(current ?? "");
      setSituationMessage("Situação operacional atualizada.");
      if (section === "events") setEventsReload((value) => value + 1);
    } catch (reason) {
      setSituationError(operationalSituationErrorMessage(reason));
    } finally {
      setUpdatingSituation(false);
    }
  }

  function sameUserSet(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((id) => right.includes(id));
  }

  function openAssignmentsEditor() {
    if (!order) return;
    setSelectedUserPublicIds(order.assignedUserPublicIds);
    setAssignableSearchInput("");
    setAssignableSearch("");
    setAssignablePage(1);
    setAssignmentMessage(null);
    setAssignmentError(null);
    setEditingAssignments(true);
  }

  function submitAssignableSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignablePage(1);
    setAssignableSearch(assignableSearchInput.trim());
  }

  function toggleSelectedUser(publicId: string) {
    setSelectedUserPublicIds((current) => current.includes(publicId)
      ? current.filter((id) => id !== publicId)
      : [...current, publicId]);
    setAssignmentMessage(null);
    setAssignmentError(null);
  }

  async function saveAssignments() {
    if (!order || savingAssignments) return;
    if (sameUserSet(order.assignedUserPublicIds, selectedUserPublicIds)) {
      setAssignmentMessage("Nenhuma alteração nos responsáveis.");
      return;
    }
    setSavingAssignments(true);
    setAssignmentMessage(null);
    setAssignmentError(null);
    try {
      const response = await replaceServiceOrderAssignments(publicId, selectedUserPublicIds, csrfToken);
      setOrder(response.data);
      setSelectedUserPublicIds(response.data.assignedUserPublicIds);
      mergeAssignmentLabels(Object.fromEntries(assignableUsers.map((user) => [user.publicId, user.username])));
      setAssignmentMessage("Responsáveis da OS atualizados.");
      setEditingAssignments(false);
      setEventsReload((value) => value + 1);
    } catch (reason) {
      setAssignmentError(assignmentsErrorMessage(reason, "update"));
    } finally {
      setSavingAssignments(false);
    }
  }

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
              <section className="info-card situation-editor" aria-labelledby="situation-editor-title">
                <div className="section-heading">
                  <div><h2 id="situation-editor-title">Situação operacional</h2><p>A regra de transição e a autorização são validadas pelo Backend.</p></div>
                </div>
                <div className="situation-form">
                  <label htmlFor="operational-situation">Nova situação</label>
                  <select
                    id="operational-situation"
                    value={selectedSituation}
                    onChange={(event) => { setSelectedSituation(event.target.value as OperationalSituation); setSituationMessage(null); setSituationError(null); }}
                    disabled={!currentSituation || updatingSituation}
                  >
                    {operationalSituationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="button button--primary" type="button" onClick={() => void saveSituation()} disabled={!currentSituation || !selectedSituation || selectedSituation === currentSituation || updatingSituation}>
                    {updatingSituation ? "Salvando…" : "Salvar situação"}
                  </button>
                </div>
                {situationError && <p className="form-message form-message--error" role="alert">{situationError}</p>}
                {situationMessage && <p className="form-message form-message--success" role="status">{situationMessage}</p>}
              </section>
              <section className="info-card assignments-editor" aria-labelledby="assignments-title">
                <div className="section-heading">
                  <div><h2 id="assignments-title">Responsáveis nominais</h2><p>Administração é uma fila; responsáveis nominais são escolhidos explicitamente.</p></div>
                </div>
                {order.assignedUserPublicIds.length ? (
                  <ul className="assignment-current-list" aria-label="Responsáveis nominais atuais">
                    {order.assignedUserPublicIds.map((userPublicId) => (
                      <li key={userPublicId}>{assignmentLabels[userPublicId] ?? "Usuário indisponível"}</li>
                    ))}
                  </ul>
                ) : <p className="muted">Nenhum responsável nominal atribuído.</p>}
                {assignmentMessage && <p className="form-message form-message--success" role="status">{assignmentMessage}</p>}
                {!editingAssignments ? (
                  <button className="button button--secondary" type="button" onClick={openAssignmentsEditor}>Editar responsáveis</button>
                ) : (
                  <div className="assignment-form">
                    <form className="assignment-search" onSubmit={submitAssignableSearch}>
                      <label htmlFor="assignable-user-search">Buscar usuário por username</label>
                      <div>
                        <input id="assignable-user-search" value={assignableSearchInput} onChange={(event) => setAssignableSearchInput(event.target.value)} maxLength={50} />
                        <button className="button button--secondary" type="submit" disabled={assignableLoading}>Buscar</button>
                      </div>
                    </form>
                    {assignableError && <p className="form-message form-message--error" role="alert">{assignableError}</p>}
                    {assignableLoading ? <p role="status">Carregando usuários atribuíveis…</p> : null}
                    {!assignableLoading && !assignableError && (
                      <>
                        <p className="muted">Selecione os responsáveis. Salvar substitui a lista atual; deixe a seleção vazia para remover todos.</p>
                        <ul className="assignable-user-list" aria-label="Usuários atribuíveis">
                          {assignableUsers.map((user) => (
                            <li key={user.publicId}>
                              <label><input type="checkbox" checked={selectedUserPublicIds.includes(user.publicId)} onChange={() => toggleSelectedUser(user.publicId)} /> {user.username}</label>
                            </li>
                          ))}
                        </ul>
                        {!assignableUsers.length && <p className="muted">Nenhum usuário ativo encontrado para esta busca.</p>}
                        {assignablePages && assignablePages.totalPages > 1 && (
                          <div className="assignment-pagination" aria-label="Paginação dos usuários atribuíveis">
                            <button className="button button--secondary" type="button" disabled={assignablePage <= 1 || assignableLoading} onClick={() => setAssignablePage((page) => page - 1)}>Anterior</button>
                            <span>Página {assignablePages.page} de {assignablePages.totalPages}</span>
                            <button className="button button--secondary" type="button" disabled={assignablePage >= assignablePages.totalPages || assignableLoading} onClick={() => setAssignablePage((page) => page + 1)}>Próxima</button>
                          </div>
                        )}
                        <div className="assignment-selected">
                          <h3>Selecionados ({selectedUserPublicIds.length})</h3>
                          {selectedUserPublicIds.length ? (
                            <ul>
                              {selectedUserPublicIds.map((id) => {
                                const label = assignmentLabels[id] ?? assignableUsers.find((user) => user.publicId === id)?.username ?? "Usuário indisponível";
                                return <li key={id}><span>{label}</span><button className="text-button" type="button" onClick={() => toggleSelectedUser(id)} aria-label={`Remover ${label}`}>Remover</button></li>;
                              })}
                            </ul>
                          ) : <p className="muted">Nenhum usuário selecionado.</p>}
                        </div>
                      </>
                    )}
                    <div className="assignment-actions">
                      <button className="button button--primary" type="button" onClick={() => void saveAssignments()} disabled={assignableLoading || savingAssignments || Boolean(assignableError) || sameUserSet(order.assignedUserPublicIds, selectedUserPublicIds)}>
                        {savingAssignments ? "Salvando…" : "Salvar responsáveis"}
                      </button>
                      <button className="button button--secondary" type="button" onClick={() => { setEditingAssignments(false); setAssignmentError(null); }} disabled={savingAssignments}>Cancelar</button>
                    </div>
                    {assignmentError && <p className="form-message form-message--error" role="alert">{assignmentError}</p>}
                  </div>
                )}
              </section>
              <div className="snapshot-grid-cards">
                <SnapshotCard title="Retrato do cliente" snapshot={order.customerSnapshotJson} />
                <SnapshotCard title="Retrato do equipamento" snapshot={order.equipmentSnapshotJson} />
              </div>
            </div>
          ) : (
            <section className="history-section">
              <div className="section-heading"><div><h2>Histórico da OS</h2><p>Eventos registrados pelo sistema, do mais recente para o mais antigo.</p></div></div>
              <AsyncState loading={eventsLoading} error={eventsError} empty={!eventsLoading && !eventsError && !events?.data.length} emptyMessage="Esta OS ainda não possui eventos para exibir." onRetry={() => setEventsReload((value) => value + 1)} />
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
