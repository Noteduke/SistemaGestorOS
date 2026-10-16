import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  cancelServiceOrderOpening,
  confirmServiceOrderOpening,
  createServiceOrderOpening,
  getCurrentServiceOrderOpening,
  listOpeningEquipmentBrands,
  listOpeningCustomers,
  listOpeningEquipment,
  listOpeningEquipmentTypes,
  lookupDellModel,
  updateServiceOrderOpeningOwnership,
  updateServiceOrderOpeningCustomer,
  updateServiceOrderOpeningEquipment,
  updateServiceOrderOpeningEquipmentDraft,
  type OpeningCatalogOption,
  type OpeningCustomer,
  type OpeningEquipment,
  type OpeningEquipmentDraft,
  type OpeningOwnershipDecision,
  type ServiceOrderOpening,
} from "../../api/serviceOrders";

interface ServiceOrderOpeningPageProps {
  csrfToken: string;
  canConfirmServiceOrderOpening: boolean;
  canCreateEquipment?: boolean;
  canTransferEquipmentOwnership?: boolean;
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

function saveEquipmentErrorMessage(error: unknown, decision?: OpeningOwnershipDecision): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para salvar o equipamento.";
    if (error.status === 403 && decision === "TRANSFER_TO_CUSTOMER") return "Você não tem permissão para transferir a titularidade deste equipamento.";
    if (error.status === 403) return "Você não tem permissão para alterar a abertura de OS.";
    if (error.status === 404 || error.status === 400 || error.status === 422) {
      return "Não foi possível vincular este equipamento à abertura da OS.";
    }
    if (error.status === 409 && error.code === "OWNERSHIP_DECISION_REQUIRED") {
      return "A titularidade do equipamento mudou. Revise a decisão antes de continuar.";
    }
    if (error.status === 409) return "A abertura ou o equipamento mudou de estado. Atualize a tela e tente novamente.";
  }
  return "Não foi possível salvar o equipamento da abertura. Tente novamente.";
}

function saveEquipmentDraftErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 422) return "Os dados do novo equipamento são inválidos. Revise os campos e tente novamente.";
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para salvar o novo equipamento.";
    if (error.status === 403) return "Você não tem permissão para criar equipamento ou alterar esta abertura.";
    if (error.status === 404) return "A abertura não foi encontrada. Atualize a tela e tente novamente.";
    if (error.status === 409) return "A abertura mudou de estado. Atualize a tela e tente novamente.";
  }
  return "Não foi possível salvar o novo equipamento na abertura.";
}

function equipmentSerialLabel(equipment: OpeningEquipment): string {
  return equipment.serialIdentificationStatus === "NOT_IDENTIFIED" || equipment.serialNumber === null
    ? "Número de série não identificado"
    : `Série: ${equipment.serialNumber}`;
}

const emptyEquipmentDraft: OpeningEquipmentDraft = {
  typePublicId: "",
  brandPublicId: "",
  model: "",
  serialIdentificationStatus: "IDENTIFIED",
  serialNumber: "",
};

function hasValidEquipmentDraft(draft: OpeningEquipmentDraft | null): draft is OpeningEquipmentDraft {
  return Boolean(draft?.typePublicId && draft.brandPublicId && draft.model.trim()
    && (draft.serialIdentificationStatus === "NOT_IDENTIFIED"
      ? draft.serialNumber === null
      : typeof draft.serialNumber === "string" && draft.serialNumber.trim()));
}

