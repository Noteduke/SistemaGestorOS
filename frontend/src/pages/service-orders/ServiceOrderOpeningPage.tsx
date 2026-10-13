import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  cancelServiceOrderOpening,
  confirmServiceOrderOpening,
  createServiceOrderOpening,
  getCurrentServiceOrderOpening,
  listOpeningCustomers,
  listOpeningEquipment,
  updateServiceOrderOpeningCustomer,
  updateServiceOrderOpeningEquipment,
  type OpeningCustomer,
  type OpeningEquipment,
  type ServiceOrderOpening,
} from "../../api/serviceOrders";

interface ServiceOrderOpeningPageProps {
  csrfToken: string;
  canConfirmServiceOrderOpening: boolean;
  onBack: () => void;
  onConfirmed: (publicId: string) => void;
}

function openingErrorMessage(error: unknown, action: "load" | "cancel" | "confirm"): string {
  if (error instanceof ApiError) {
    if (action === "confirm") {
      if (error.status === 400 && error.code === "VALIDATION_ERROR") return "A confirmação da OS não foi aceita. Revise os dados da abertura.";
      if (error.status === 401) return "Sua sessão expirou. Faça login novamente.";
      if (error.status === 403) return "Você não tem permissão para confirmar esta OS ou sua sessão precisa ser renovada.";
      if (error.status === 404 && error.code === "OPENING_NOT_FOUND") return "A abertura não está mais disponível. Volte para a lista e tente novamente.";
      if (error.status === 409 && error.code === "CUSTOMER_REQUIRED") return "Selecione e salve o cliente antes de confirmar a OS.";
      if (error.status === 409 && error.code === "EQUIPMENT_REQUIRED") return "Selecione e salve o equipamento antes de confirmar a OS.";
      if (error.status === 409 && error.code === "OPENING_NOT_IN_PROGRESS") return "Esta abertura não está mais em andamento. Recarregue a tela.";
      if (error.status === 409 && error.code === "OPENING_CONCURRENCY_CONFLICT") return "O estado da abertura mudou. Recarregue antes de tentar novamente.";
      if (error.status === 409 && error.code === "CUSTOMER_NOT_ELIGIBLE") return "O cliente não está mais disponível para esta OS. Atualize a abertura.";
      if (error.status === 409 && error.code === "EQUIPMENT_INACTIVE") return "O equipamento não está mais ativo. Atualize a abertura.";
      if (error.status === 409 && error.code === "OWNERSHIP_DECISION_REQUIRED") return "A titularidade do equipamento precisa ser revisada antes da confirmação.";
      if (error.status === 409 && error.code === "OPENING_STATE_INCONSISTENT") return "A abertura está em um estado inconsistente. Recarregue a tela ou contate o suporte.";
      if (error.status === 409) return "Não foi possível confirmar a OS devido ao estado atual da abertura.";
      if (error.status === 422) return "A solicitação de confirmação foi rejeitada. Revise os dados da abertura.";
      return "Não foi possível comunicar com o servidor para confirmar a OS.";
    }
    if (error.status === 401) return "Sua sessão expirou ou não está autenticada. Entre novamente para continuar.";
    if (error.status === 403) return "Você não tem permissão para iniciar ou cancelar abertura de OS.";
    if (error.status === 404) return action === "cancel" ? "A abertura de OS não foi encontrada." : "Não foi possível localizar a abertura em andamento.";
    if (error.status === 409) return "A abertura mudou de estado. Atualize a tela e tente novamente.";
    if (error.status === 400 || error.status === 422) return "A solicitação não foi aceita. Atualize a tela e tente novamente.";
  }
  if (action === "confirm") return "Não foi possível comunicar com o servidor para confirmar a OS.";
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

function equipmentLookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para pesquisar equipamentos.";
    if (error.status === 403) return "Você não tem permissão para pesquisar equipamentos para a abertura da OS.";
    if (error.status === 400 || error.status === 422) return "A pesquisa não foi aceita. Revise o texto e tente novamente.";
  }
  return "Não foi possível pesquisar equipamentos. Tente novamente.";
}

function saveEquipmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para salvar o equipamento.";
    if (error.status === 403) return "Você não tem permissão para alterar a abertura de OS.";
    if (error.status === 404 || error.status === 400 || error.status === 422) {
      return "Não foi possível vincular este equipamento à abertura da OS.";
    }
    if (error.status === 409 && error.code === "OWNERSHIP_DECISION_REQUIRED") {
      return "Este equipamento está vinculado a outro cliente. A transferência de titularidade será tratada em uma etapa posterior.";
    }
    if (error.status === 409) return "A abertura ou o equipamento mudou de estado. Atualize a tela e tente novamente.";
  }
  return "Não foi possível salvar o equipamento da abertura. Tente novamente.";
}

