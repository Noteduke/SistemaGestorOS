import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  assignmentsErrorMessage,
  createServiceOrderNote,
  acquireServiceOrderEditControl,
  deleteServiceOrderNote,
  errorMessage,
  getServiceOrder,
  getServiceOrderEditControl,
  heartbeatServiceOrderEditControl,
  listAssignableUsers,
  listServiceOrderHistory,
  operationalSituationErrorMessage,
  operationalSituationOptions,
  replaceServiceOrderAssignments,
  releaseServiceOrderEditControl,
  takeoverServiceOrderEditControl,
  ApiError,
  type ServiceOrderEditControlState,
  updateServiceOrderOperationalSituation,
  type AssignableUser,
  type OperationalSituation,
  type Paginated,
  type ServiceOrderDetail,
  type ServiceOrderHistoryPage,
} from "../../api/serviceOrders";
import { AsyncState } from "../../components/AsyncState";
import { SnapshotCard } from "../../components/SnapshotCard";
import { ServiceOrderBudgetPanel } from "./ServiceOrderBudgetPanel";

const PAGE_SIZE = 20;
const ASSIGNABLE_PAGE_SIZE = 100;

function createEditToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface ServiceOrderDetailPageProps {
  publicId: string;
  csrfToken: string;
  canCreateNote?: boolean;
  canReadBudget?: boolean;
  canEditBudget?: boolean;
  canReadBudgetCosts?: boolean;
  canUpdateBudgetCosts?: boolean;
  canManageEdit?: boolean;
  canTakeoverEdit?: boolean;
  canUpdateSituation?: boolean;
  canManageAssignments?: boolean;
  currentUsername?: string;
  section: "details" | "events";
  onSectionChange: (section: "details" | "events") => void;
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

export function ServiceOrderDetailPage({ publicId, csrfToken, canCreateNote = false, canReadBudget = false, canEditBudget = false, canReadBudgetCosts = false, canUpdateBudgetCosts = false, canManageEdit = false, canTakeoverEdit = false, canUpdateSituation = false, canManageAssignments = false, currentUsername, section, onSectionChange, onBack }: ServiceOrderDetailPageProps) {
  const [order, setOrder] = useState<ServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ServiceOrderHistoryPage | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [eventsReload, setEventsReload] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleting, setNoteDeleting] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
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
  const [budgetItemCount, setBudgetItemCount] = useState(0);
  const [editToken] = useState(() => createEditToken());
  const [editControl, setEditControl] = useState<ServiceOrderEditControlState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editControlMessage, setEditControlMessage] = useState<string | null>(null);
  const [editControlError, setEditControlError] = useState<string | null>(null);
  const [takingOver, setTakingOver] = useState(false);
  const [stayReadOnly, setStayReadOnly] = useState(false);
  const isEditingRef = useRef(false);
  const editTokenRef = useRef(editToken);
  const generationRef = useRef<number | null>(null);
  const everOwnedRef = useRef(false);
  const invalidatedRef = useRef(false);
  const orderLoaded = Boolean(order);

  function markEditControlLost() {
    invalidatedRef.current = true;
    isEditingRef.current = false;
    setIsEditing(false);
    setEditControlMessage("O controle desta OS foi transferido para outro contexto. A tela foi alterada para somente leitura.");
    void getServiceOrderEditControl(publicId, editToken).then((result) => setEditControl(result.data)).catch(() => undefined);
  }

  useEffect(() => {
    if (!orderLoaded) return;
    let active = true;
    const refreshControl = async () => {
      try {
        const result = await getServiceOrderEditControl(publicId, editToken);
        if (!active) return;
        if (generationRef.current === null) generationRef.current = result.data.generation;
        else if (everOwnedRef.current && result.data.generation !== generationRef.current) {
          generationRef.current = result.data.generation;
          markEditControlLost();
        }
        if (invalidatedRef.current) { setEditControl(result.data); return; }
        if (result.data.isCurrentContext) {
          everOwnedRef.current = true;
          setEditControl(result.data); isEditingRef.current = true; setIsEditing(true); setEditControlError(null); return;
        }
        if (!result.data.held && canManageEdit && !stayReadOnly) {
          try {
            const acquired = await acquireServiceOrderEditControl(publicId, csrfToken, editToken);
            if (!active) {
              await releaseServiceOrderEditControl(publicId, csrfToken, editToken).catch(() => undefined);
              return;
            }
            generationRef.current = acquired.data.generation; everOwnedRef.current = true;
            const next = { held: true, holder: currentUsername ? { publicId: "", username: currentUsername } : null, isSameUser: true, expiresAt: acquired.data.expiresAt, isCurrentContext: true, generation: acquired.data.generation, heartbeatIntervalSeconds: acquired.data.heartbeatIntervalSeconds };
            setEditControl(next); isEditingRef.current = true; setIsEditing(true); setEditControlError(null); return;
          } catch (reason) {
            if (reason instanceof ApiError && reason.code !== "SERVICE_ORDER_EDIT_CONTROL_HELD") throw reason;
            const latest = await getServiceOrderEditControl(publicId, editToken);
            if (active) { setEditControl(latest.data); setIsEditing(false); isEditingRef.current = false; }
            return;
          }
        }
        setEditControl(result.data); setIsEditing(false); isEditingRef.current = false;
      } catch (reason) {
        if (active) { setEditControlError(reason instanceof Error ? reason.message : "Não foi possível consultar o controle de edição."); setIsEditing(false); isEditingRef.current = false; }
      }
    };
    void refreshControl();
    const poll = window.setInterval(() => void refreshControl(), 15_000);
    return () => {
      active = false;
      window.clearInterval(poll);
      if (isEditingRef.current) void releaseServiceOrderEditControl(publicId, csrfToken, editTokenRef.current).catch(() => undefined);
    };
  }, [publicId, csrfToken, editToken, canManageEdit, currentUsername, orderLoaded, stayReadOnly]);

  useEffect(() => {
    if (!isEditing) return;
    const interval = window.setInterval(() => {
      void heartbeatServiceOrderEditControl(publicId, csrfToken, editToken).catch(() => markEditControlLost());
    }, (editControl?.heartbeatIntervalSeconds ?? 60) * 1000);
    return () => window.clearInterval(interval);
  }, [publicId, csrfToken, editToken, isEditing, editControl?.heartbeatIntervalSeconds]);

  useEffect(() => { if (!isEditing) setEditingAssignments(false); }, [isEditing]);

  async function takeOverEditing() {
    const transferOwnTab = Boolean(editControl?.isSameUser);
    if (takingOver || (!transferOwnTab && !canTakeoverEdit)) return;
    const confirmed = transferOwnTab
      ? window.confirm("Transferir edição para esta aba? A outra aba perderá o controle e ficará somente para leitura.")
      : window.confirm(`Assumir edição desta OS?\n\n${editControl?.holder?.username ?? "Outro usuário"} está editando esta OS neste momento. Se você continuar, essa pessoa perderá imediatamente a possibilidade de fazer alterações.`);
    if (!confirmed) return;
    setTakingOver(true); setEditControlError(null);
    try {
      const response = await takeoverServiceOrderEditControl(publicId, csrfToken, editToken);
      generationRef.current = response.data.generation; everOwnedRef.current = true; invalidatedRef.current = false;
      const next = { held: true, holder: currentUsername ? { publicId: "", username: currentUsername } : null, isSameUser: true, expiresAt: response.data.expiresAt, isCurrentContext: true, generation: response.data.generation, heartbeatIntervalSeconds: response.data.heartbeatIntervalSeconds };
      setEditControl(next); isEditingRef.current = true; setIsEditing(true); setEditControlMessage(null);
    } catch (reason) { setEditControlError(reason instanceof Error ? reason.message : "Não foi possível assumir a edição."); }
    finally { setTakingOver(false); }
  }

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
    setHistory(null);
    setEventsLoading(true);
    setEventsError(null);
    listServiceOrderHistory(publicId, PAGE_SIZE, undefined, controller.signal)
      .then(setHistory)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setEventsError(errorMessage(reason, "events"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false);
      });
    return () => controller.abort();
  }, [publicId, section, reload, eventsReload]);

  async function loadMoreHistory() {
    if (!history?.nextCursor || moreLoading) return;
    setMoreLoading(true);
    setEventsError(null);
    try {
      const next = await listServiceOrderHistory(publicId, PAGE_SIZE, history.nextCursor);
      setHistory((current) => current && current.nextCursor === history.nextCursor
        ? { ...next, data: [...current.data, ...next.data] } : current);
    } catch (reason) {
      setEventsError(errorMessage(reason, "events"));
    } finally {
      setMoreLoading(false);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateNote || !noteText.trim() || noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      await createServiceOrderNote(publicId, noteText, csrfToken);
      setNoteText("");
      setEventsReload((value) => value + 1);
    } catch (reason) {
      setNoteError(errorMessage(reason, "events"));
    } finally {
      setNoteSaving(false);
    }
  }

  async function removeNote(notePublicId: string) {
    if (noteDeleting || !window.confirm("Excluir esta observação? Esta ação não pode ser desfeita.")) return;
    setNoteDeleting(notePublicId);
    setNoteError(null);
    try {
      await deleteServiceOrderNote(publicId, notePublicId, csrfToken);
      setEventsReload((value) => value + 1);
    } catch (reason) {
      setNoteError(errorMessage(reason, "events"));
    } finally {
      setNoteDeleting(null);
    }
  }

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
      const notAuthorized = selectedSituation === "NOT_AUTHORIZED_REASSEMBLE" || selectedSituation === "NOT_AUTHORIZED_READY_DELIVERY";
      const withdrawBudget = notAuthorized && budgetItemCount > 0 && window.confirm("Deseja retirar todos os itens atuais do orçamento? Esta ação será registrada no histórico e não poderá ser desfeita.");
      const response = await updateServiceOrderOperationalSituation(publicId, selectedSituation, csrfToken, withdrawBudget, editToken);
      setOrder(response.data);
      const current = operationalSituationOptions.find(({ label }) => label === response.data.operationalSituation)?.value;
      setSelectedSituation(current ?? "");
      setSituationMessage("Situação operacional atualizada.");
      if (section === "events") setEventsReload((value) => value + 1);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") markEditControlLost();
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
      const response = await replaceServiceOrderAssignments(publicId, selectedUserPublicIds, csrfToken, editToken);
      setOrder(response.data);
      setSelectedUserPublicIds(response.data.assignedUserPublicIds);
      mergeAssignmentLabels(Object.fromEntries(assignableUsers.map((user) => [user.publicId, user.username])));
      setAssignmentMessage("Responsáveis da OS atualizados.");
      setEditingAssignments(false);
      setEventsReload((value) => value + 1);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") markEditControlLost();
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
          <section className="info-card edit-control-banner" aria-live="polite">
            {isEditing ? <p><strong>Você está editando esta OS.</strong> O controle é renovado automaticamente enquanto esta tela permanecer aberta.</p>
              : editControl?.held && editControl.isSameUser ? <p><strong>Você já está editando esta OS em outra aba.</strong> Esta aba está em somente leitura até a transferência.</p>
                : editControl?.held ? <p><strong>OS em edição por {editControl.holder?.username ?? "outro usuário"}.</strong> Somente visualização.</p>
                : <p><strong>Somente visualização.</strong> {stayReadOnly ? "Esta aba permanecerá sem o controle de edição." : canManageEdit ? "O controle de edição está sendo verificado." : "Você não possui autorização para editar esta OS."}</p>}
            {editControlMessage && <p className="form-message form-message--error" role="alert">{editControlMessage}</p>}
            {editControlError && <p className="form-message form-message--error" role="alert">{editControlError}</p>}
            {!isEditing && editControl?.held && editControl.isSameUser && !stayReadOnly && <button className="button button--secondary" type="button" onClick={() => setStayReadOnly(true)}>Somente visualização</button>}
            {!isEditing && editControl?.held && editControl.isSameUser && canManageEdit && !stayReadOnly && <button className="button button--primary" type="button" onClick={() => void takeOverEditing()} disabled={takingOver}>{takingOver ? "Transferindo…" : "Transferir edição para esta aba"}</button>}
            {!isEditing && editControl?.held && !editControl.isSameUser && canTakeoverEdit && canManageEdit && <button className="button button--primary" type="button" onClick={() => void takeOverEditing()} disabled={takingOver}>{takingOver ? "Assumindo…" : "Assumir edição"}</button>}
          </section>
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
                    disabled={!isEditing || !canUpdateSituation || !currentSituation || updatingSituation}
                  >
                    {operationalSituationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="button button--primary" type="button" onClick={() => void saveSituation()} disabled={!isEditing || !canUpdateSituation || !currentSituation || !selectedSituation || selectedSituation === currentSituation || updatingSituation}>
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
                  <button className="button button--secondary" type="button" onClick={openAssignmentsEditor} disabled={!isEditing || !canManageAssignments}>Editar responsáveis</button>
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
                      <button className="button button--primary" type="button" onClick={() => void saveAssignments()} disabled={!isEditing || assignableLoading || savingAssignments || Boolean(assignableError) || sameUserSet(order.assignedUserPublicIds, selectedUserPublicIds)}>
                        {savingAssignments ? "Salvando…" : "Salvar responsáveis"}
                      </button>
                      <button className="button button--secondary" type="button" onClick={() => { setEditingAssignments(false); setAssignmentError(null); }} disabled={savingAssignments}>Cancelar</button>
                    </div>
                    {assignmentError && <p className="form-message form-message--error" role="alert">{assignmentError}</p>}
                  </div>
                )}
              </section>
              {canReadBudget && <ServiceOrderBudgetPanel
                publicId={publicId}
                csrfToken={csrfToken}
                editToken={editToken}
                canEdit={canEditBudget && isEditing}
                canReadCosts={canReadBudgetCosts}
                canUpdateCosts={canUpdateBudgetCosts}
                onEditControlLost={markEditControlLost}
                isOpen={order.macroStatus === "ABERTA"}
                onActiveCountChange={setBudgetItemCount}
              />}
              <div className="snapshot-grid-cards">
                <SnapshotCard title="Retrato do cliente" snapshot={order.customerSnapshotJson} />
                <SnapshotCard title="Retrato do equipamento" snapshot={order.equipmentSnapshotJson} />
              </div>
            </div>
          ) : (
            <section className="history-section">
              <div className="section-heading"><div><h2>Histórico da OS</h2><p>Eventos do sistema e observações manuais, do mais recente para o mais antigo.</p></div></div>
              {canCreateNote && (
                <form className="note-form" onSubmit={(event) => void addNote(event)}>
                  <label htmlFor="service-order-note">Nova observação</label>
                  <div className="note-form__controls">
                    <input id="service-order-note" type="text" value={noteText} maxLength={255} disabled={noteSaving}
                      onChange={(event) => setNoteText(event.target.value)} />
                    <button className="button button--primary" type="submit" disabled={noteSaving || !noteText.trim()}>
                      {noteSaving ? "Adicionando…" : "Adicionar"}
                    </button>
                  </div>
                </form>
              )}
              {noteError && <p className="form-message form-message--error" role="alert">{noteError}</p>}
              <AsyncState loading={eventsLoading} error={eventsError} empty={!eventsLoading && !eventsError && !history?.data.length} emptyMessage="Esta OS ainda não possui itens de histórico para exibir." onRetry={() => setEventsReload((value) => value + 1)} />
              {history?.data.length ? (
                <>
                  <ol className="timeline">
                    {history.data.map((item, index) => (
                      <li className="timeline-item" key={item.kind === "MANUAL_NOTE" ? item.publicId : `${item.eventType}-${item.occurredAt}-${index}`}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <article className="event-card">
                          {item.kind === "SYSTEM_EVENT" ? (
                            <>
                              <div className="event-heading"><div><h3>Evento do sistema: {item.eventType.replaceAll("_", " ")}</h3><p>{dateLabel(item.occurredAt)}</p></div><span className="event-number">{item.serviceOrderNumber}</span></div>
                              <p className="event-actor">Responsável: <strong>{item.actor.username}</strong></p>
                              {item.payload && Object.keys(item.payload).length > 0 && (
                                <dl className="event-payload">
                                  {Object.entries(item.payload).map(([key, value]) => <div key={key}><dt>{eventLabel(key)}</dt><dd>{eventValue(value)}</dd></div>)}
                                </dl>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="event-heading"><div><h3>Observação manual</h3><p>{dateLabel(item.occurredAt)}</p></div></div>
                              <p className="event-actor">Autor: <strong>{item.actor.username}</strong></p>
                              <p className="note-text">{item.text}</p>
                              {item.canDelete && <button className="button button--secondary" type="button" disabled={noteDeleting === item.publicId}
                                onClick={() => void removeNote(item.publicId)}>{noteDeleting === item.publicId ? "Excluindo…" : "Excluir"}</button>}
                            </>
                          )}
                        </article>
                      </li>
                    ))}
                  </ol>
                  {history.hasMore && <button className="button button--secondary" type="button" disabled={moreLoading}
                    onClick={() => void loadMoreHistory()}>{moreLoading ? "Carregando…" : "Carregar mais"}</button>}
                </>
              ) : null}
            </section>
          )}
        </>
      )}
    </section>
  );
}
