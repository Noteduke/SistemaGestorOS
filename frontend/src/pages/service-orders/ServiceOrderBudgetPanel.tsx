import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addManualLaborBudgetItem, addManualPartBudgetItem, addRegisteredBudgetService, addStockPartBudgetItem, applyStockPartToServiceOrder, reverseStockPartApplication, closeServiceOrder, cancelServiceOrder,
  getServiceOrderBudget, listAvailableCatalogProducts, listAvailableCatalogServices, removeBudgetItem, updateBudgetItem,
  ApiError, type AvailableCatalogProduct, type AvailableCatalogService, type ServiceOrderBudget, type ServiceOrderBudgetItem,
} from "../../api/serviceOrders";

type Props = { publicId: string; csrfToken: string; editToken: string; expectedRevision: string; canEdit: boolean; hasEditControl?: boolean; canManageStock?: boolean; canClose?: boolean; canCancel?: boolean; canReadCosts: boolean; canUpdateCosts: boolean; isOpen: boolean; onActiveCountChange?: (count: number) => void; onEditControlLost?: () => void; onRevisionChange?: (revision: string) => void; onFinalized?: (macroStatus: "FECHADA" | "CANCELADA", revision: string) => void; onDirtyChange?: (dirty: boolean) => void; onDataConflict?: () => void };
type Mode = "service" | "labor" | "part" | "stock-part";

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

