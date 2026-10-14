import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  addManualLaborBudgetItem, addManualPartBudgetItem, addRegisteredBudgetService,
  getServiceOrderBudget, listAvailableCatalogServices, removeBudgetItem, updateBudgetItem,
  ApiError, type AvailableCatalogService, type ServiceOrderBudget, type ServiceOrderBudgetItem,
} from "../../api/serviceOrders";

type Props = { publicId: string; csrfToken: string; editToken: string; expectedRevision: string; canEdit: boolean; canReadCosts: boolean; canUpdateCosts: boolean; isOpen: boolean; onActiveCountChange?: (count: number) => void; onEditControlLost?: () => void; onRevisionChange?: (revision: string) => void; onDirtyChange?: (dirty: boolean) => void; onDataConflict?: () => void };
type Mode = "service" | "labor" | "part";
type Field = "quantity" | "unitPrice" | "description" | "unitCost";
type FieldConflict = { field: Field; label: string; current: string | number | null; wanted: string | number | null };

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "BUDGET_ITEM_DUPLICATE" && typeof error.details?.existingItemPublicId === "string") {
      const existing = document.getElementById(`budget-item-${error.details.existingItemPublicId}`);
      existing?.scrollIntoView({ behavior: "smooth", block: "center" });
      existing?.classList.add("budget-item--conflict");
      window.setTimeout(() => existing?.classList.remove("budget-item--conflict"), 2500);
      return `${error.message} O item existente foi destacado na lista.`;
    }
    return error.message;
  }
  return "Não foi possível concluir a operação do orçamento.";
}

