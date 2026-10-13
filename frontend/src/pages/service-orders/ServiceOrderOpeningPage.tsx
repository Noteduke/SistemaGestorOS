import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  cancelServiceOrderOpening,
  createServiceOrderOpening,
  getCurrentServiceOrderOpening,
  listOpeningCustomers,
  updateServiceOrderOpeningCustomer,
  type OpeningCustomer,
  type ServiceOrderOpening,
} from "../../api/serviceOrders";

interface ServiceOrderOpeningPageProps {
  csrfToken: string;
  onBack: () => void;
}

function openingErrorMessage(error: unknown, action: "load" | "cancel"): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou ou não está autenticada. Entre novamente para continuar.";
    if (error.status === 403) return "Você não tem permissão para iniciar ou cancelar abertura de OS.";
    if (error.status === 404) return action === "cancel" ? "A abertura de OS não foi encontrada." : "Não foi possível localizar a abertura em andamento.";
    if (error.status === 409) return "A abertura mudou de estado. Atualize a tela e tente novamente.";
    if (error.status === 400 || error.status === 422) return "A solicitação não foi aceita. Atualize a tela e tente novamente.";
  }
  return "Não foi possível conectar ao serviço. Tente novamente.";
}

function customerLookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para pesquisar clientes.";
    if (error.status === 403) return "Você não tem permissão para pesquisar clientes para a abertura da OS.";
    if (error.status === 400 || error.status === 422) return "A pesquisa não foi aceita. Revise o texto e tente novamente.";
  }
  return "Não foi possível pesquisar clientes. Tente novamente.";
}

function saveCustomerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para salvar o cliente.";
    if (error.status === 403) return "Você não tem permissão para iniciar ou alterar abertura de OS.";
    if (error.status === 404 || error.status === 400 || error.status === 422) {
      return "Não foi possível vincular este cliente à abertura da OS.";
    }
    if (error.status === 409) return "A abertura mudou de estado. Atualize a tela e tente novamente.";
  }
  return "Não foi possível salvar o cliente da abertura. Tente novamente.";
}