export function ServiceOrderBudgetPanel({ publicId, csrfToken, editToken, expectedRevision, canEdit, hasEditControl = canEdit, canManageStock = false, canClose = false, canCancel = false, canReadCosts, canUpdateCosts, isOpen, onActiveCountChange, onEditControlLost, onRevisionChange, onFinalized, onDirtyChange, onDataConflict }: Props) {
  const [budget, setBudget] = useState<ServiceOrderBudget | null>(null);
  const [conflictBudget, setConflictBudget] = useState<ServiceOrderBudget | null>(null);
  const [conflictBudgetLoading, setConflictBudgetLoading] = useState(false);
  const [conflictBudgetError, setConflictBudgetError] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [services, setServices] = useState<AvailableCatalogService[]>([]);
  const [products, setProducts] = useState<AvailableCatalogProduct[]>([]);
  const [mode, setMode] = useState<Mode>("service");
  const [selectedService, setSelectedService] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCost, setEditCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyQuantities, setApplyQuantities] = useState<Record<string, string>>({});
  const [reverseQuantities, setReverseQuantities] = useState<Record<string, string>>({});
  const [defectiveQuantities, setDefectiveQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [closureMode, setClosureMode] = useState<"WITHOUT_REPAIR" | "CANCEL" | null>(null);
  const [physicalRemovalConfirmed, setPhysicalRemovalConfirmed] = useState(false);
  const [closureDefects, setClosureDefects] = useState<Record<string, string>>({});
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [closureDiscrepancies, setClosureDiscrepancies] = useState<Array<{ itemPublicId: string; description: string; budgetedQuantity: number; appliedQuantity: number }>>([]);

  async function reload(signal?: AbortSignal) {
    const current = await getServiceOrderBudget(publicId, signal);
    if (!signal?.aborted) { setBudget(current); onActiveCountChange?.(current.data.length); }
  }

  async function loadConflictBudget() {
    setConflictBudgetLoading(true);
    setConflictBudgetError(null);
    try { setConflictBudget(await getServiceOrderBudget(publicId)); }
    catch { setConflictBudgetError("Não foi possível consultar a composição atual do orçamento."); }
    finally { setConflictBudgetLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [publicId]);

  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    listAvailableCatalogServices(controller.signal).then((result) => { if (!controller.signal.aborted) setServices(result.data); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [canEdit, publicId]);

  useEffect(() => {
    if (!canEdit || mode !== "stock-part") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      listAvailableCatalogProducts(productSearch, 1, 20, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setProducts(result.data); })
        .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canEdit, mode, productSearch, publicId]);

  const activeItems = budget?.data ?? [];
  const appliedStockItems = activeItems.filter((item) => item.itemType === "STOCK_PART" && (item.appliedQuantity ?? 0) > 0);
  const canEditCurrent = canEdit && !revisionConflict;
  const canOperateClosure = hasEditControl && !revisionConflict;
  const editingItem = activeItems.find((item) => item.publicId === editing);
  const dirty = mode !== "service" || Boolean(selectedService) || Boolean(selectedProduct) || Boolean(description.trim()) || Boolean(unitPrice.trim()) || Boolean(unitCost.trim()) || quantity !== "1"
    || Boolean(editingItem && (editQuantity !== String(editingItem.quantity) || editPrice !== editingItem.unitPrice
      || editDescription !== (editingItem.origin === "MANUAL" ? editingItem.description : "")
      || editCost !== (editingItem.unitCost ?? "")));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  function reportFailure(reason: unknown) {
    if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") onEditControlLost?.();
    if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_DATA_CONFLICT") {
      setRevisionConflict(true);
      onDataConflict?.();
      void loadConflictBudget();
    }
    setError(errorText(reason));
  }

  async function finishRepairedClosure() {
    if (!canOperateClosure || !isOpen || !canClose || closureBusy || dirty) return;
    if (!window.confirm("Encerrar esta OS com reparo? As quantidades de cada peça aplicada precisam corresponder ao orçamento. As peças serão baixadas do estoque.")) return;
    setClosureBusy(true); setClosureError(null); setClosureDiscrepancies([]);
    try {
      const result = await closeServiceOrder(publicId, { outcome: "REPAIRED" }, csrfToken, editToken, expectedRevision);
      onRevisionChange?.(result.serviceOrderRevision);
      onFinalized?.(result.data.macroStatus, result.serviceOrderRevision);
      setMessage("OS encerrada com reparo; peças aplicadas baixadas do estoque.");
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") onEditControlLost?.();
      if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_DATA_CONFLICT") onDataConflict?.();
      const items = reason instanceof ApiError && Array.isArray(reason.details?.items) ? reason.details.items : [];
      setClosureDiscrepancies(items.flatMap((value) => isRecord(value) && typeof value.itemPublicId === "string" && typeof value.description === "string" && typeof value.budgetedQuantity === "number" && typeof value.appliedQuantity === "number"
        ? [{ itemPublicId: value.itemPublicId, description: value.description, budgetedQuantity: value.budgetedQuantity, appliedQuantity: value.appliedQuantity }] : []));
      setClosureError(errorText(reason));
    } finally { setClosureBusy(false); }
  }

  async function submitClosure() {
    if (!canOperateClosure || !isOpen || closureBusy || !closureMode) return;
    if (appliedStockItems.length && !physicalRemovalConfirmed) { setClosureError("Confirme que as peças aplicadas foram retiradas do equipamento."); return; }
    const defectiveItems = appliedStockItems.flatMap((item) => {
      const quantity = closureDefects[item.publicId] ?? "0";
      if (!/^\d+$/u.test(quantity) || Number(quantity) > (item.appliedQuantity ?? 0)) return [{ itemPublicId: item.publicId, quantity: Number.NaN }];
      return Number(quantity) > 0 ? [{ itemPublicId: item.publicId, quantity: Number(quantity) }] : [];
    });
    if (defectiveItems.some(({ quantity }) => !Number.isSafeInteger(quantity))) { setClosureError("Informe quantidades defeituosas inteiras entre zero e o total aplicado."); return; }
    setClosureBusy(true); setClosureError(null);
    try {
      const body = { confirmPhysicalRemoval: physicalRemovalConfirmed, defectiveItems };
      const result = closureMode === "CANCEL"
        ? await cancelServiceOrder(publicId, body, csrfToken, editToken, expectedRevision)
        : await closeServiceOrder(publicId, { outcome: "WITHOUT_REPAIR", ...body }, csrfToken, editToken, expectedRevision);
      onRevisionChange?.(result.serviceOrderRevision);
      onFinalized?.(result.data.macroStatus, result.serviceOrderRevision);
      setMessage(closureMode === "CANCEL" ? "OS cancelada e aplicações tratadas no estoque." : "OS encerrada sem reparo e aplicações tratadas no estoque.");
      setClosureMode(null);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") onEditControlLost?.();
      if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_DATA_CONFLICT") onDataConflict?.();
      setClosureError(errorText(reason));
    } finally { setClosureBusy(false); }
  }

  function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditCurrent || !isOpen || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (mode === "service") {
        const service = services.find((entry) => entry.publicId === selectedService);
        if (!service) throw new Error("Selecione um serviço ativo.");
        const result = await addRegisteredBudgetService(publicId, { servicePublicId: service.publicId, quantity: Number(quantity), ...(unitPrice.trim() ? { unitPrice } : {}) }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      } else if (mode === "labor") {
        const result = await addManualLaborBudgetItem(publicId, { description, quantity: Number(quantity), unitPrice }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      } else if (mode === "part") {
        const result = await addManualPartBudgetItem(publicId, { description, quantity: Number(quantity), unitPrice, ...(canUpdateCosts ? { unitCost: unitCost.trim() || null } : {}) }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      } else {
        if (!selectedProduct) throw new Error("Selecione um produto ativo.");
        const result = await addStockPartBudgetItem(publicId, { productPublicId: selectedProduct, quantity: Number(quantity), ...(unitPrice.trim() ? { unitPrice } : {}) }, csrfToken, editToken, expectedRevision);
        onRevisionChange?.(result.serviceOrderRevision);
      }
      setDescription(""); setSelectedProduct(""); setQuantity("1"); setUnitPrice(""); setUnitCost(""); setMessage("Item adicionado ao orçamento.");
      await reload();
    } catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  function startEdit(item: ServiceOrderBudgetItem) {
    setEditing(item.publicId); setEditQuantity(String(item.quantity)); setEditPrice(item.unitPrice);
    setEditDescription(item.origin === "MANUAL" ? item.description : ""); setEditCost(item.unitCost ?? "");
    setError(null); setMessage(null);
  }

  async function saveEdit(item: ServiceOrderBudgetItem) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const body: Record<string, unknown> = { expectedVersion: item.version, quantity: Number(editQuantity), unitPrice: editPrice };
      if (item.origin === "MANUAL") body.description = editDescription;
      if (canUpdateCosts && item.itemType === "MANUAL_PART") body.unitCost = editCost.trim() || null;
      const result = await updateBudgetItem(publicId, item.publicId, body, csrfToken, editToken, expectedRevision);
      onRevisionChange?.(result.serviceOrderRevision);
      setEditing(null); setMessage("Item atualizado."); await reload();
    } catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  async function applyStock(item: ServiceOrderBudgetItem) {
    const amount = Number(applyQuantities[item.publicId] ?? "1");
    if (!Number.isSafeInteger(amount) || amount < 1) { setError("Informe uma quantidade inteira positiva para aplicar."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await applyStockPartToServiceOrder(publicId, item.publicId, { quantity: amount }, csrfToken, editToken, expectedRevision);
      onRevisionChange?.(result.serviceOrderRevision); setMessage(`${amount} unidade(s) marcada(s) como aplicada(s).`); await reload();
    } catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  async function reverseStock(item: ServiceOrderBudgetItem) {
    const amount = Number(reverseQuantities[item.publicId] ?? "1");
    const defective = Number(defectiveQuantities[item.publicId] ?? "0");
    if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(defective) || defective < 0 || defective > amount) {
      setError("Informe quantidades inteiras válidas; a quantidade defeituosa deve estar entre zero e a quantidade revertida."); return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await reverseStockPartApplication(publicId, item.publicId, { quantity: amount, defectiveQuantity: defective }, csrfToken, editToken, expectedRevision);
      onRevisionChange?.(result.serviceOrderRevision); setMessage(`${amount} unidade(s) retirada(s) da aplicação; ${defective} classificada(s) como defeituosa(s).`); await reload();
    } catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  async function remove(item: ServiceOrderBudgetItem) {
    const applied = item.appliedQuantity ?? 0;
    let removalBody: { confirmed: true; defectiveQuantity: number } | undefined;
    if (applied > 0) {
      if (!window.confirm(`Este item tem ${applied} unidade(s) aplicada(s). A remoção desfará essas aplicações e preservará o histórico. Continuar?`)) return;
      const response = window.prompt(`Quantas das ${applied} unidade(s) devem ser classificadas como defeituosas? Informe 0 se nenhuma.`, "0");
      if (response === null) return;
      if (!/^\d+$/u.test(response) || Number(response) > applied) { setError("Informe uma quantidade defeituosa inteira entre zero e a quantidade aplicada."); return; }
      removalBody = { confirmed: true, defectiveQuantity: Number(response) };
    } else if (!window.confirm("Deseja remover este item do orçamento?")) return;
    setBusy(true); setError(null); setMessage(null);
    try { const result = await removeBudgetItem(publicId, item.publicId, csrfToken, editToken, expectedRevision, removalBody); onRevisionChange?.(result.serviceOrderRevision); setMessage(applied > 0 ? "Item removido do orçamento; as aplicações foram revertidas na mesma operação." : "Item removido do orçamento."); await reload(); }
    catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  return (
    <section className="info-card budget-panel" aria-labelledby="budget-title">
      <div className="section-heading"><div><h2 id="budget-title">Orçamento</h2><p>Serviços e peças vinculados à OS. O total é calculado pelo servidor.</p></div></div>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {message && <p className="form-message form-message--success" role="status">{message}</p>}
      {conflictBudgetError && <p className="form-message form-message--error" role="alert">{conflictBudgetError}</p>}
      {!conflictBudget && conflictBudgetError && <button className="button button--secondary" type="button" disabled={conflictBudgetLoading} onClick={() => void loadConflictBudget()}>{conflictBudgetLoading ? "Consultando…" : "Consultar orçamento atual"}</button>}
      {conflictBudgetLoading && <p role="status">Consultando composição atual do servidor…</p>}
      {conflictBudget && <section className="info-card" aria-label="Composição atual do orçamento">
        <h3>Orçamento atual no servidor</h3>
        <p>Dados consultados após o conflito. Compare com o rascunho local abaixo e reaplique manualmente o que deseja manter.</p>
        {conflictBudget.data.length ? <ul>{conflictBudget.data.map((item) => <li key={item.publicId}>
          {item.description} · quantidade {item.quantity} · unitário R$ {item.unitPrice} · total R$ {item.total}
          {canReadCosts && item.unitCost != null ? ` · custo unitário R$ ${item.unitCost}` : ""}
        </li>)}</ul> : <p className="muted">O orçamento atual não possui itens.</p>}
        <p><strong>Total atual: R$ {conflictBudget.total}</strong></p>
      </section>}
      {conflictBudget && <p className="form-message form-message--error" role="status"><strong>Rascunho local não salvo:</strong> os campos preservados abaixo não foram enviados.</p>}
      {conflictBudget && <div aria-label="Composição carregada antes do conflito">
        <h3>Composição lida antes do conflito</h3>
        <p>Esta é a composição que estava na tela antes da alteração concorrente; os campos locais permanecem separados dos dados atuais acima.</p>
      </div>}
      {!budget ? <p role="status">Carregando itens do orçamento…</p> : activeItems.length === 0 ? <p className="muted">Nenhum item no orçamento.</p> : (
        <div className="table-scroll"><table className="budget-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th>{canReadCosts && activeItems.some((item) => item.itemType === "MANUAL_PART") && <th>Custo unitário</th>}{canEditCurrent && isOpen && <th>Ações</th>}</tr></thead>
          <tbody>{activeItems.map((item) => <tr id={`budget-item-${item.publicId}`} key={item.publicId}>
            <td>{item.itemType === "MANUAL_PART" ? "Peça avulsa" : item.itemType === "STOCK_PART" ? "Peça do estoque" : item.origin === "REGISTERED" ? "Serviço cadastrado" : "Mão de obra avulsa"}</td>
            <td>{editing === item.publicId && item.origin === "MANUAL" ? <input aria-label="Descrição do item" maxLength={255} value={editDescription} disabled={!canEditCurrent} onChange={(event) => setEditDescription(event.target.value)} /> : item.description}</td>
            <td>{editing === item.publicId ? <input aria-label="Quantidade" type="number" min="1" max="999" step="1" value={editQuantity} disabled={!canEditCurrent} onChange={(event) => setEditQuantity(event.target.value)} /> : item.quantity}</td>
            <td>{editing === item.publicId ? <input aria-label="Valor unitário" inputMode="decimal" value={editPrice} disabled={!canEditCurrent} onChange={(event) => setEditPrice(event.target.value)} /> : `R$ ${item.unitPrice}`}</td>
            <td>R$ {item.total}</td>
            {canReadCosts && activeItems.some((entry) => entry.itemType === "MANUAL_PART") && <td>{item.itemType !== "MANUAL_PART" ? "—" : editing === item.publicId && canUpdateCosts ? <input aria-label="Custo unitário" inputMode="decimal" value={editCost} disabled={!canEditCurrent} onChange={(event) => setEditCost(event.target.value)} placeholder="Não informado" /> : item.unitCost == null ? "Não informado" : `R$ ${item.unitCost}`}</td>}
            {canEditCurrent && isOpen && <td>{editing === item.publicId ? <><button className="text-button" type="button" disabled={busy} onClick={() => void saveEdit(item)}>Salvar</button><button className="text-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></> : <><button className="text-button" type="button" disabled={busy} onClick={() => startEdit(item)}>Editar</button>{item.itemType === "STOCK_PART" && canManageStock && <div className="stock-application-controls">
              <p>Aplicada: {item.appliedQuantity ?? 0}</p>
              <label>Quantidade para aplicar <input aria-label={`Quantidade para aplicar ${item.description}`} type="number" min="1" step="1" value={applyQuantities[item.publicId] ?? "1"} disabled={busy} onChange={(event) => setApplyQuantities((current) => ({ ...current, [item.publicId]: event.target.value }))} /></label>
              <button className="text-button" type="button" disabled={busy} onClick={() => void applyStock(item)}>Marcar como aplicada</button>
              {(item.appliedQuantity ?? 0) > 0 && <><label>Quantidade para desfazer <input aria-label={`Quantidade para desfazer ${item.description}`} type="number" min="1" max={item.appliedQuantity} step="1" value={reverseQuantities[item.publicId] ?? "1"} disabled={busy} onChange={(event) => setReverseQuantities((current) => ({ ...current, [item.publicId]: event.target.value }))} /></label>
                <label>Unidades defeituosas <input aria-label={`Unidades defeituosas ${item.description}`} type="number" min="0" max={reverseQuantities[item.publicId] ?? "1"} step="1" value={defectiveQuantities[item.publicId] ?? "0"} disabled={busy} onChange={(event) => setDefectiveQuantities((current) => ({ ...current, [item.publicId]: event.target.value }))} /></label>
                <button className="text-button" type="button" disabled={busy} onClick={() => void reverseStock(item)}>Desfazer aplicação</button></>}
            </div>}<button className="text-button" type="button" disabled={busy} onClick={() => void remove(item)}>Remover</button></>}</td>}
          </tr>)}</tbody>
        </table></div>
      )}
      <p className="budget-total"><strong>{conflictBudget ? "Total da composição lida antes do conflito" : "Total atual"}: R$ {budget?.total ?? "0.00"}</strong></p>
      {isOpen && (canClose || canCancel) && <section className="service-order-closure" aria-labelledby="service-order-closure-title">
        <h3 id="service-order-closure-title">Encerramento e cancelamento</h3>
        {closureError && <p className="form-message form-message--error" role="alert">{closureError}</p>}
        {closureDiscrepancies.length > 0 && <section aria-label="Divergências entre orçamento e aplicações">
          <p>O Backend recusou o encerramento. Corrija manualmente os itens e tente novamente; nenhuma quantidade foi ajustada automaticamente.</p>
          <ul>{closureDiscrepancies.map((item) => <li key={item.itemPublicId}>{item.description}: orçada {item.budgetedQuantity}, aplicada {item.appliedQuantity}.</li>)}</ul>
        </section>}
        {canOperateClosure && <div className="service-order-closure__actions">
          {canClose && <button className="button button--primary" type="button" disabled={closureBusy || dirty} onClick={() => void finishRepairedClosure()}>{closureBusy ? "Processando…" : "Encerrar com reparo"}</button>}
          {canClose && <button className="button button--secondary" type="button" disabled={closureBusy || dirty} onClick={() => { setClosureMode("WITHOUT_REPAIR"); setClosureError(null); setClosureDiscrepancies([]); setPhysicalRemovalConfirmed(false); setClosureDefects({}); }}>Encerrar sem reparo</button>}
          {canCancel && <button className="button button--secondary" type="button" disabled={closureBusy || dirty} onClick={() => { setClosureMode("CANCEL"); setClosureError(null); setClosureDiscrepancies([]); setPhysicalRemovalConfirmed(false); setClosureDefects({}); }}>Cancelar OS</button>}
        </div>}
        {closureMode && <form className="service-order-closure__form" onSubmit={(event) => { event.preventDefault(); void submitClosure(); }}>
          <h4>{closureMode === "CANCEL" ? "Confirmar cancelamento" : "Confirmar encerramento sem reparo"}</h4>
          {appliedStockItems.length > 0 ? <>
            <p>Esta OS possui peças aplicadas. Confirme que foram retiradas do equipamento e podem retornar ao estoque. Informe, por item, quantas unidades estão defeituosas.</p>
            <label><input type="checkbox" checked={physicalRemovalConfirmed} onChange={(event) => setPhysicalRemovalConfirmed(event.target.checked)} /> Confirmo a retirada física das peças aplicadas.</label>
            <ul>{appliedStockItems.map((item) => <li key={item.publicId}>
              {item.description} — aplicadas: {item.appliedQuantity}
              <label>Unidades defeituosas <input aria-label={`Unidades defeituosas ${item.description}`} type="number" min="0" max={item.appliedQuantity} step="1" value={closureDefects[item.publicId] ?? "0"} onChange={(event) => setClosureDefects((current) => ({ ...current, [item.publicId]: event.target.value }))} /></label>
            </li>)}</ul>
          </> : <p>Não há aplicações ativas de peças do estoque.</p>}
          <button className="button button--primary" type="submit" disabled={closureBusy || (appliedStockItems.length > 0 && !physicalRemovalConfirmed)}>{closureBusy ? "Processando…" : "Confirmar operação"}</button>
          <button className="button button--secondary" type="button" disabled={closureBusy} onClick={() => setClosureMode(null)}>Voltar</button>
        </form>}
      </section>}
      {(canEditCurrent || dirty) && isOpen && <form className="budget-form" aria-label={conflictBudget || revisionConflict ? "Rascunho local do orçamento não salvo" : "Editar orçamento"} onSubmit={(event) => void submit(event)}>
        <h3>Adicionar item</h3>
        <label htmlFor="budget-item-type">Tipo</label>
        <select id="budget-item-type" value={mode} disabled={!canEditCurrent || busy} onChange={(event) => { setMode(event.target.value as Mode); setUnitPrice(""); setDescription(""); setSelectedProduct(""); setProductSearch(""); setError(null); }}>
          <option value="service">Serviço cadastrado</option><option value="labor">Mão de obra avulsa</option><option value="part">Peça avulsa</option><option value="stock-part">Peça do estoque</option>
        </select>
        {mode === "service" ? <><label htmlFor="budget-service">Serviço ativo</label><select id="budget-service" value={selectedService} disabled={!canEditCurrent || busy} onChange={(event) => { const selected = services.find((item) => item.publicId === event.target.value); setSelectedService(event.target.value); setUnitPrice(selected?.defaultPrice ?? ""); }}><option value="">Selecione</option>{services.map((service) => <option key={service.publicId} value={service.publicId}>{service.name} · R$ {service.defaultPrice}</option>)}</select><label htmlFor="budget-service-price">Valor unitário (sugestão editável)</label><input id="budget-service-price" inputMode="decimal" value={unitPrice} disabled={!canEditCurrent || busy} onChange={(event) => setUnitPrice(event.target.value)} /></> : <>
          {mode === "stock-part" ? <>
            <label htmlFor="budget-product-search">Pesquisar produtos ativos</label><input id="budget-product-search" value={productSearch} disabled={!canEditCurrent || busy} onChange={(event) => setProductSearch(event.target.value)} placeholder="Código ou descrição" />
            <label htmlFor="budget-product">Produto</label><select id="budget-product" value={selectedProduct} disabled={!canEditCurrent || busy} onChange={(event) => { const selected = products.find((item) => item.publicId === event.target.value); setSelectedProduct(event.target.value); setUnitPrice(selected?.defaultPrice ?? ""); }}><option value="">Selecione um produto ativo</option>{products.map((product) => <option key={product.publicId} value={product.publicId}>{product.internalCode ? `${product.internalCode} · ` : ""}{product.description}</option>)}</select>
            {selectedProduct && products.find((product) => product.publicId === selectedProduct)?.defaultPrice === null && <p className="muted">Este produto não tem preço padrão. Informe o valor unitário para continuar.</p>}
            <label htmlFor="budget-price">Valor unitário</label><input id="budget-price" inputMode="decimal" value={unitPrice} disabled={!canEditCurrent || busy} onChange={(event) => setUnitPrice(event.target.value)} required />
          </> : <>
            <label htmlFor="budget-description">Descrição</label><input id="budget-description" maxLength={255} value={description} disabled={!canEditCurrent || busy} onChange={(event) => setDescription(event.target.value)} />
            <label htmlFor="budget-price">Valor unitário</label><input id="budget-price" inputMode="decimal" value={unitPrice} disabled={!canEditCurrent || busy} onChange={(event) => setUnitPrice(event.target.value)} />
            {mode === "part" && canUpdateCosts && <><label htmlFor="budget-cost">Custo unitário (opcional)</label><input id="budget-cost" inputMode="decimal" value={unitCost} disabled={!canEditCurrent || busy} onChange={(event) => setUnitCost(event.target.value)} placeholder="Não informado" /></>}
          </>}
        </>}
        <label htmlFor="budget-quantity">Quantidade (1 a 999)</label><input id="budget-quantity" type="number" min="1" max="999" step="1" value={quantity} disabled={!canEditCurrent || busy} onChange={(event) => setQuantity(event.target.value)} />
        {!canEditCurrent && <p className="muted">Rascunho não salvo preservado em somente leitura.</p>}
        <button className="button button--primary" type="submit" disabled={!canEditCurrent || busy}>{busy ? "Salvando…" : "Adicionar ao orçamento"}</button>
      </form>}
      {!isOpen && <p className="muted">Orçamento em modo somente leitura para esta OS.</p>}
    </section>
  );
}
