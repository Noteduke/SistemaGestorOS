import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addManualLaborBudgetItem, addManualPartBudgetItem, addRegisteredBudgetService,
  getServiceOrderBudget, listAvailableCatalogServices, removeBudgetItem, updateBudgetItem,
  ApiError, type AvailableCatalogService, type ServiceOrderBudget, type ServiceOrderBudgetItem,
} from "../../api/serviceOrders";

type Props = { publicId: string; csrfToken: string; editToken: string; canEdit: boolean; canReadCosts: boolean; canUpdateCosts: boolean; isOpen: boolean; onActiveCountChange?: (count: number) => void; onEditControlLost?: () => void };
type Mode = "service" | "labor" | "part";

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

export function ServiceOrderBudgetPanel({ publicId, csrfToken, editToken, canEdit, canReadCosts, canUpdateCosts, isOpen, onActiveCountChange, onEditControlLost }: Props) {
  const [budget, setBudget] = useState<ServiceOrderBudget | null>(null);
  const [services, setServices] = useState<AvailableCatalogService[]>([]);
  const [mode, setMode] = useState<Mode>("service");
  const [selectedService, setSelectedService] = useState("");
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload(signal?: AbortSignal) {
    const current = await getServiceOrderBudget(publicId, signal);
    if (!signal?.aborted) { setBudget(current); onActiveCountChange?.(current.data.length); }
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

  useEffect(() => { if (!canEdit || !isOpen) setEditing(null); }, [canEdit, isOpen]);

  function reportFailure(reason: unknown) {
    if (reason instanceof ApiError && reason.code === "SERVICE_ORDER_EDIT_CONTROL_LOST") onEditControlLost?.();
    setError(errorText(reason));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !isOpen || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (mode === "service") {
        const service = services.find((entry) => entry.publicId === selectedService);
        if (!service) throw new Error("Selecione um serviço ativo.");
        await addRegisteredBudgetService(publicId, { servicePublicId: service.publicId, quantity: Number(quantity), ...(unitPrice.trim() ? { unitPrice } : {}) }, csrfToken, editToken);
      } else if (mode === "labor") {
        await addManualLaborBudgetItem(publicId, { description, quantity: Number(quantity), unitPrice }, csrfToken, editToken);
      } else {
        await addManualPartBudgetItem(publicId, { description, quantity: Number(quantity), unitPrice, ...(canUpdateCosts ? { unitCost: unitCost.trim() || null } : {}) }, csrfToken, editToken);
      }
      setDescription(""); setQuantity("1"); setUnitPrice(""); setUnitCost(""); setMessage("Item adicionado ao orçamento.");
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
      await updateBudgetItem(publicId, item.publicId, body, csrfToken, editToken);
      setEditing(null); setMessage("Item atualizado."); await reload();
    } catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  async function remove(item: ServiceOrderBudgetItem) {
    if (!window.confirm("Deseja remover este item do orçamento?")) return;
    setBusy(true); setError(null); setMessage(null);
    try { await removeBudgetItem(publicId, item.publicId, csrfToken, editToken); setMessage("Item removido do orçamento."); await reload(); }
    catch (reason) { reportFailure(reason); }
    finally { setBusy(false); }
  }

  const activeItems = budget?.data ?? [];
  return (
    <section className="info-card budget-panel" aria-labelledby="budget-title">
      <div className="section-heading"><div><h2 id="budget-title">Orçamento</h2><p>Serviços e peças vinculados à OS. O total é calculado pelo servidor.</p></div></div>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {message && <p className="form-message form-message--success" role="status">{message}</p>}
      {!budget ? <p role="status">Carregando itens do orçamento…</p> : activeItems.length === 0 ? <p className="muted">Nenhum item no orçamento.</p> : (
        <div className="table-scroll"><table className="budget-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th>{canReadCosts && <th>Custo unitário</th>}{canEdit && isOpen && <th>Ações</th>}</tr></thead>
          <tbody>{activeItems.map((item) => <tr id={`budget-item-${item.publicId}`} key={item.publicId}>
            <td>{item.itemType === "MANUAL_PART" ? "Peça avulsa" : item.origin === "REGISTERED" ? "Serviço cadastrado" : "Mão de obra avulsa"}</td>
            <td>{editing === item.publicId && item.origin === "MANUAL" ? <input aria-label="Descrição do item" maxLength={255} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /> : item.description}</td>
            <td>{editing === item.publicId ? <input aria-label="Quantidade" type="number" min="1" max="999" step="1" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} /> : item.quantity}</td>
            <td>{editing === item.publicId ? <input aria-label="Valor unitário" inputMode="decimal" value={editPrice} onChange={(event) => setEditPrice(event.target.value)} /> : `R$ ${item.unitPrice}`}</td>
            <td>R$ {item.total}</td>
            {canReadCosts && <td>{editing === item.publicId && canUpdateCosts && item.itemType === "MANUAL_PART" ? <input aria-label="Custo unitário" inputMode="decimal" value={editCost} onChange={(event) => setEditCost(event.target.value)} placeholder="Não informado" /> : item.unitCost == null ? "Não informado" : `R$ ${item.unitCost}`}</td>}
            {canEdit && isOpen && <td>{editing === item.publicId ? <><button className="text-button" type="button" disabled={busy} onClick={() => void saveEdit(item)}>Salvar</button><button className="text-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></> : <><button className="text-button" type="button" disabled={busy} onClick={() => startEdit(item)}>Editar</button><button className="text-button" type="button" disabled={busy} onClick={() => void remove(item)}>Remover</button></>}</td>}
          </tr>)}</tbody>
        </table></div>
      )}
      <p className="budget-total"><strong>Total atual: R$ {budget?.total ?? "0.00"}</strong></p>
      {canEdit && isOpen && <form className="budget-form" onSubmit={(event) => void submit(event)}>
        <h3>Adicionar item</h3>
        <label htmlFor="budget-item-type">Tipo</label>
        <select id="budget-item-type" value={mode} onChange={(event) => { setMode(event.target.value as Mode); setUnitPrice(""); setDescription(""); setError(null); }}>
          <option value="service">Serviço cadastrado</option><option value="labor">Mão de obra avulsa</option><option value="part">Peça avulsa</option>
        </select>
        {mode === "service" ? <><label htmlFor="budget-service">Serviço ativo</label><select id="budget-service" value={selectedService} onChange={(event) => { const selected = services.find((item) => item.publicId === event.target.value); setSelectedService(event.target.value); setUnitPrice(selected?.defaultPrice ?? ""); }}><option value="">Selecione</option>{services.map((service) => <option key={service.publicId} value={service.publicId}>{service.name} · R$ {service.defaultPrice}</option>)}</select><label htmlFor="budget-service-price">Valor unitário (sugestão editável)</label><input id="budget-service-price" inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></> : <>
          <label htmlFor="budget-description">Descrição</label><input id="budget-description" maxLength={255} value={description} onChange={(event) => setDescription(event.target.value)} />
          <label htmlFor="budget-price">Valor unitário</label><input id="budget-price" inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
          {mode === "part" && canUpdateCosts && <><label htmlFor="budget-cost">Custo unitário (opcional)</label><input id="budget-cost" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="Não informado" /></>}
        </>}
        <label htmlFor="budget-quantity">Quantidade (1 a 999)</label><input id="budget-quantity" type="number" min="1" max="999" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Adicionar ao orçamento"}</button>
      </form>}
      {!isOpen && <p className="muted">Orçamento em modo somente leitura para esta OS.</p>}
    </section>
  );
}