export function ServiceOrderOpeningPage({ csrfToken, canConfirmServiceOrderOpening, canCreateEquipment = false, canTransferEquipmentOwnership = false, onBack, onConfirmed }: ServiceOrderOpeningPageProps) {
  const [opening, setOpening] = useState<ServiceOrderOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canceled, setCanceled] = useState<ServiceOrderOpening | null>(null);
  const [canceledTransferWasPending, setCanceledTransferWasPending] = useState(false);
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
  const [savingOwnershipDecision, setSavingOwnershipDecision] = useState(false);
  const [equipmentSaveError, setEquipmentSaveError] = useState<string | null>(null);
  const [equipmentSaveNotice, setEquipmentSaveNotice] = useState<string | null>(null);
  const [equipmentMode, setEquipmentMode] = useState<"existing" | "new">("existing");
  const [equipmentDraftForm, setEquipmentDraftForm] = useState<OpeningEquipmentDraft>(emptyEquipmentDraft);
  const [equipmentTypes, setEquipmentTypes] = useState<OpeningCatalogOption[]>([]);
  const [equipmentBrands, setEquipmentBrands] = useState<OpeningCatalogOption[]>([]);
  const [loadingEquipmentCatalogs, setLoadingEquipmentCatalogs] = useState(false);
  const [equipmentCatalogError, setEquipmentCatalogError] = useState<string | null>(null);
  const [savingEquipmentDraft, setSavingEquipmentDraft] = useState(false);
  const [equipmentDraftError, setEquipmentDraftError] = useState<string | null>(null);
  const [equipmentDraftNotice, setEquipmentDraftNotice] = useState<string | null>(null);
  const [lookingUpDell, setLookingUpDell] = useState(false);
  const [dellLookupResult, setDellLookupResult] = useState<{ model: string; serviceTag: string } | null>(null);
  const [dellLookupMessage, setDellLookupMessage] = useState<string | null>(null);
  const started = useRef(false);
  const confirmingRef = useRef(false);
  const dellLookupSequence = useRef(0);

  async function loadOrCreateOpening() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setCanceled(null);
    setCanceledTransferWasPending(false);
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
    setSavingOwnershipDecision(false);
    setEquipmentMode("existing");
    setEquipmentDraftForm(emptyEquipmentDraft);
    setEquipmentTypes([]);
    setEquipmentBrands([]);
    setEquipmentCatalogError(null);
    setEquipmentDraftError(null);
    setEquipmentDraftNotice(null);
    setDellLookupResult(null);
    setDellLookupMessage(null);
    dellLookupSequence.current += 1;

    try {
      try {
        const current = await getCurrentServiceOrderOpening();
        setOpening(current.data);
        setEditingCustomer(!current.data.customerPublicId);
        const draft = current.data.equipmentDraft;
        const hasDraft = hasValidEquipmentDraft(draft);
        setEquipmentMode(hasDraft ? "new" : "existing");
        if (hasDraft) {
          setEquipmentDraftForm(draft!);
          void loadEquipmentCatalogs();
        }
        setEditingEquipment(!current.data.equipmentPublicId && !hasDraft);
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
          const draft = current.data.equipmentDraft;
          const hasDraft = hasValidEquipmentDraft(draft);
          setEquipmentMode(hasDraft ? "new" : "existing");
          if (hasDraft) {
            setEquipmentDraftForm(draft!);
            void loadEquipmentCatalogs();
          }
          setEditingEquipment(!current.data.equipmentPublicId && !hasDraft);
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
      setEquipmentMode("existing");
      setEquipmentDraftForm(emptyEquipmentDraft);
      setEditingEquipment(false);
      setEquipmentSaveNotice("Equipamento salvo na abertura em andamento.");
    } catch (reason) {
      setEquipmentSaveError(saveEquipmentErrorMessage(reason));
    } finally {
      setSavingEquipment(false);
    }
  }

  async function saveOwnershipDecision(decision: OpeningOwnershipDecision) {
    if (!opening || !ownershipCandidate || !ownershipTargetCustomer || savingOwnershipDecision) return;
    if (decision === "TRANSFER_TO_CUSTOMER" && !canTransferEquipmentOwnership) return;

    setSavingOwnershipDecision(true);
    setEquipmentSaveError(null);
    setEquipmentSaveNotice(null);
    const patch: {
      customerPublicId?: string;
      equipmentPublicId?: string;
      ownershipDecision: OpeningOwnershipDecision;
    } = { ownershipDecision: decision };

    if (decision === "CANCEL_SELECTION") {
      if (waitingForCustomerChange && selectedCustomer) patch.customerPublicId = selectedCustomer.publicId;
    } else {
      patch.equipmentPublicId = ownershipCandidate.publicId;
      if (decision === "TRANSFER_TO_CUSTOMER") patch.customerPublicId = ownershipTargetCustomer.publicId;
    }

    try {
      const result = await updateServiceOrderOpeningOwnership(opening.publicId, patch, csrfToken);
      setOpening(result.data);
      setSelectedCustomer(null);
      setEditingCustomer(false);
      setSelectedEquipment(null);
      setEquipmentMode("existing");
      setEquipmentSearch("");
      setEquipments([]);
      setEquipmentListLoaded(false);
      setEditingEquipment(decision === "CANCEL_SELECTION");
      if (decision === "CANCEL_SELECTION") {
        setEquipmentSaveNotice("A seleção do equipamento foi cancelada. Nenhuma transferência foi solicitada.");
      } else if (decision === "USE_CURRENT_OWNER") {
        setEquipmentSaveNotice("A abertura será para o proprietário atual do equipamento. Nenhuma transferência foi solicitada.");
      } else {
        setEquipmentSaveNotice("Transferência pendente. A titularidade só mudará quando a OS for confirmada.");
      }
    } catch (reason) {
      setEquipmentSaveError(saveEquipmentErrorMessage(reason, decision));
    } finally {
      setSavingOwnershipDecision(false);
    }
  }

  async function loadEquipmentCatalogs() {
    if (loadingEquipmentCatalogs) return;
    setLoadingEquipmentCatalogs(true);
    setEquipmentCatalogError(null);
    try {
      async function loadAllPages(loader: (page: number, pageSize: number) => Promise<{ data: OpeningCatalogOption[]; pagination: { totalPages: number } }>) {
        const first = await loader(1, 100);
        const pages = await Promise.all(Array.from({ length: Math.max(0, first.pagination.totalPages - 1) }, (_, index) => loader(index + 2, 100)));
        return [...first.data, ...pages.flatMap((page) => page.data)];
      }
      const [types, brands] = await Promise.all([
        loadAllPages(listOpeningEquipmentTypes),
        loadAllPages(listOpeningEquipmentBrands),
      ]);
      setEquipmentTypes(types);
      setEquipmentBrands(brands);
      if (types.length === 0 || brands.length === 0) {
        setEquipmentCatalogError("Não há tipos ou marcas disponíveis no catálogo para informar um novo equipamento.");
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setEquipmentCatalogError("Sua sessão expirou. Entre novamente para carregar tipos e marcas.");
      } else if (reason instanceof ApiError && reason.status === 403) {
        setEquipmentCatalogError("Você não tem permissão para consultar tipos e marcas na abertura da OS.");
      } else {
        setEquipmentCatalogError("Não foi possível carregar tipos e marcas de equipamento. Tente novamente.");
      }
    } finally {
      setLoadingEquipmentCatalogs(false);
    }
  }

  function chooseEquipmentMode(mode: "existing" | "new") {
    if (mode === "new" && !canCreateEquipment) return;
    setEquipmentMode(mode);
    setSelectedEquipment(null);
    setEquipmentSearch("");
    setEquipments([]);
    setEquipmentListLoaded(false);
    setEquipmentSearchError(null);
    setEquipmentSaveError(null);
    setEquipmentSaveNotice(null);
    setEquipmentDraftError(null);
    setEquipmentDraftNotice(null);
    dellLookupSequence.current += 1;
    setDellLookupResult(null);
    setDellLookupMessage(null);
    setEditingEquipment(true);
    if (mode === "new") {
      const savedDraft = opening?.equipmentDraft ?? null;
      setEquipmentDraftForm(hasValidEquipmentDraft(savedDraft) ? savedDraft : emptyEquipmentDraft);
      if (equipmentTypes.length === 0 || equipmentBrands.length === 0) void loadEquipmentCatalogs();
    } else {
      setEquipmentDraftForm(emptyEquipmentDraft);
    }
  }

  async function saveEquipmentDraft() {
    if (!opening || savingEquipmentDraft || !canCreateEquipment) return;
    const draft: OpeningEquipmentDraft = {
      typePublicId: equipmentDraftForm.typePublicId,
      brandPublicId: equipmentDraftForm.brandPublicId,
      model: equipmentDraftForm.model.trim(),
      serialIdentificationStatus: equipmentDraftForm.serialIdentificationStatus,
      serialNumber: equipmentDraftForm.serialIdentificationStatus === "NOT_IDENTIFIED"
        ? null
        : equipmentDraftForm.serialNumber?.trim() ?? "",
    };
    if (!hasValidEquipmentDraft(draft)) return;

    setSavingEquipmentDraft(true);
    setEquipmentDraftError(null);
    setEquipmentDraftNotice(null);
    try {
      const result = await updateServiceOrderOpeningEquipmentDraft(opening.publicId, draft, csrfToken);
      setOpening(result.data);
      setEquipmentDraftForm(draft);
      setEquipmentMode("new");
      setSelectedEquipment(null);
      setEditingEquipment(false);
      setEquipmentDraftNotice("Novo equipamento salvo como rascunho da abertura.");
    } catch (reason) {
      setEquipmentDraftError(saveEquipmentDraftErrorMessage(reason));
    } finally {
      setSavingEquipmentDraft(false);
    }
  }

  async function consultDellModel() {
    const serial = equipmentDraftForm.serialNumber?.trim() ?? "";
    if (lookingUpDell || !serial) return;
    const sequence = ++dellLookupSequence.current;
    setLookingUpDell(true);
    setDellLookupResult(null);
    setDellLookupMessage(null);
    try {
      const result = await lookupDellModel(serial, csrfToken);
      if (sequence === dellLookupSequence.current) {
        if (result.success) setDellLookupResult({ model: result.model, serviceTag: result.serviceTag });
        else setDellLookupMessage(result.message);
      }
    } catch (reason) {
      if (sequence === dellLookupSequence.current) {
        setDellLookupMessage(reason instanceof ApiError && reason.status === 401
          ? "Sua sessão expirou. Entre novamente para consultar a Dell."
          : "Não foi possível consultar o modelo Dell. Preencha o modelo manualmente.");
      }
    } finally {
      setLookingUpDell(false);
    }
  }

  async function cancelOpening() {
    if (!opening || canceling || confirming || savingEquipment || savingOwnershipDecision || savingEquipmentDraft) return;
    setCanceling(true);
    setError(null);
    setCanceledTransferWasPending(opening.transferRequested);
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
  const waitingForCustomerChange = Boolean(
    opening?.customerPublicId && editingCustomer && selectedCustomer && selectedCustomer.publicId !== opening.customerPublicId,
  );
  const ownershipTargetCustomer = waitingForCustomerChange && selectedCustomer
    ? selectedCustomer
    : linkedCustomer;
  const ownershipCandidate = waitingForCustomerChange && opening?.equipmentPublicId && opening.equipment?.publicId === opening.equipmentPublicId
    ? opening.equipment
    : selectedEquipment && ownershipTargetCustomer && selectedEquipment.owner.publicId !== ownershipTargetCustomer.publicId
      ? selectedEquipment
      : null;
  const ownershipMismatch = Boolean(
    ownershipCandidate && ownershipTargetCustomer && ownershipCandidate.owner.publicId !== ownershipTargetCustomer.publicId,
  );
  const savedTransferIsConsistent = Boolean(
    opening?.transferRequested
    && opening.equipment
    && opening.customer
    && opening.equipment.owner.publicId !== opening.customer.publicId,
  );
  const savedTransferOwner = opening?.transferRequested && savedTransferIsConsistent ? opening.equipment?.owner.name : null;
  const savedTransferCustomer = opening?.transferRequested && savedTransferIsConsistent ? opening.customer?.name : null;
  const canConfirm = Boolean(
    opening?.status === "IN_PROGRESS"
    && opening.customerPublicId
    && ((opening.equipmentPublicId
      && opening.equipment?.publicId === opening.equipmentPublicId
      && opening.equipment.owner.publicId === opening.customerPublicId)
      || (opening.equipmentPublicId
        && opening.equipment?.publicId === opening.equipmentPublicId
        && opening.transferRequested
        && savedTransferIsConsistent
        && canTransferEquipmentOwnership)
      || (hasValidEquipmentDraft(opening.equipmentDraft) && canCreateEquipment))
    && !editingCustomer
    && !editingEquipment
    && !savingCustomer
    && !savingEquipment
    && !savingOwnershipDecision
    && !savingEquipmentDraft
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
                    <button className="button button--primary" type="button" onClick={() => void saveCustomer()} disabled={savingCustomer || ownershipMismatch || selectedCustomer.publicId === opening.customerPublicId}>
                      {savingCustomer ? "Salvando…" : ownershipMismatch ? "Decida a titularidade abaixo" : "Salvar cliente"}
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
                <p>Selecione um equipamento existente ou informe um novo para manter como rascunho nesta abertura.</p>
              </div>
            </div>

            {!opening.customerPublicId && (
              <p className="muted" role="status">Selecione e salve um cliente antes de escolher o equipamento.</p>
            )}
            {waitingForCustomerChange && (
              <p className="muted" role="status">Salve a alteração do cliente antes de selecionar o equipamento.</p>
            )}

            {ownershipMismatch && ownershipCandidate && ownershipTargetCustomer && (
              <section className="opening-equipment__ownership-decision" aria-labelledby="ownership-decision-title" aria-busy={savingOwnershipDecision}>
                <h3 id="ownership-decision-title">Decida a titularidade do equipamento</h3>
                <p>Cliente selecionado na abertura: <strong>{ownershipTargetCustomer.name}</strong></p>
                <p>Proprietário atual do equipamento: <strong>{ownershipCandidate.owner.name}</strong></p>
                <p>Equipamento: <strong>{ownershipCandidate.type.name} · {ownershipCandidate.brand.name} · {ownershipCandidate.model}</strong></p>
                <div className="opening-equipment__ownership-options" role="group" aria-label="Decisões de titularidade">
                  <button className="button button--secondary" type="button" onClick={() => void saveOwnershipDecision("CANCEL_SELECTION")} disabled={savingOwnershipDecision}>
                    Cancelar seleção
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => void saveOwnershipDecision("USE_CURRENT_OWNER")} disabled={savingOwnershipDecision}>
                    Abrir OS para o proprietário atual
                  </button>
                  <button className="button button--primary" type="button" onClick={() => void saveOwnershipDecision("TRANSFER_TO_CUSTOMER")} disabled={savingOwnershipDecision || !canTransferEquipmentOwnership}>
                    {savingOwnershipDecision ? "Salvando decisão…" : "Transferir para cliente selecionado"}
                  </button>
                </div>
                {!canTransferEquipmentOwnership && <p className="form-message form-message--error" role="status">Você não tem permissão para transferir a titularidade deste equipamento.</p>}
                <p className="muted">O PATCH registra a escolha. Ele não altera a titularidade do equipamento.</p>
              </section>
            )}

            {savedTransferIsConsistent && savedTransferOwner && savedTransferCustomer && !editingEquipment && !waitingForCustomerChange && (
              <div className="opening-warning opening-equipment__transfer-pending" role="status">
                Transferência pendente: o equipamento ainda pertence a {savedTransferOwner}. A titularidade só será alterada para {savedTransferCustomer} quando a OS for confirmada.
                {!canTransferEquipmentOwnership && <span> Sua permissão de transferência não está disponível nesta sessão; a confirmação ficará bloqueada.</span>}
              </div>
            )}
            {opening.transferRequested && editingEquipment && (
              <p className="muted" role="status">A intenção salva permanece até que uma nova seleção ou um rascunho seja gravado, ou uma decisão de titularidade seja tomada. Alterações ainda não salvas não podem ser confirmadas.</p>
            )}

            {opening.equipmentDraft && !editingEquipment && hasValidEquipmentDraft(opening.equipmentDraft) && (
              <div className="opening-customer__current" aria-label="Novo equipamento da abertura">
                <strong>Novo equipamento da abertura</strong>
                <span>Tipo: {equipmentTypes.find((item) => item.publicId === opening.equipmentDraft?.typePublicId)?.name ?? "Tipo selecionado"}</span>
                <span>Marca: {equipmentBrands.find((item) => item.publicId === opening.equipmentDraft?.brandPublicId)?.name ?? "Marca selecionada"}</span>
                <span>Modelo: {opening.equipmentDraft.model}</span>
                <span>{opening.equipmentDraft.serialIdentificationStatus === "NOT_IDENTIFIED" || opening.equipmentDraft.serialNumber === null
                  ? "Número de série não identificado"
                  : `Série: ${opening.equipmentDraft.serialNumber}`}</span>
                <p className="opening-warning">Este equipamento ainda não foi criado no cadastro. Ele será criado definitivamente apenas quando a OS for confirmada.</p>
                {canCreateEquipment
                  ? <button className="text-button" type="button" onClick={() => chooseEquipmentMode("new")}>Editar equipamento da abertura</button>
                  : <p className="muted" role="status">A edição deste rascunho exige a permissão equipment.create.</p>}
              </div>
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
                <div className="opening-equipment__mode" role="group" aria-label="Tipo de equipamento para abertura">
                  <button type="button" className={equipmentMode === "existing" ? "button button--secondary" : "text-button"} aria-pressed={equipmentMode === "existing"} onClick={() => chooseEquipmentMode("existing")}>
                    Equipamento existente
                  </button>
                  {canCreateEquipment && (
                    <button type="button" className={equipmentMode === "new" ? "button button--secondary" : "text-button"} aria-pressed={equipmentMode === "new"} onClick={() => chooseEquipmentMode("new")}>
                      Novo equipamento
                    </button>
                  )}
                </div>
                {!canCreateEquipment && <p className="muted" role="status">Você não tem a permissão equipment.create para informar um novo equipamento.</p>}

                {equipmentMode === "existing" && <>
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
                    <button className="button button--primary" type="button" onClick={() => void saveEquipment()} disabled={savingEquipment || ownershipMismatch || selectedEquipment.publicId === opening.equipmentPublicId}>
                      {savingEquipment ? "Salvando…" : "Salvar equipamento"}
                    </button>
                  </div>
                )}
                {equipmentSaveError && <p className="form-message form-message--error" role="alert">{equipmentSaveError}</p>}
                </>}

                {equipmentMode === "new" && canCreateEquipment && <section className="opening-equipment__draft" aria-label="Novo equipamento da abertura">
                  <p className="muted">Preencha os dados para guardar o equipamento como rascunho da abertura.</p>
                  {loadingEquipmentCatalogs && <p className="inline-state" role="status">Carregando tipos e marcas…</p>}
                  {equipmentCatalogError && <p className="form-message form-message--error" role="alert">{equipmentCatalogError}</p>}
                  <div className="opening-equipment__draft-fields">
                    <label htmlFor="opening-equipment-type">Tipo do equipamento</label>
                    <select id="opening-equipment-type" value={equipmentDraftForm.typePublicId} onChange={(event) => setEquipmentDraftForm((current) => ({ ...current, typePublicId: event.target.value }))} required disabled={loadingEquipmentCatalogs || equipmentTypes.length === 0}>
                      <option value="">Selecione um tipo</option>
                      {equipmentTypes.map((item) => <option key={item.publicId} value={item.publicId}>{item.name}</option>)}
                    </select>
                    <label htmlFor="opening-equipment-brand">Marca</label>
                    <select id="opening-equipment-brand" value={equipmentDraftForm.brandPublicId} onChange={(event) => { dellLookupSequence.current += 1; setDellLookupResult(null); setDellLookupMessage(null); setEquipmentDraftForm((current) => ({ ...current, brandPublicId: event.target.value })); }} required disabled={loadingEquipmentCatalogs || equipmentBrands.length === 0}>
                      <option value="">Selecione uma marca</option>
                      {equipmentBrands.map((item) => <option key={item.publicId} value={item.publicId}>{item.name}</option>)}
                    </select>
                    {equipmentBrands.find((item) => item.publicId === equipmentDraftForm.brandPublicId)?.name.trim().toLocaleLowerCase("pt-BR") === "dell"
                      && equipmentDraftForm.serialIdentificationStatus === "IDENTIFIED" && Boolean(equipmentDraftForm.serialNumber?.trim()) && (
                      <div>
                        <button className="text-button" type="button" onClick={() => void consultDellModel()} disabled={lookingUpDell}>
                          {lookingUpDell ? "Consultando Dell…" : "Consultar modelo na Dell"}
                        </button>
                        {dellLookupMessage && <p className="form-message form-message--error" role="status">{dellLookupMessage} Você ainda pode preencher o modelo manualmente.</p>}
                        {dellLookupResult && dellLookupResult.serviceTag === equipmentDraftForm.serialNumber?.trim().toUpperCase() && <div className="form-message form-message--success" role="status">
                          <span>Modelo sugerido pela Dell: <strong>{dellLookupResult.model}</strong>.</span>
                          <button className="text-button" type="button" onClick={() => {
                            if (equipmentDraftForm.model.trim() && !window.confirm(`Substituir o modelo atual “${equipmentDraftForm.model.trim()}” por “${dellLookupResult.model}”?`)) return;
                            setEquipmentDraftForm((current) => ({ ...current, model: dellLookupResult.model }));
                            setDellLookupResult(null);
                          }}>Usar este modelo</button>
                        </div>}
                      </div>
                    )}
                    <label htmlFor="opening-equipment-model">Modelo</label>
                    <div className="opening-equipment__model-field">
                      <input id="opening-equipment-model" value={equipmentDraftForm.model} maxLength={191} required onChange={(event) => setEquipmentDraftForm((current) => ({ ...current, model: event.target.value }))} />
                      <button className="text-button" type="button" onClick={() => setEquipmentDraftForm((current) => ({ ...current, model: "NÃO INFORMADO" }))}>Usar “NÃO INFORMADO”</button>
                    </div>
                    <fieldset>
                      <legend>Número de série</legend>
                      <label><input type="radio" name="opening-serial-status" checked={equipmentDraftForm.serialIdentificationStatus === "IDENTIFIED"} onChange={() => setEquipmentDraftForm((current) => ({ ...current, serialIdentificationStatus: "IDENTIFIED", serialNumber: current.serialNumber ?? "" }))} /> Série identificada</label>
                      <label><input type="radio" name="opening-serial-status" checked={equipmentDraftForm.serialIdentificationStatus === "NOT_IDENTIFIED"} onChange={() => { dellLookupSequence.current += 1; setDellLookupResult(null); setDellLookupMessage(null); setEquipmentDraftForm((current) => ({ ...current, serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null })); }} /> Série não identificada</label>
                      {equipmentDraftForm.serialIdentificationStatus === "IDENTIFIED" && (
                        <input aria-label="Número de série" value={equipmentDraftForm.serialNumber ?? ""} maxLength={191} required onChange={(event) => { dellLookupSequence.current += 1; setDellLookupResult(null); setDellLookupMessage(null); setEquipmentDraftForm((current) => ({ ...current, serialNumber: event.target.value })); }} />
                      )}
                    </fieldset>
                  </div>
                  <p className="opening-warning">Este equipamento ainda não foi criado no cadastro. Ele será criado definitivamente apenas quando a OS for confirmada.</p>
                  <button className="button button--primary" type="button" onClick={() => void saveEquipmentDraft()} disabled={savingEquipmentDraft || loadingEquipmentCatalogs || !hasValidEquipmentDraft({ ...equipmentDraftForm, model: equipmentDraftForm.model.trim(), serialNumber: equipmentDraftForm.serialIdentificationStatus === "NOT_IDENTIFIED" ? null : equipmentDraftForm.serialNumber?.trim() ?? "" })}>
                    {savingEquipmentDraft ? "Salvando rascunho…" : "Salvar novo equipamento na abertura"}
                  </button>
                  {equipmentDraftError && <p className="form-message form-message--error" role="alert">{equipmentDraftError}</p>}
                  {equipmentDraftNotice && <p className="form-message form-message--success" role="status">{equipmentDraftNotice}</p>}
                </section>}
              </>
            )}
            {equipmentSaveNotice && <p className="form-message form-message--success" role="status">{equipmentSaveNotice}</p>}
          </section>

          <div className="opening-actions">
            {hasValidEquipmentDraft(opening.equipmentDraft) && !canCreateEquipment && <p className="form-message form-message--error" role="status">Confirmar a OS com este novo equipamento exige a permissão equipment.create.</p>}
            {canConfirmServiceOrderOpening && (
              <button className="button button--primary" type="button" onClick={() => { setConfirmationError(null); setShowConfirmation(true); }} disabled={!canConfirm}>
                Confirmar OS
              </button>
            )}
            {opening.transferRequested && <p className="muted" role="status">Cancelar esta abertura não transfere a titularidade do equipamento.</p>}
            <button className="button button--danger" type="button" onClick={() => void cancelOpening()} disabled={canceling || confirming || savingEquipment || savingOwnershipDecision || savingEquipmentDraft}>
              {canceling ? "Cancelando…" : "Cancelar abertura"}
            </button>
            <button className="text-button" type="button" onClick={onBack}>Voltar para lista</button>
          </div>
        </article>
      )}

      {canceled && !loading && (
        <article className="opening-card opening-card--canceled">
          <p className="inline-success" role="status">A abertura {canceled.visibleNumber} foi cancelada.</p>
          {canceledTransferWasPending && <p className="muted" role="status">A abertura foi cancelada sem aplicar a intenção de transferência. Essa intenção pode permanecer registrada na abertura encerrada; a titularidade do equipamento não foi alterada.</p>}
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
              {hasValidEquipmentDraft(opening.equipmentDraft) && <p>O equipamento novo será criado pelo Backend somente nesta confirmação.</p>}
              {savedTransferIsConsistent && savedTransferOwner && savedTransferCustomer && (
                <p>Ao confirmar, este equipamento será transferido de <strong>{savedTransferOwner}</strong> para <strong>{savedTransferCustomer}</strong>.</p>
              )}
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
