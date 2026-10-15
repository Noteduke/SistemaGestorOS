import { useEffect, useState, type FormEvent } from "react";
import {
  changeProductActivity, createProduct, createProductStockMovement, getProductStockSummary, listProductStockMovements,
  listProducts, ProductApiError, updateProduct,
  type CatalogProduct, type ProductCategory, type ProductPage, type ProductStatus, type ProductStockAction,
  type ProductStockBalance, type ProductStockMovementPage,
} from "../../api/products";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";

interface Props { csrfToken: string; canManageProducts?: boolean; canManageStock?: boolean; canReadCosts?: boolean; canUpdateCosts?: boolean }
type CategoryFilter = ProductCategory | "all";
type StockAction = ProductStockAction;

const categoryLabels: Record<ProductCategory, string> = { PART: "Peça", RESALE_GOOD: "Mercadoria para revenda" };
const stockActionLabels: Record<StockAction, string> = {
  entry: "Entrada manual",
  adjustment: "Ajuste de quantidade",
  "defective/classifications": "Classificar como defeituosa",
  "defective/returns": "Retornar à disponibilidade",
  "defective/disposals": "Descarte definitivo",
};
const movementLabels = {
  MANUAL_ENTRY: "Entrada manual",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  DEFECTIVE_CLASSIFIED: "Classificada como defeituosa",
  DEFECTIVE_RETURNED: "Devolvida à disponibilidade",
  DEFECTIVE_DISCARDED: "Descarte definitivo",
  SERVICE_ORDER_APPLIED: "Aplicada em Ordem de Serviço",
  SERVICE_ORDER_REVERSED: "Aplicação revertida da Ordem de Serviço",
  SERVICE_ORDER_CONSUMED: "Baixada no encerramento da Ordem de Serviço",
} as const;

