import { useEffect, useState, type FormEvent } from "react";
import {
  changeProductActivity, createProduct, listProducts, ProductApiError, updateProduct,
  type CatalogProduct, type ProductCategory, type ProductPage, type ProductStatus,
} from "../../api/products";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";

interface Props { csrfToken: string; canManageCosts?: boolean }
type CategoryFilter = ProductCategory | "all";

const categoryLabels: Record<ProductCategory, string> = { PART: "Peça", RESALE_GOOD: "Mercadoria para revenda" };

function actionMessage(error: unknown): string {
  if (error instanceof ProductApiError) {
    if (error.code === "DUPLICATE_PRODUCT_CODE") return "Já existe um produto cadastrado com esse código interno.";
    if (error.code === "PRODUCT_VERSION_CONFLICT" || error.code === "PRODUCT_CONCURRENCY_CONFLICT") {
      return "O produto mudou enquanto você trabalhava. A lista foi atualizada; confira os dados e tente novamente.";
    }
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

function inputMoney(value: string | null | undefined): string { return value?.replace(".", ",") ?? ""; }
function displayMoney(value: string | null | undefined): string { return value === null || value === undefined ? "Não informado" : `R$ ${value.replace(".", ",")}`; }

export function ProductCatalogPage({ csrfToken, canManageCosts = false }: Props) {
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
  const [editTarget, setEditTarget] = useState<CatalogProduct | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

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
    void run(() => createProduct({ internalCode: code, description, category: formCategory, salePrice, ...(canManageCosts ? { acquisitionCost } : {}) }, csrfToken), "Produto cadastrado.", () => {
      setCode(""); setDescription(""); setFormCategory("PART"); setSalePrice(""); setAcquisitionCost(""); setPage(1);
    });
  }

  function beginEdit(product: CatalogProduct) {
    setEditTarget(product);
    setCode(product.internalCode ?? "");
    setDescription(product.description);
    setFormCategory(product.category);
    setSalePrice(inputMoney(product.salePrice));
    setAcquisitionCost(inputMoney(product.acquisitionCost));
    setActionError(""); setSuccess("");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    void run(() => updateProduct(editTarget, { internalCode: code, description, category: formCategory, salePrice, ...(canManageCosts ? { acquisitionCost } : {}) }, csrfToken), "Produto atualizado.", () => setEditTarget(null));
  }

  return (
    <section className="page-section product-catalog">
      <div className="page-heading">
        <div><p className="eyebrow">Cadastros</p><h1>Cadastro de Produtos</h1><p className="muted">Identificação e situação cadastral. O saldo de estoque ainda não é controlado nesta etapa.</p></div>
        <span className="count-pill">{result?.pagination.total ?? "—"} registros</span>
      </div>

      <form className="product-form info-card" onSubmit={submitCreate}>
        <h2>Novo produto</h2>
        <div className="product-form__row">
          <label>Código interno (opcional)<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} disabled={pending} /></label>
          <label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={255} required disabled={pending} /></label>
          <label>Categoria<select value={formCategory} onChange={(event) => setFormCategory(event.target.value as ProductCategory)} disabled={pending}>
            <option value="PART">Peça</option><option value="RESALE_GOOD">Mercadoria para revenda</option>
          </select></label>
          <label>Preço de venda padrão (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} disabled={pending} /></label>
          {canManageCosts && <label>Custo de aquisição (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} disabled={pending} /></label>}
          <button className="button button--primary" type="submit" disabled={pending}>Cadastrar produto</button>
        </div>
        <p className="muted">Código interno é único quando informado. A inclusão não registra saldo nem movimentação.</p>
      </form>

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
          <thead><tr><th>Código</th><th>Descrição</th><th>Categoria</th><th>Preço de venda</th>{canManageCosts && <><th>Custo de aquisição</th><th>Lucro bruto estimado</th></>}<th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{result.data.map((product) => <tr key={product.publicId}>
            <td>{product.internalCode ?? "—"}</td><td><strong>{product.description}</strong></td><td>{categoryLabels[product.category]}</td><td>{displayMoney(product.salePrice)}</td>
            {canManageCosts && <><td>{displayMoney(product.acquisitionCost)}</td><td>{product.grossProfitEstimate === null || product.grossProfitEstimate === undefined ? "Não calculável" : displayMoney(product.grossProfitEstimate)}</td></>}
            <td><span className="status-badge">{product.isActive ? "Ativo" : "Inativo"}</span></td>
            <td><div className="service-actions">
              <button className="text-button" type="button" disabled={pending} onClick={() => beginEdit(product)}>Alterar</button>
              <button className="text-button" type="button" disabled={pending} onClick={() => void run(
                () => changeProductActivity(product, !product.isActive, csrfToken), product.isActive ? "Produto inativado." : "Produto reativado.",
              )}>{product.isActive ? "Inativar" : "Reativar"}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div></div>
        <PaginationControls page={result.pagination.page} totalPages={result.pagination.totalPages} total={result.pagination.total} onPageChange={setPage} />
      </>}

      {editTarget && <form className="product-form info-card" onSubmit={submitEdit}>
        <h2>Alterar produto</h2>
        <div className="product-form__row">
          <label>Código interno (opcional)<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} disabled={pending} /></label>
          <label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={255} required disabled={pending} /></label>
          <label>Categoria<select value={formCategory} onChange={(event) => setFormCategory(event.target.value as ProductCategory)} disabled={pending}>
            <option value="PART">Peça</option><option value="RESALE_GOOD">Mercadoria para revenda</option>
          </select></label>
          <label>Preço de venda padrão (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} disabled={pending} /></label>
          {canManageCosts && <label>Custo de aquisição (opcional)<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} disabled={pending} /></label>}
          <button className="button button--primary" type="submit" disabled={pending}>Salvar alterações</button>
          <button className="button button--secondary" type="button" disabled={pending} onClick={() => setEditTarget(null)}>Cancelar</button>
        </div>
      </form>}
    </section>
  );
}