export function ServiceOrderOpeningPage({ csrfToken, onBack }: ServiceOrderOpeningPageProps) {
  const [opening, setOpening] = useState<ServiceOrderOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canceled, setCanceled] = useState<ServiceOrderOpening | null>(null);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<OpeningCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<OpeningCustomer | null>(null);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [customerListLoaded, setCustomerListLoaded] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaveError, setCustomerSaveError] = useState<string | null>(null);
  const [customerSaveNotice, setCustomerSaveNotice] = useState<string | null>(null);
  const started = useRef(false);

  async function loadOrCreateOpening() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setCanceled(null);
    setOpening(null);
    setSelectedCustomer(null);
    setCustomerSaveError(null);
    setCustomerSaveNotice(null);
    setEditingCustomer(false);
    setCustomers([]);
    setCustomerListLoaded(false);

    try {
      try {
        const current = await getCurrentServiceOrderOpening();
        setOpening(current.data);
        setEditingCustomer(!current.data.customerPublicId);
        return;
      } catch (currentError) {
        if (!(currentError instanceof ApiError) || currentError.status !== 404) throw currentError;
      }

      try {
        const created = await createServiceOrderOpening(csrfToken);
        setOpening(created.data);
        setEditingCustomer(true);
      } catch (createError) {
        if (createError instanceof ApiError && createError.status === 409) {
          const current = await getCurrentServiceOrderOpening();
          setOpening(current.data);
          setEditingCustomer(!current.data.customerPublicId);
          setNotice("Já existe uma abertura de OS em andamento. Ela foi carregada para continuação.");
        } else {
          throw createError;
        }
      }
    } catch (reason) {
      setError(openingErrorMessage(reason, "load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadOrCreateOpening();
  }, []);

  async function searchCustomers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchingCustomers(true);
    setCustomerSearchError(null);
    setCustomers([]);
    setCustomerListLoaded(false);
    try {
      const result = await listOpeningCustomers(1, 20, search);
      setCustomers(result.data);
      setCustomerListLoaded(true);
    } catch (reason) {
      setCustomerSearchError(customerLookupErrorMessage(reason));
    } finally {
      setSearchingCustomers(false);
    }
  }

  async function saveCustomer() {
    if (!opening || !selectedCustomer || savingCustomer) return;
    setSavingCustomer(true);
    setCustomerSaveError(null);
    setCustomerSaveNotice(null);
    try {
      const result = await updateServiceOrderOpeningCustomer(opening.publicId, selectedCustomer.publicId, csrfToken);
      setOpening(result.data);
      setEditingCustomer(false);
      setCustomerSaveNotice("Cliente salvo na abertura em andamento.");
    } catch (reason) {
      setCustomerSaveError(saveCustomerErrorMessage(reason));
    } finally {
      setSavingCustomer(false);
    }
  }

  async function cancelOpening() {
    if (!opening || canceling) return;
    setCanceling(true);
    setError(null);
    try {
      const result = await cancelServiceOrderOpening(opening.publicId, csrfToken);
      setCanceled(result.data);
      setOpening(null);
    } catch (reason) {
      setError(openingErrorMessage(reason, "cancel"));
    } finally {
      setCanceling(false);
    }
  }

  return (
    <section className="page-section opening-page" aria-labelledby="opening-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Atendimento técnico</p>
          <h1 id="opening-title">Abertura de OS</h1>
          <p className="muted">Inicie ou retome uma abertura em andamento.</p>
        </div>
        <button className="text-button" type="button" onClick={onBack}>Voltar para lista</button>
      </div>

      {loading && <p className="inline-state" role="status">Verificando abertura em andamento…</p>}
      {error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={() => void loadOrCreateOpening()}>Tentar novamente</button>
        </div>
      )}
      {notice && <p className="inline-success" role="status">{notice}</p>}

      {opening && !loading && (
        <article className="opening-card" aria-label="Abertura de OS em andamento">
          <div className="opening-card__heading">
            <div>
              <p className="eyebrow">Número reservado</p>
              <p className="opening-number">{opening.visibleNumber}</p>
            </div>
            <span className="status-badge">Em andamento</span>
          </div>
          <p className="opening-warning">
            Esta abertura ainda não é uma OS confirmada. Vincular um cliente não cria OS nem snapshot; o equipamento será selecionado em uma próxima etapa.
          </p>
          <p className="muted">A abertura permanece como rascunho e ainda não aparece na lista de OS confirmadas.</p>

          <section className="opening-customer" aria-labelledby="opening-customer-title">
            <div className="section-heading">
              <div>
                <h2 id="opening-customer-title">Cliente</h2>
                <p>Pesquise e vincule uma Pessoa elegível como cliente. Nenhum cadastro será criado ou alterado.</p>
              </div>
            </div>

            {opening.customerPublicId && !editingCustomer && (
              <div className="opening-customer__current" aria-label="Cliente vinculado">
                {selectedCustomer?.publicId === opening.customerPublicId ? (
                  <>
                    <strong>{selectedCustomer.name}</strong>
                    {selectedCustomer.documentHint && <span>Documento: {selectedCustomer.documentHint}</span>}
                  </>
                ) : (
                  <span>Há um cliente vinculado a esta abertura. Pesquise para selecionar outro cliente ou continuar com a etapa seguinte.</span>
                )}
                <button className="text-button" type="button" onClick={() => { setEditingCustomer(true); setSelectedCustomer(null); setCustomerSaveError(null); }}>
                  Trocar cliente
                </button>
              </div>
            )}

            {editingCustomer && (
              <>
                <form className="assignment-search opening-customer__search" onSubmit={(event) => void searchCustomers(event)}>
                  <label htmlFor="opening-customer-search">Buscar cliente por nome, documento ou telefone</label>
                  <div>
                    <input
                      id="opening-customer-search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      maxLength={100}
                      autoComplete="off"
                    />
                    <button className="button button--secondary" type="submit" disabled={searchingCustomers}>
                      {searchingCustomers ? "Buscando…" : "Buscar clientes"}
                    </button>
                  </div>
                </form>

                {searchingCustomers && <p className="inline-state" role="status">Pesquisando clientes…</p>}
                {customerSearchError && <p className="form-message form-message--error" role="alert">{customerSearchError}</p>}
                {customerListLoaded && customers.length === 0 && <p className="muted">Nenhum cliente encontrado para esta busca.</p>}
                {customers.length > 0 && (
                  <ul className="opening-customer__list" aria-label="Resultados de clientes">
                    {customers.map((customer) => (
                      <li key={customer.publicId}>
                        <button
                          type="button"
                          className={selectedCustomer?.publicId === customer.publicId ? "opening-customer__option opening-customer__option--selected" : "opening-customer__option"}
                          aria-pressed={selectedCustomer?.publicId === customer.publicId}
                          onClick={() => { setSelectedCustomer(customer); setCustomerSaveError(null); setCustomerSaveNotice(null); }}
                        >
                          <strong>{customer.name}</strong>
                          {customer.documentHint && <span>Documento: {customer.documentHint}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedCustomer && (
                  <div className="opening-customer__selected" role="status">
                    <p>Cliente selecionado: <strong>{selectedCustomer.name}</strong></p>
                    {selectedCustomer.documentHint && <p>Documento: {selectedCustomer.documentHint}</p>}
                    <button className="button button--primary" type="button" onClick={() => void saveCustomer()} disabled={savingCustomer || selectedCustomer.publicId === opening.customerPublicId}>
                      {savingCustomer ? "Salvando…" : "Salvar cliente"}
                    </button>
                  </div>
                )}
                {customerSaveError && <p className="form-message form-message--error" role="alert">{customerSaveError}</p>}
                {customerSaveNotice && <p className="form-message form-message--success" role="status">{customerSaveNotice}</p>}
                {opening.customerPublicId && (
                  <button className="text-button" type="button" onClick={() => { setEditingCustomer(false); setSelectedCustomer(null); setCustomerSaveError(null); }}>
                    Manter cliente vinculado
                  </button>
                )}
              </>
            )}

            <p className="muted">O equipamento será selecionado em uma próxima etapa. Esta tela ainda não confirma a OS.</p>
          </section>

          <div className="opening-actions">
            <button className="button button--danger" type="button" onClick={() => void cancelOpening()} disabled={canceling}>
              {canceling ? "Cancelando…" : "Cancelar abertura"}
            </button>
            <button className="text-button" type="button" onClick={onBack}>Voltar para lista</button>
          </div>
        </article>
      )}

      {canceled && !loading && (
        <article className="opening-card opening-card--canceled">
          <p className="inline-success" role="status">A abertura {canceled.visibleNumber} foi cancelada.</p>
          <p className="muted">
            {canceled.numberReleased
              ? "O número reservado foi liberado."
              : "O número reservado foi mantido como consumido, conforme a sequência de numeração."}
          </p>
          <button className="button" type="button" onClick={onBack}>Voltar para lista de OS</button>
        </article>
      )}
    </section>
  );
}