function equipmentSerialLabel(equipment: OpeningEquipment): string {
  return equipment.serialIdentificationStatus === "NOT_IDENTIFIED" || equipment.serialNumber === null
    ? "Número de série não identificado"
    : `Série: ${equipment.serialNumber}`;
}

export function ServiceOrderOpeningPage({ csrfToken, canConfirmServiceOrderOpening, onBack, onConfirmed }: ServiceOrderOpeningPageProps) {
  const [opening, setOpening] = useState<ServiceOrderOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
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
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipments, setEquipments] = useState<OpeningEquipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<OpeningEquipment | null>(null);
  const [searchingEquipments, setSearchingEquipments] = useState(false);
  const [equipmentSearchError, setEquipmentSearchError] = useState<string | null>(null);
  const [equipmentListLoaded, setEquipmentListLoaded] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(false);
  const [savingEquipment, setSavingEquipment] = useState(false);
  const [equipmentSaveError, setEquipmentSaveError] = useState<string | null>(null);
  const [equipmentSaveNotice, setEquipmentSaveNotice] = useState<string | null>(null);
  const started = useRef(false);
  const confirmingRef = useRef(false);

  async function loadOrCreateOpening() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setCanceled(null);
    setConfirmationError(null);
    setShowConfirmation(false);
    setOpening(null);
    setSelectedCustomer(null);
    setCustomerSaveError(null);
    setCustomerSaveNotice(null);
    setEditingCustomer(false);
    setCustomers([]);
    setCustomerListLoaded(false);
    setEquipmentSearch("");
    setEquipments([]);
    setSelectedEquipment(null);
    setEquipmentSearchError(null);
    setEquipmentListLoaded(false);
    setEditingEquipment(false);
    setEquipmentSaveError(null);
    setEquipmentSaveNotice(null);

    try {
      try {
        const current = await getCurrentServiceOrderOpening();
        setOpening(current.data);
        setEditingCustomer(!current.data.customerPublicId);
        setEditingEquipment(!current.data.equipmentPublicId);
        return;
      } catch (currentError) {
        if (!(currentError instanceof ApiError) || currentError.status !== 404) throw currentError;
      }

      try {
        const created = await createServiceOrderOpening(csrfToken);
        setOpening(created.data);
        setEditingCustomer(true);
        setEditingEquipment(true);
      } catch (createError) {
        if (createError instanceof ApiError && createError.status === 409) {
          const current = await getCurrentServiceOrderOpening();
          setOpening(current.data);
          setEditingCustomer(!current.data.customerPublicId);
          setEditingEquipment(!current.data.equipmentPublicId);
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
      setSelectedCustomer(null);
      setEditingCustomer(false);
      setCustomerSaveNotice("Cliente salvo na abertura em andamento.");
    } catch (reason) {
      setCustomerSaveError(saveCustomerErrorMessage(reason));
    } finally {
      setSavingCustomer(false);
    }
  }

  async function searchOpeningEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchingEquipments(true);
    setEquipmentSearchError(null);
    setEquipments([]);
    setEquipmentListLoaded(false);
    setSelectedEquipment(null);
    setEquipmentSaveError(null);
    setEquipmentSaveNotice(null);
    try {
      const result = await listOpeningEquipment(1, 20, equipmentSearch);
      setEquipments(result.data);
      setEquipmentListLoaded(true);
    } catch (reason) {
      setEquipmentSearchError(equipmentLookupErrorMessage(reason));
    } finally {
      setSearchingEquipments(false);
    }
  }

  async function saveEquipment() {
    if (!opening || !selectedEquipment || savingEquipment || !opening.customerPublicId) return;
    if (selectedEquipment.owner.publicId !== opening.customerPublicId) return;

    setSavingEquipment(true);
    setEquipmentSaveError(null);
    setEquipmentSaveNotice(null);
    try {
      const result = await updateServiceOrderOpeningEquipment(opening.publicId, selectedEquipment.publicId, csrfToken);
      setOpening(result.data);
      setSelectedEquipment(null);
      setEditingEquipment(false);
      setEquipmentSaveNotice("Equipamento salvo na abertura em andamento.");
    } catch (reason) {
      setEquipmentSaveError(saveEquipmentErrorMessage(reason));
    } finally {
      setSavingEquipment(false);
    }
  }

  async function cancelOpening() {
    if (!opening || canceling || confirming) return;
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

  async function confirmOpening() {
    if (!opening || !canConfirmServiceOrderOpening || !canConfirm || confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);
    setConfirmationError(null);
    try {
      const result = await confirmServiceOrderOpening(opening.publicId, csrfToken);
      setShowConfirmation(false);
      onConfirmed(result.data.publicId);
    } catch (reason) {
      setConfirmationError(openingErrorMessage(reason, "confirm"));
      setShowConfirmation(false);
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  }

  const linkedCustomer = opening
    ? selectedCustomer?.publicId === opening.customerPublicId
      ? selectedCustomer
      : opening.customer?.publicId === opening.customerPublicId
        ? opening.customer
        : null
    : null;
  const selectedEquipmentHasDifferentOwner = Boolean(
    opening?.customerPublicId && selectedEquipment && selectedEquipment.owner.publicId !== opening.customerPublicId,
  );
  const waitingForCustomerChange = Boolean(
    opening?.customerPublicId && editingCustomer && selectedCustomer && selectedCustomer.publicId !== opening.customerPublicId,
  );
  const canConfirm = Boolean(
    opening?.status === "IN_PROGRESS"
    && opening.customerPublicId
    && opening.equipmentPublicId
    && opening.equipment?.publicId === opening.equipmentPublicId
    && opening.equipment.owner.publicId === opening.customerPublicId
    && !opening.transferRequested
    && !editingCustomer
    && !editingEquipment
    && !savingCustomer
    && !savingEquipment
    && !canceling
    && !confirming,
  );

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
      {confirmationError && <p className="form-message form-message--error" role="alert">{confirmationError}</p>}

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
            Esta abertura ainda não é uma OS confirmada. Selecionar cliente ou equipamento não cria OS nem snapshot, não altera o cadastro do equipamento e não transfere titularidade.
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
                {linkedCustomer ? (
                  <>
                    <strong>{linkedCustomer.name}</strong>
                    {linkedCustomer.documentHint && <span>Documento: {linkedCustomer.documentHint}</span>}
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

          </section>

          <section className="opening-customer opening-equipment" aria-labelledby="opening-equipment-title">
            <div className="section-heading">
              <div>
                <h2 id="opening-equipment-title">Equipamento</h2>
                <p>Pesquise e vincule um equipamento existente. Esta etapa não cria nem altera cadastros.</p>
              </div>
            </div>

            {!opening.customerPublicId && (
              <p className="muted" role="status">Selecione e salve um cliente antes de escolher o equipamento.</p>
            )}
            {waitingForCustomerChange && (
              <p className="muted" role="status">Salve a alteração do cliente antes de selecionar o equipamento.</p>
            )}

            {opening.equipmentPublicId && !editingEquipment && (
              <div className="opening-customer__current" aria-label="Equipamento vinculado">
                {opening.equipment?.publicId === opening.equipmentPublicId ? (
                  <>
                    <strong>{opening.equipment.type.name} · {opening.equipment.brand.name} · {opening.equipment.model}</strong>
                    <span>{equipmentSerialLabel(opening.equipment)}</span>
                    <span>Proprietário atual: {opening.equipment.owner.name}</span>
                    {opening.equipment.owner.documentHint && <span>Documento do proprietário: {opening.equipment.owner.documentHint}</span>}
                  </>
                ) : (
                  <span>Há um equipamento vinculado a esta abertura. O resumo não é retornado pela API de retomada.</span>
                )}
                <button className="text-button" type="button" onClick={() => { setEditingEquipment(true); setSelectedEquipment(null); setEquipmentSaveError(null); setEquipmentSaveNotice(null); }}>
                  Trocar equipamento
                </button>
              </div>
            )}

            {opening.customerPublicId && !waitingForCustomerChange && editingEquipment && (
              <>
                <form className="assignment-search opening-customer__search" onSubmit={(event) => void searchOpeningEquipment(event)}>
                  <label htmlFor="opening-equipment-search">Buscar equipamento por modelo, série, tipo, marca ou proprietário</label>
                  <div>
                    <input
                      id="opening-equipment-search"
                      value={equipmentSearch}
                      onChange={(event) => setEquipmentSearch(event.target.value)}
                      maxLength={100}
                      autoComplete="off"
                    />
                    <button className="button button--secondary" type="submit" disabled={searchingEquipments}>
                      {searchingEquipments ? "Buscando…" : "Buscar equipamentos"}
                    </button>
                  </div>
                </form>

                {searchingEquipments && <p className="inline-state" role="status">Pesquisando equipamentos…</p>}
                {equipmentSearchError && <p className="form-message form-message--error" role="alert">{equipmentSearchError}</p>}
                {equipmentListLoaded && equipments.length === 0 && <p className="muted">Nenhum equipamento encontrado para esta busca.</p>}
                {equipments.length > 0 && (
                  <ul className="opening-customer__list" aria-label="Resultados de equipamentos">
                    {equipments.map((equipment) => (
                      <li key={equipment.publicId}>
                        <button
                          type="button"
                          className={selectedEquipment?.publicId === equipment.publicId ? "opening-customer__option opening-customer__option--selected" : "opening-customer__option"}
                          aria-pressed={selectedEquipment?.publicId === equipment.publicId}
                          onClick={() => { setSelectedEquipment(equipment); setEquipmentSaveError(null); setEquipmentSaveNotice(null); }}
                        >
                          <strong>{equipment.type.name} · {equipment.brand.name} · {equipment.model}</strong>
                          <span>{equipmentSerialLabel(equipment)}</span>
                          <span>Proprietário atual: {equipment.owner.name}</span>
                          {equipment.owner.publicId !== opening.customerPublicId && (
                            <span className="form-message form-message--error">Este equipamento está vinculado a outro cliente.</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedEquipment && (
                  <div className="opening-customer__selected" role="status">
                    <p>Equipamento selecionado: <strong>{selectedEquipment.type.name} · {selectedEquipment.brand.name} · {selectedEquipment.model}</strong></p>
                    <p>{equipmentSerialLabel(selectedEquipment)}</p>
                    <p>Proprietário atual: {selectedEquipment.owner.name}</p>
                    {selectedEquipmentHasDifferentOwner && (
                      <p className="form-message form-message--error" role="alert">Este equipamento está vinculado a outro cliente. A transferência de titularidade será tratada em uma etapa posterior.</p>
                    )}
                    <button className="button button--primary" type="button" onClick={() => void saveEquipment()} disabled={savingEquipment || selectedEquipmentHasDifferentOwner || selectedEquipment.publicId === opening.equipmentPublicId}>
                      {savingEquipment ? "Salvando…" : "Salvar equipamento"}
                    </button>
                  </div>
                )}
                {equipmentSaveError && <p className="form-message form-message--error" role="alert">{equipmentSaveError}</p>}
              </>
            )}
            {equipmentSaveNotice && <p className="form-message form-message--success" role="status">{equipmentSaveNotice}</p>}
          </section>

          <div className="opening-actions">
            {canConfirmServiceOrderOpening && (
              <button className="button button--primary" type="button" onClick={() => { setConfirmationError(null); setShowConfirmation(true); }} disabled={!canConfirm}>
                Confirmar OS
              </button>
            )}
            <button className="button button--danger" type="button" onClick={() => void cancelOpening()} disabled={canceling || confirming}>
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

      {showConfirmation && opening && (
        <div className="opening-confirmation-backdrop">
          <section className="opening-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-confirmation-title" aria-describedby="opening-confirmation-description" onKeyDown={(event) => { if (event.key === "Escape" && !confirming) setShowConfirmation(false); }}>
            <h2 id="opening-confirmation-title">Confirmar criação da OS?</h2>
            <div id="opening-confirmation-description" className="opening-confirmation-copy">
              <p>A Ordem de Serviço será criada oficialmente como <strong>ABERTA / TRIAGEM</strong>.</p>
              <p>O número reservado <strong>{opening.visibleNumber}</strong> se tornará definitivo e o Backend registrará os snapshots do cliente e do equipamento.</p>
              <p>Esta confirmação não cria orçamento, peças ou registros financeiros.</p>
            </div>
            {confirmationError && <p className="form-message form-message--error" role="alert">{confirmationError}</p>}
            <div className="opening-confirmation-actions">
              <button className="button button--secondary" type="button" onClick={() => setShowConfirmation(false)} disabled={confirming} autoFocus>Voltar</button>
              <button className="button button--primary" type="button" onClick={() => void confirmOpening()} disabled={confirming || !canConfirm}>
                {confirming ? "Confirmando…" : "Confirmar e criar OS"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