function actionMessage(error: unknown): string {
  if (error instanceof ProductApiError) {
    if (error.code === "DUPLICATE_PRODUCT_CODE") return "Já existe um produto cadastrado com esse código interno.";
    if (error.code === "PRODUCT_VERSION_CONFLICT" || error.code === "PRODUCT_CONCURRENCY_CONFLICT") {
      return "O produto mudou enquanto você trabalhava. A lista foi atualizada; confira os dados e tente novamente.";
    }
    if (error.code === "INSUFFICIENT_AVAILABLE_STOCK" || error.code === "INSUFFICIENT_DEFECTIVE_STOCK" || error.code === "CLASSIFIED_STOCK_PROTECTED") return error.message;
    if (error.code === "STOCK_CONCURRENCY_CONFLICT") return "O saldo mudou durante a operação. Consulte o saldo atual e tente novamente.";
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

function inputMoney(value: string | null | undefined): string { return value?.replace(".", ",") ?? ""; }
function displayMoney(value: string | null | undefined): string { return value === null || value === undefined ? "Não informado" : `R$ ${value.replace(".", ",")}`; }

export function ProductCatalogPage({ csrfToken, canManageProducts = true, canManageStock = false, canReadCosts = false, canUpdateCosts = false }: Props) {
  const [status, setStatus] = useState<ProductStatus>("active");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [formCategory, setFormCategory] = useState<ProductCategory>("PART");
  const [salePrice, setSalePrice] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [clearAcquisitionCost, setClearAcquisitionCost] = useState(false);
  const [editTarget, setEditTarget] = useState<CatalogProduct | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [stockTarget, setStockTarget] = useState<CatalogProduct | null>(null);
  const [stockBalance, setStockBalance] = useState<ProductStockBalance | null>(null);
  const [movements, setMovements] = useState<ProductStockMovementPage | null>(null);
  const [stockPage, setStockPage] = useState(1);
  const [stockReload, setStockReload] = useState(0);
  const [stockAction, setStockAction] = useState<StockAction>("entry");
  const [stockQuantity, setStockQuantity] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"INCREASE" | "DECREASE">("INCREASE");
  const [confirmedDisposal, setConfirmedDisposal] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    listProducts(page, status, search, category, controller.signal)
      .then(setResult)
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(actionMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, status, search, category, reload]);

  useEffect(() => {
    if (!stockTarget) return;
    const controller = new AbortController();
    setMovements(null);
    Promise.all([
      getProductStockSummary(stockTarget.publicId, controller.signal),
      listProductStockMovements(stockTarget.publicId, stockPage, controller.signal),
    ]).then(([summary, history]) => {
      setStockBalance(summary.data.stock);
      setMovements(history);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setActionError(actionMessage(error));
    });
    return () => controller.abort();
  }, [stockTarget, stockPage, stockReload]);

  async function run(action: () => Promise<unknown>, message: string, after?: () => void) {
    setPending(true);
    setActionError("");
    setSuccess("");
    try {
      await action();
      after?.();
      setSuccess(message);
      setReload((value) => value + 1);
    } catch (error) {
      setActionError(actionMessage(error));
      if (error instanceof ProductApiError && error.status === 409) setReload((value) => value + 1);
    } finally {
      setPending(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => createProduct({ internalCode: code, description, category: formCategory, salePrice, ...(canUpdateCosts ? { acquisitionCost } : {}) }, csrfToken), "Produto cadastrado.", () => {
      setCode(""); setDescription(""); setFormCategory("PART"); setSalePrice(""); setAcquisitionCost(""); setPage(1);
    });
  }

  function beginEdit(product: CatalogProduct) {
    setEditTarget(product);
    setCode(product.internalCode ?? "");
    setDescription(product.description);
    setFormCategory(product.category);
    setSalePrice(inputMoney(product.salePrice));
    setAcquisitionCost(canReadCosts && canUpdateCosts ? inputMoney(product.acquisitionCost) : "");
    setClearAcquisitionCost(false);
    setActionError(""); setSuccess("");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const costChange = canUpdateCosts
      ? canReadCosts
        ? { acquisitionCost }
        : clearAcquisitionCost
          ? { acquisitionCost: "" }
          : acquisitionCost.trim()
            ? { acquisitionCost }
            : {}
      : {};
    void run(() => updateProduct(editTarget, { internalCode: code, description, category: formCategory, salePrice, ...costChange }, csrfToken), "Produto atualizado.", () => setEditTarget(null));
  }

  function submitStockAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockTarget) return;
    const quantity = Number(stockQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2_147_483_647) {
      setActionError("Informe uma quantidade inteira positiva dentro do intervalo permitido.");
      return;
    }
    if (stockAction === "defective/disposals" && !window.confirm(`Confirma o descarte definitivo de ${quantity} unidade(s) de ${stockTarget.description}? Essa movimentação não pode ser desfeita diretamente.`)) return;
    const movementQuantity = stockAction === "adjustment" && adjustmentDirection === "DECREASE" ? -quantity : quantity;
    void run(
      () => createProductStockMovement(stockTarget.publicId, stockAction, movementQuantity, csrfToken, stockAction === "defective/disposals" && confirmedDisposal),
      "Movimentação de estoque registrada.",
      () => { setStockQuantity(""); setConfirmedDisposal(false); setStockReload((value) => value + 1); },
    );
  }

  return (
    <section className="page-section product-catalog">
      <div className="page-heading">
        <div><p className="eyebrow">Cadastros</p><h1>Produtos e Estoque</h1><p className="muted">Consulte os saldos derivados das movimentações e use as ações autorizadas.</p></div>
        <span className="count-pill">{result?.pagination.total ?? "—"} registros</span>
      </div>

      {canManageProducts && <form className="product-form info-card" onSubmit={submitCreate}>
        <h2>Novo produto</h2>
        <div className="product-form__row">
          <label>Código interno (opcional)<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} disabled={pending} /></label>
          <label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={255} required disabled={pending} /></label>
          <label>Categoria<select value={formCategory} onChange={(event) => setFormCategory(event.target.value as ProductCategory)} disabled={pending}>
            <option value="PART">Peça</option><option value="RESALE_GOOD">Mercadoria para revenda</option>
          </select></label>
          <label>Preço de venda padrão (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} disabled={pending} /></label>
          {canUpdateCosts && <label>Custo de aquisição (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} disabled={pending} /></label>}
          <button className="button button--primary" type="submit" disabled={pending}>Cadastrar produto</button>
        </div>
        <p className="muted">Código interno é único quando informado. A inclusão não registra saldo nem movimentação.</p>
      </form>}

      <div className="product-toolbar">
        <form onSubmit={submitSearch} className="product-search">
          <label>Buscar por código ou descrição<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={120} /></label>
          <button className="button button--secondary" type="submit">Buscar</button>
        </form>
        <label className="product-category-filter">Categoria<select value={category} onChange={(event) => { setCategory(event.target.value as CategoryFilter); setPage(1); }}>
          <option value="all">Todas</option><option value="PART">Peça</option><option value="RESALE_GOOD">Mercadoria para revenda</option>
        </select></label>
        <fieldset className="service-filters"><legend>Situação</legend>
          {([["active", "Ativos"], ["inactive", "Inativos"], ["all", "Todos"]] as const).map(([value, label]) => (
            <button key={value} type="button" className={`button ${status === value ? "button--primary" : "button--secondary"}`} aria-pressed={status === value}
              onClick={() => { setStatus(value); setPage(1); }}>{label}</button>
          ))}
        </fieldset>
      </div>

      {actionError && <p className="form-message form-message--error" role="alert">{actionError}</p>}
      {success && <p className="form-message form-message--success" role="status">{success}</p>}

      <AsyncState loading={loading} error={loadError} empty={!loading && !loadError && !result?.data.length}
        emptyMessage="Nenhum produto encontrado neste filtro." onRetry={() => setReload((value) => value + 1)} />

      {!!result?.data.length && !loading && !loadError && <>
        <div className="table-card"><div className="table-scroll"><table>
          <thead><tr><th>Código</th><th>Descrição</th><th>Categoria</th><th>Preço de venda</th>{canReadCosts && <><th>Custo de aquisição</th><th>Lucro bruto estimado</th></>}<th>Total</th><th>Aplicadas</th><th>Defeituosas</th><th>Disponíveis</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{result.data.map((product) => <tr key={product.publicId}>
            <td>{product.internalCode ?? "—"}</td><td><strong>{product.description}</strong></td><td>{categoryLabels[product.category]}</td><td>{displayMoney(product.salePrice)}</td>
            {canReadCosts && <><td>{displayMoney(product.acquisitionCost)}</td><td>{product.grossProfitEstimate === null || product.grossProfitEstimate === undefined ? "Não calculável" : displayMoney(product.grossProfitEstimate)}</td></>}
            <td>{product.stock?.total ?? 0}</td><td>{product.stock?.applied ?? 0}</td><td>{product.stock?.defective ?? 0}</td>
            <td className={(product.stock?.available ?? 0) < 0 ? "stock-negative" : undefined}>{product.stock?.available ?? 0}</td>
            <td><span className="status-badge">{product.isActive ? "Ativo" : "Inativo"}</span></td>
            <td><div className="service-actions">
              {canManageProducts && <button className="text-button" type="button" disabled={pending} onClick={() => beginEdit(product)}>Alterar</button>}
              {canManageProducts && <button className="text-button" type="button" disabled={pending} onClick={() => void run(
                () => changeProductActivity(product, !product.isActive, csrfToken), product.isActive ? "Produto inativado." : "Produto reativado.",
              )}>{product.isActive ? "Inativar" : "Reativar"}</button>}
              <button className="text-button" type="button" disabled={pending} onClick={() => { setStockTarget(product); setStockPage(1); setActionError(""); }}>
                {canManageStock ? "Estoque" : "Movimentações"}
              </button>
            </div></td>
          </tr>)}</tbody>
        </table></div></div>
        <PaginationControls page={result.pagination.page} totalPages={result.pagination.totalPages} total={result.pagination.total} onPageChange={setPage} />
      </>}

      {stockTarget && <section className="info-card product-stock-panel" aria-label={`Estoque de ${stockTarget.description}`}>
        <div className="page-heading">
          <div><p className="eyebrow">Estoque</p><h2>{stockTarget.description}</h2><p className="muted">Saldos calculados pelo histórico imutável de movimentações.</p></div>
          <button className="button button--secondary" type="button" onClick={() => setStockTarget(null)}>Fechar</button>
        </div>
        <div className="stock-balance-grid" aria-live="polite">
          <div><span>Total</span><strong>{stockBalance?.total ?? "—"}</strong></div>
          <div><span>Aplicadas</span><strong>{stockBalance?.applied ?? "—"}</strong></div>
          <div><span>Defeituosas</span><strong>{stockBalance?.defective ?? "—"}</strong></div>
          <div><span>Disponíveis</span><strong className={(stockBalance?.available ?? 0) < 0 ? "stock-negative" : undefined}>{stockBalance?.available ?? "—"}</strong></div>
        </div>
        {canManageStock && <form className="product-form" onSubmit={submitStockAction}>
          <h3>Nova movimentação</h3>
          <div className="product-form__row">
            <label>Operação<select value={stockAction} onChange={(event) => { setStockAction(event.target.value as StockAction); setConfirmedDisposal(false); }} disabled={pending}>
              {Object.entries(stockActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {stockAction === "adjustment" && <label>Direção<select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value as "INCREASE" | "DECREASE")} disabled={pending}>
              <option value="INCREASE">Aumentar</option><option value="DECREASE">Reduzir</option>
            </select></label>}
            <label>Quantidade<input type="number" min="1" max="2147483647" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} required disabled={pending} /></label>
            {stockAction === "defective/disposals" && <label className="checkbox-label"><input type="checkbox" checked={confirmedDisposal} onChange={(event) => setConfirmedDisposal(event.target.checked)} disabled={pending} /> Confirmo o descarte definitivo, que não pode ser desfeito diretamente.</label>}
            <button className="button button--primary" type="submit" disabled={pending || (stockAction === "defective/disposals" && !confirmedDisposal)}>Registrar movimentação</button>
          </div>
          <p className="muted">Ajustes podem deixar a disponibilidade negativa. Não é necessário informar justificativa.</p>
        </form>}
        <div className="product-stock-history">
          <h3>Histórico de movimentações</h3>
          {!movements ? <p role="status">Carregando histórico…</p> : movements.data.length === 0 ? <p>Nenhuma movimentação registrada.</p> : <div className="table-card"><div className="table-scroll"><table>
            <thead><tr><th>Data/hora</th><th>Movimentação</th><th>Quantidade</th><th>Variação do total</th><th>Variação das defeituosas</th><th>Usuário</th></tr></thead>
            <tbody>{movements.data.map((movement) => <tr key={movement.publicId}>
              <td>{new Date(movement.occurredAt).toLocaleString("pt-BR")}</td>
              <td>{movementLabels[movement.type]}</td>
              <td>{movement.quantity}</td>
              <td>{movement.totalDelta > 0 ? `+${movement.totalDelta}` : movement.totalDelta}</td>
              <td>{movement.defectiveDelta > 0 ? `+${movement.defectiveDelta}` : movement.defectiveDelta}</td>
              <td>{movement.actor.username}</td>
            </tr>)}</tbody>
          </table></div></div>}
          {movements && movements.pagination.totalPages > 1 && <PaginationControls page={movements.pagination.page} totalPages={movements.pagination.totalPages} total={movements.pagination.total} onPageChange={setStockPage} />}
        </div>
      </section>}

      {editTarget && canManageProducts && <form className="product-form info-card" onSubmit={submitEdit}>
        <h2>Alterar produto</h2>
        <div className="product-form__row">
          <label>Código interno (opcional)<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} disabled={pending} /></label>
          <label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={255} required disabled={pending} /></label>
          <label>Categoria<select value={formCategory} onChange={(event) => setFormCategory(event.target.value as ProductCategory)} disabled={pending}>
            <option value="PART">Peça</option><option value="RESALE_GOOD">Mercadoria para revenda</option>
          </select></label>
          <label>Preço de venda padrão (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} disabled={pending} /></label>
          {canUpdateCosts && <>
            <label>{canReadCosts ? "Custo de aquisição (opcional)" : "Novo custo de aquisição (opcional; em branco mantém o atual)"}<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={acquisitionCost} onChange={(event) => { setAcquisitionCost(event.target.value); setClearAcquisitionCost(false); }} disabled={pending || clearAcquisitionCost} /></label>
            {!canReadCosts && <label className="checkbox-label"><input type="checkbox" checked={clearAcquisitionCost} onChange={(event) => { setClearAcquisitionCost(event.target.checked); setAcquisitionCost(""); }} disabled={pending} /> Definir custo como desconhecido (NULL)</label>}
          </>}
          <button className="button button--primary" type="submit" disabled={pending}>Salvar alterações</button>
          <button className="button button--secondary" type="button" disabled={pending} onClick={() => setEditTarget(null)}>Cancelar</button>
        </div>
      </form>}
    </section>
  );
}
