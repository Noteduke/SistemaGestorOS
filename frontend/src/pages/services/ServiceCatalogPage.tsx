import { TrackedForm } from "../../components/PendingForms";
import { useEffect, useState, type FormEvent } from "react";
import {
  changeServiceActivity, changeServicePrice, createService, deleteService, listServices, ServiceApiError,
  type CatalogService, type ServiceFilter, type ServicePage,
} from "../../api/services";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";

interface Props { csrfToken: string }

function priceLabel(value: string): string {
  const [whole, fraction = "00"] = value.split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ".")},${fraction}`;
}

function apiPrice(value: string): string {
  return value.trim().replace(",", ".");
}

function actionMessage(error: unknown): string {
  if (error instanceof ServiceApiError) {
    if (error.code === "DUPLICATE_SERVICE_NAME") return "Já existe um serviço cadastrado com esse nome, inclusive entre os desabilitados.";
    if (error.code === "SERVICE_VERSION_CONFLICT" || error.code === "SERVICE_CONCURRENCY_CONFLICT") {
      return "O serviço mudou enquanto você trabalhava. A lista foi atualizada; confira os dados e tente novamente.";
    }
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

export function ServiceCatalogPage({ csrfToken }: Props) {
  const [filter, setFilter] = useState<ServiceFilter>("active");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ServicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [priceTarget, setPriceTarget] = useState<CatalogService | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    listServices(page, filter, search, controller.signal)
      .then(setResult)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(actionMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, filter, search, reload]);

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
      if (error instanceof ServiceApiError && error.status === 409) setReload((value) => value + 1);
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
    void run(() => createService(name, apiPrice(defaultPrice), csrfToken), "Serviço cadastrado.", () => {
      setName("");
      setDefaultPrice("");
      setPage(1);
    });
  }

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceTarget) return;
    void run(() => changeServicePrice(priceTarget, apiPrice(newPrice), csrfToken), "Preço padrão atualizado.", () => setPriceTarget(null));
  }

  function remove(service: CatalogService) {
    if (!window.confirm(`Excluir definitivamente o serviço “${service.name}”? Esta ação manterá um registro no Log Administrativo.`)) return;
    void run(() => deleteService(service, csrfToken), "Serviço excluído. O nome pode ser usado em novo cadastro.", () => {
      if (priceTarget?.publicId === service.publicId) setPriceTarget(null);
    });
  }

  return (
    <section className="page-section service-catalog">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Cadastro de Serviços</h1>
          <p className="muted">Gerencie nomes, preços padrão e disponibilidade para lançamentos futuros.</p>
        </div>
        <span className="count-pill">{result?.pagination.total ?? "—"} registros</span>
      </div>

      <TrackedForm className="service-create info-card" onSubmit={submitCreate}>
        <h2>Novo serviço</h2>
        <div className="service-form-row">
          <label>Nome do serviço<input value={name} onChange={(event) => setName(event.target.value)} maxLength={240} required disabled={pending} /></label>
          <label>Preço padrão<input value={defaultPrice} onChange={(event) => setDefaultPrice(event.target.value)} inputMode="decimal" placeholder="0,00" required disabled={pending} /></label>
          <button className="button button--primary" type="submit" disabled={pending}>Cadastrar</button>
        </div>
        <p className="muted">O serviço nasce ativo. O nome poderá ser usado novamente após exclusão permitida.</p>
      </TrackedForm>

      <div className="service-toolbar">
        <form onSubmit={submitSearch} className="service-search">
          <label>Buscar por nome<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={120} /></label>
          <button className="button button--secondary" type="submit">Buscar</button>
        </form>
        <fieldset className="service-filters">
          <legend>Situação</legend>
          {([ ["active", "Ativos"], ["inactive", "Desabilitados"], ["all", "Todos"] ] as const).map(([value, label]) => (
            <button key={value} type="button" className={`button ${filter === value ? "button--primary" : "button--secondary"}`}
              aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>
          ))}
        </fieldset>
      </div>

      {actionError && <p className="form-message form-message--error" role="alert">{actionError}</p>}
      {success && <p className="form-message form-message--success" role="status">{success}</p>}

      <AsyncState loading={loading} error={loadError} empty={!loading && !loadError && !result?.data.length}
        emptyMessage="Nenhum serviço encontrado neste filtro." onRetry={() => setReload((value) => value + 1)} />

      {!!result?.data.length && !loading && !loadError && (
        <>
          <div className="table-card"><div className="table-scroll"><table>
            <thead><tr><th>Serviço</th><th>Preço padrão</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{result.data.map((service) => (
              <tr key={service.publicId}>
                <td><strong>{service.name}</strong></td>
                <td>{priceLabel(service.defaultPrice)}</td>
                <td><span className="status-badge">{service.isActive ? "Ativo" : "Desabilitado"}</span></td>
                <td><div className="service-actions">
                  <button className="text-button" type="button" disabled={pending} onClick={() => {
                    setPriceTarget(service); setNewPrice(service.defaultPrice); setActionError("");
                  }}>Alterar preço</button>
                  <button className="text-button" type="button" disabled={pending}
                    onClick={() => void run(() => changeServiceActivity(service, !service.isActive, csrfToken),
                      service.isActive ? "Serviço desabilitado." : "Serviço habilitado.")}>{service.isActive ? "Desabilitar" : "Habilitar"}</button>
                  <button className="text-button service-delete" type="button" disabled={pending} onClick={() => remove(service)}>Excluir</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div></div>
          <PaginationControls page={result.pagination.page} totalPages={result.pagination.totalPages} total={result.pagination.total}
            onPageChange={setPage} />
        </>
      )}

      {priceTarget && <TrackedForm identity={priceTarget.publicId} className="service-price-editor info-card" onSubmit={submitPrice}>
        <h2>Preço padrão: {priceTarget.name}</h2>
        <p className="muted">O nome não pode ser alterado. O novo preço não muda ordens anteriores.</p>
        <div className="service-form-row">
          <label>Novo preço<input value={newPrice} onChange={(event) => setNewPrice(event.target.value)} inputMode="decimal" required disabled={pending} /></label>
          <button className="button button--primary" type="submit" disabled={pending}>Salvar preço</button>
          <button className="button button--secondary" type="button" disabled={pending} onClick={() => setPriceTarget(null)}>Cancelar</button>
        </div>
      </TrackedForm>}
    </section>
  );
}