export function ServiceOrderBudgetPanel({ publicId, csrfToken, editToken, expectedRevision, canEdit, canReadCosts, canUpdateCosts, isOpen, onActiveCountChange, onEditControlLost, onRevisionChange, onDirtyChange, onDataConflict }: Props) {
  const [budget, setBudget] = useState<ServiceOrderBudget | null>(null);
  const [services, setServices] = useState<AvailableCatalogService[]>([]);
  const [mode, setMode] = useState<Mode>("service");
  const [selectedService, setSelectedService] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editBase, setEditBase] = useState<ServiceOrderBudgetItem | null>(null);
  const [fieldConflicts, setFieldConflicts] = useState<FieldConflict[]>([]);
  const [fieldChoices, setFieldChoices] = useState<Partial<Record<Field, "current" | "mine">>>({});
  const [removedConflict, setRemovedConflict] = useState<"item" | "composition" | null>(null);
  const [compositionConflict, setCompositionConflict] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCost, setEditCost] = useState("");
  const [busy, setBusy] = useState(false);
  const previousCanEdit = useRef(canEdit);
  const compositionDraftToken = useRef<string | null>(null);
  const holdCompositionDraft = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload(signal?: AbortSignal) {
    const current = await getServiceOrderBudget(publicId, signal);
    if (!signal?.aborted) {
      if (!holdCompositionDraft.current || !compositionDraftToken.current) compositionDraftToken.current = current.compositionToken ?? null;
      setBudget(current); onActiveCountChange?.(current.data.length);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [publicId]);

  useEffect(() => {
    const regained = canEdit && !previousCanEdit.current;
    previousCanEdit.current = canEdit;
    if (regained) void reload().catch((reason: unknown) => setError(errorText(reason)));
  }, [canEdit, publicId]);

  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    listAvailableCatalogServices(controller.signal).then((result) => { if (!controller.signal.aborted) setServices(result.data); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [canEdit, publicId]);

  const activeItems = budget?.data ?? [];
  const editingItem = editBase && editing === editBase.publicId ? editBase : null;
  const dirty = mode !== "service" || Boolean(selectedService) || Boolean(description.trim()) || Boolean(unitPrice.trim()) || Boolean(unitCost.trim()) || quantity !== "1"
    || Boolean(editingItem && (editQuantity !== String(editingItem.quantity) || editPrice !== editingItem.unitPrice
      || editDescription !== (editingItem.origin === "MANUAL" ? editingItem.description : "")
      || editCost !== (editingItem.unitCost ?? "")));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  function reportFailure(reason: unknown) {
    if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") onEditControlLost?.();
    if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_DATA_CONFLICT") onDataConflict?.();
    setError(errorText(reason));
  }

  function holdCompositionBaseline() {
    if (!holdCompositionDraft.current) compositionDraftToken.current = budget?.compositionToken ?? null;
    holdCompositionDraft.current = true;
  }

  function hasAddDraft() {
    return mode !== "service" || Boolean(selectedService) || Boolean(description.trim()) || Boolean(unitPrice.trim()) || Boolean(unitCost.trim()) || quantity !== "1";
  }

  async function submit(event?: FormEvent<HTMLFormElement>, confirmedEventId?: number) {
    event?.preventDefault();
    if (!canEdit || !isOpen || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (mode === "service") {
        const service = services.find((entry) => entry.publicId === selectedService);
        if (!service) throw new Error("Selecione um serviço ativo.");
        const result = await addRegisteredBudgetService(publicId, { servicePublicId: service.publicId, quantity: Number(quantity), ...(unitPrice.trim() ? { unitPrice } : {}), ...(compositionDraftToken.current ? { compositionToken: compositionDraftToken.current } : {}), ...(confirmedEventId ? { compositionConfirmed: confirmedEventId } : {}) }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      } else if (mode === "labor") {
        const result = await addManualLaborBudgetItem(publicId, { description, quantity: Number(quantity), unitPrice, ...(compositionDraftToken.current ? { compositionToken: compositionDraftToken.current } : {}), ...(confirmedEventId ? { compositionConfirmed: confirmedEventId } : {}) }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      } else {
        const result = await addManualPartBudgetItem(publicId, { description, quantity: Number(quantity), unitPrice, ...(canUpdateCosts ? { unitCost: unitCost.trim() || null } : {}), ...(compositionDraftToken.current ? { compositionToken: compositionDraftToken.current } : {}), ...(confirmedEventId ? { compositionConfirmed: confirmedEventId } : {}) }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      }
      setSelectedService(""); setDescription(""); setQuantity("1"); setUnitPrice(""); setUnitCost(""); setCompositionConflict(null); setMessage("Item adicionado ao orçamento.");
      holdCompositionDraft.current = false;
      await reload();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "BUDGET_COMPOSITION_CONFLICT" && typeof reason.details?.compositionEventId === "number") setCompositionConflict(reason.details.compositionEventId);
      reportFailure(reason);
    }
    finally { setBusy(false); }
  }

  function startEdit(item: ServiceOrderBudgetItem) {
    holdCompositionBaseline();
    setEditing(item.publicId); setEditBase(item); setFieldConflicts([]); setFieldChoices({}); setRemovedConflict(null);
    setEditQuantity(String(item.quantity)); setEditPrice(item.unitPrice);
    setEditDescription(item.origin === "MANUAL" ? item.description : ""); setEditCost(item.unitCost ?? "");
    setError(null); setMessage(null);
  }

  async function saveEdit(item: ServiceOrderBudgetItem) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const body: Record<string, unknown> = { expectedVersion: item.version };
      const original: Partial<Record<Field, string | number | null>> = {};
      if (Number(editQuantity) !== item.quantity && fieldChoices.quantity !== "current") { body.quantity = Number(editQuantity); original.quantity = item.quantity; }
      if (editPrice !== item.unitPrice && fieldChoices.unitPrice !== "current") { body.unitPrice = editPrice; original.unitPrice = item.unitPrice; }
      if (item.origin === "MANUAL" && editDescription !== item.description && fieldChoices.description !== "current") { body.description = editDescription; original.description = item.description; }
      if (canUpdateCosts && item.itemType === "MANUAL_PART" && (editCost.trim() || null) !== (item.unitCost ?? null) && fieldChoices.unitCost !== "current") { body.unitCost = editCost.trim() || null; original.unitCost = item.unitCost ?? null; }
      if (!Object.keys(original).length) { setEditing(null); setEditBase(null); setFieldConflicts([]); setMessage("Nenhuma alteração pendente neste item."); holdCompositionDraft.current = hasAddDraft(); await reload(); return; }
      if (item.snapshotToken) { body.snapshotToken = item.snapshotToken; body.original = original; }
      const mine = fieldConflicts.filter(({ field }) => fieldChoices[field] === "mine");
      if (mine.length) {
        body.useMine = mine.map(({ field }) => field);
        body.resolvedCurrent = Object.fromEntries(mine.map(({ field, current }) => [field, current]));
      }
      const result = await updateBudgetItem(publicId, item.publicId, body, csrfToken, editToken, expectedRevision);
      onRevisionChange?.(result.serviceOrderRevision);
      setEditing(null); setEditBase(null); setFieldConflicts([]); setFieldChoices({}); setMessage("Item atualizado."); holdCompositionDraft.current = hasAddDraft(); await reload();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "BUDGET_FIELD_CONFLICT" && Array.isArray(reason.details?.conflicts)) {
        setFieldConflicts(reason.details.conflicts as FieldConflict[]); setFieldChoices({});
      }
      if (reason instanceof ApiError && (reason.code === "BUDGET_ITEM_REMOVED" || reason.code === "BUDGET_COMPOSITION_CONFLICT")) {
        setRemovedConflict(reason.code === "BUDGET_COMPOSITION_CONFLICT" ? "composition" : "item");
      }
      reportFailure(reason);
    }
    finally { setBusy(false); }
  }

  function addRemovedAsNew() {
    if (!editBase) return;
    setMode(editBase.origin === "REGISTERED" ? "service" : editBase.itemType === "MANUAL_PART" ? "part" : "labor");
    setSelectedService(editBase.servicePublicId ?? "");
    setDescription(editDescription || editBase.description); setQuantity(editQuantity); setUnitPrice(editPrice);
    if (canUpdateCosts) setUnitCost(editCost);
    setEditing(null); setEditBase(null); setRemovedConflict(null); setFieldConflicts([]);
    setMessage("Revise o item e adicione novamente. Será criado um novo registro no fim da lista.");
  }

  async function remove(item: ServiceOrderBudgetItem) {
    if (!window.confirm("Deseja remover este item do orçamento?")) return;
    setBusy(true); setError(null); setMessage(null);
    try { const result = await removeBudgetItem(publicId, item.publicId, csrfToken, editToken, expectedRevision); onRevisionChange?.(result.serviceOrderRevision); setMessage("Item removido do orçamento."); await reload(); }
    catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  return (
    <section className="info-card budget-panel" aria-labelledby="budget-title">
      <div className="section-heading"><div><h2 id="budget-title">Orçamento</h2><p>Serviços e peças vinculados à OS. O total é calculado pelo servidor.</p></div></div>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {message && <p className="form-message form-message--success" role="status">{message}</p>}
      {fieldConflicts.length > 0 && editingItem && <div className="form-message form-message--error" role="alert">
        <p>Escolha como resolver cada campo. Seus valores locais permanecem no formulário.</p>
        {fieldConflicts.map(({ field, label, current, wanted }) => <fieldset key={field}>
          <legend>{label}: valor atual {current ?? "Não informado"}; seu valor {wanted ?? "Não informado"}</legend>
          <label><input type="radio" name={`resolve-${field}`} checked={fieldChoices[field] === "current"} onChange={() => setFieldChoices((choices) => ({ ...choices, [field]: "current" }))} /> Manter valor atual</label>
          <label><input type="radio" name={`resolve-${field}`} checked={fieldChoices[field] === "mine"} onChange={() => setFieldChoices((choices) => ({ ...choices, [field]: "mine" }))} /> Usar meu valor</label>
        </fieldset>)}
        <button type="button" className="button button--secondary" onClick={() => { setFieldConflicts([]); setFieldChoices({}); }}>Editar meus valores</button>
        <button type="button" className="button button--primary" disabled={!canEdit || busy || fieldConflicts.some(({ field }) => !fieldChoices[field])} onClick={() => void saveEdit(editingItem)}>Salvar decisões</button>
      </div>}
      {removedConflict && editBase && <div className="form-message form-message--error" role="alert">
        <p>{removedConflict === "composition" ? "A composição foi retirada enquanto você estava sem o controle da OS. Não será reconstruída automaticamente." : "Este item foi removido enquanto você estava sem o controle da OS."}</p>
        <button type="button" className="button button--secondary" onClick={() => { setEditing(null); setEditBase(null); setRemovedConflict(null); setFieldConflicts([]); holdCompositionDraft.current = hasAddDraft(); void reload(); }}>Manter removido</button>
        <button type="button" className="button button--primary" disabled={!canEdit} onClick={addRemovedAsNew}>Adicionar novamente como novo item</button>
      </div>}
      {compositionConflict !== null && <div className="form-message form-message--error" role="alert"><p>A composição anterior foi retirada. A inclusão pendente só pode criar um item novo após sua decisão.</p><button type="button" className="button button--secondary" onClick={() => { setCompositionConflict(null); setSelectedService(""); setDescription(""); setQuantity("1"); setUnitPrice(""); setUnitCost(""); holdCompositionDraft.current = false; void reload(); }}>Manter composição retirada</button><button type="button" className="button button--primary" disabled={!canEdit || busy} onClick={() => void submit(undefined, compositionConflict)}>Criar somente este novo item</button></div>}
      {!budget ? <p role="status">Carregando itens do orçamento…</p> : activeItems.length === 0 ? <p className="muted">Nenhum item no orçamento.</p> : (
        <div className="table-scroll"><table className="budget-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th>{canReadCosts && <th>Custo unitário</th>}{canEdit && isOpen && <th>Ações</th>}</tr></thead>
          <tbody>{activeItems.map((item) => <tr id={`budget-item-${item.publicId}`} key={item.publicId}>
            <td>{item.itemType === "MANUAL_PART" ? "Peça avulsa" : item.origin === "REGISTERED" ? "Serviço cadastrado" : "Mão de obra avulsa"}</td>
            <td>{editing === item.publicId && item.origin === "MANUAL" ? <input aria-label="Descrição do item" maxLength={255} value={editDescription} disabled={!canEdit || fieldConflicts.length > 0 || !!removedConflict} onChange={(event) => setEditDescription(event.target.value)} /> : item.description}</td>
            <td>{editing === item.publicId ? <input aria-label="Quantidade" type="number" min="1" max="999" step="1" value={editQuantity} disabled={!canEdit || fieldConflicts.length > 0 || !!removedConflict} onChange={(event) => setEditQuantity(event.target.value)} /> : item.quantity}</td>
            <td>{editing === item.publicId ? <input aria-label="Valor unitário" inputMode="decimal" value={editPrice} disabled={!canEdit || fieldConflicts.length > 0 || !!removedConflict} onChange={(event) => setEditPrice(event.target.value)} /> : `R$ ${item.unitPrice}`}</td>
            <td>R$ {item.total}</td>
            {canReadCosts && <td>{editing === item.publicId && canUpdateCosts && item.itemType === "MANUAL_PART" ? <input aria-label="Custo unitário" inputMode="decimal" value={editCost} disabled={!canEdit || fieldConflicts.length > 0 || !!removedConflict} onChange={(event) => setEditCost(event.target.value)} placeholder="Não informado" /> : item.unitCost == null ? "Não informado" : `R$ ${item.unitCost}`}</td>}
            {canEdit && isOpen && <td>{editing === item.publicId ? <><button className="text-button" type="button" disabled={busy || fieldConflicts.length > 0 || !!removedConflict} onClick={() => void saveEdit(editBase ?? item)}>Salvar</button><button className="text-button" type="button" disabled={busy} onClick={() => { setEditing(null); setEditBase(null); setFieldConflicts([]); setRemovedConflict(null); holdCompositionDraft.current = hasAddDraft(); void reload(); }}>Cancelar</button></> : <><button className="text-button" type="button" disabled={busy} onClick={() => startEdit(item)}>Editar</button><button className="text-button" type="button" disabled={busy} onClick={() => void remove(item)}>Remover</button></>}</td>}
          </tr>)}</tbody>
        </table></div>
      )}
      <p className="budget-total"><strong>Total atual: R$ {budget?.total ?? "0.00"}</strong></p>
      {(canEdit || dirty) && isOpen && <form className="budget-form" onSubmit={(event) => void submit(event)}>
        <h3>Adicionar item</h3>
        <label htmlFor="budget-item-type">Tipo</label>
        <select id="budget-item-type" value={mode} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); setMode(event.target.value as Mode); setUnitPrice(""); setDescription(""); setError(null); }}>
          <option value="service">Serviço cadastrado</option><option value="labor">Mão de obra avulsa</option><option value="part">Peça avulsa</option>
        </select>
        {mode === "service" ? <><label htmlFor="budget-service">Serviço ativo</label><select id="budget-service" value={selectedService} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); const selected = services.find((item) => item.publicId === event.target.value); setSelectedService(event.target.value); setUnitPrice(selected?.defaultPrice ?? ""); }}><option value="">Selecione</option>{services.map((service) => <option key={service.publicId} value={service.publicId}>{service.name} · R$ {service.defaultPrice}</option>)}</select><label htmlFor="budget-service-price">Valor unitário (sugestão editável)</label><input id="budget-service-price" inputMode="decimal" value={unitPrice} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); setUnitPrice(event.target.value); }} /></> : <>
          <label htmlFor="budget-description">Descrição</label><input id="budget-description" maxLength={255} value={description} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); setDescription(event.target.value); }} />
          <label htmlFor="budget-price">Valor unitário</label><input id="budget-price" inputMode="decimal" value={unitPrice} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); setUnitPrice(event.target.value); }} />
          {mode === "part" && canUpdateCosts && <><label htmlFor="budget-cost">Custo unitário (opcional)</label><input id="budget-cost" inputMode="decimal" value={unitCost} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); setUnitCost(event.target.value); }} placeholder="Não informado" /></>}
        </>}
        <label htmlFor="budget-quantity">Quantidade (1 a 999)</label><input id="budget-quantity" type="number" min="1" max="999" step="1" value={quantity} disabled={!canEdit || busy} onChange={(event) => { holdCompositionBaseline(); setQuantity(event.target.value); }} />
        {!canEdit && <p className="muted">Rascunho não salvo preservado em somente leitura.</p>}
        <button className="button button--primary" type="submit" disabled={!canEdit || busy}>{busy ? "Salvando…" : "Adicionar ao orçamento"}</button>
      </form>}
      {!isOpen && <p className="muted">Orçamento em modo somente leitura para esta OS.</p>}
    </section>
  );
}
