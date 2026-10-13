import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ServiceOrderOpeningPage } from "./ServiceOrderOpeningPage";

const opening = {
  publicId: "75811f19-8b30-45ad-84a5-7ac1bf22e768",
  visibleNumber: "OS-000132",
  numberValue: "132",
  status: "IN_PROGRESS" as const,
  initiatedByUserPublicId: "bb5a8690-9f8a-4f65-bb0a-36f8689f29a5",
  createdBy: "bb5a8690-9f8a-4f65-bb0a-36f8689f29a5",
  customerPublicId: null,
  equipmentPublicId: null,
  equipmentDraft: null,
  equipmentDraftVersion: null,
  transferRequested: false,
  transferRequestedByUserPublicId: null,
  complaint: null,
  createdAt: "2026-10-13T12:00:00.000Z",
  updatedAt: "2026-10-13T12:00:00.000Z",
};

const linkedOpening = {
  ...opening,
  customerPublicId: "customer-public-id",
  customer: { publicId: "customer-public-id", name: "Cliente Atual", documentHint: null },
};

const equipment = {
  publicId: "equipment-public-id",
  type: { publicId: "type-public-id", name: "NOTEBOOK" },
  brand: { publicId: "brand-public-id", name: "DELL" },
  model: "LATITUDE 5440",
  serialNumber: "SERIAL-001",
  serialIdentificationStatus: "IDENTIFIED" as const,
  owner: { publicId: "customer-public-id", name: "Cliente Atual" },
};

const equipmentSummary = {
  ...equipment,
  owner: { ...equipment.owner, documentHint: "***.***.***-01" },
};

const confirmableOpening = {
  ...linkedOpening,
  equipmentPublicId: equipment.publicId,
  equipment: equipmentSummary,
};

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function apiError(status: number, code: string, message: string) {
  return response({ error: { code, message } }, status);
}

describe("ServiceOrderOpeningPage", () => {
  it("não habilita confirmação sem cliente ou equipamento salvo", async () => {
    for (const value of [opening, linkedOpening]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: value })));
      const view = render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening onConfirmed={vi.fn()} onBack={vi.fn()} />);
      expect(await screen.findByText("OS-000132")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirmar OS" })).toBeDisabled();
      view.unmount();
    }
  });

  it("bloqueia confirmação quando a transferência está pendente ou o equipamento não pertence ao cliente", async () => {
    const transferred = { ...confirmableOpening, transferRequested: true };
    const wrongOwner = { ...confirmableOpening, equipment: { ...equipmentSummary, owner: { publicId: "other-customer", name: "Outro cliente" } } };
    for (const value of [transferred, wrongOwner]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: value })));
      const view = render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening onConfirmed={vi.fn()} onBack={vi.fn()} />);
      expect(await screen.findByRole("button", { name: "Confirmar OS" })).toBeDisabled();
      view.unmount();
    }
  });

  it("esconde a ação de confirmação para identidade sem permissão", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: confirmableOpening })));
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("OS-000132");
    expect(screen.queryByRole("button", { name: "Confirmar OS" })).not.toBeInTheDocument();
  });

  it("mostra o diálogo, permite voltar sem POST e confirma com CSRF e corpo vazio", async () => {
    const orderPublicId = "9f491492-4287-4e0f-9201-f642174e94cd";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: confirmableOpening }))
      .mockResolvedValueOnce(response({ data: { publicId: orderPublicId, visibleNumber: "OS-000133", macroStatus: "ABERTA", operationalSituation: "TRIAGEM" } }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening onConfirmed={onConfirmed} onBack={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Confirmar OS" }));
    const dialog = screen.getByRole("dialog", { name: "Confirmar criação da OS?" });
    expect(dialog).toHaveTextContent("ABERTA / TRIAGEM");
    expect(dialog).toHaveTextContent("OS-000132");
    expect(dialog).toHaveTextContent("snapshots do cliente e do equipamento");
    expect(dialog).toHaveTextContent("não cria orçamento, peças ou registros financeiros");
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Confirmar OS" }));
    await user.click(screen.getByRole("button", { name: "Confirmar e criar OS" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/openings/${opening.publicId}/confirm`, expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session", "Content-Type": "application/json" }),
      body: "{}",
    }));
    expect(onConfirmed).toHaveBeenCalledWith(orderPublicId);
    expect(fetchMock.mock.calls.every(([url]) => !/budget|parts|stock|finance|equipment-types|equipment-brands|resume/i.test(String(url)))).toBe(true);
  });

  it("impede duplo envio enquanto aguarda a resposta", async () => {
    let resolvePost: ((value: ReturnType<typeof response>) => void) | undefined;
    const post = new Promise<ReturnType<typeof response>>((resolve) => { resolvePost = resolve; });
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: confirmableOpening })).mockReturnValueOnce(post);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening onConfirmed={onConfirmed} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Confirmar OS" }));
    await user.click(screen.getByRole("button", { name: "Confirmar e criar OS" }));
    expect(await screen.findByRole("button", { name: "Confirmando…" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolvePost?.(response({ data: { publicId: "9f491492-4287-4e0f-9201-f642174e94cd", visibleNumber: "OS-000133", macroStatus: "ABERTA", operationalSituation: "TRIAGEM" } }, 201));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("9f491492-4287-4e0f-9201-f642174e94cd"));
  });

  it.each([
    [400, "VALIDATION_ERROR", "A confirmação da OS não foi aceita. Revise os dados da abertura."],
    [401, "UNAUTHENTICATED", "Sua sessão expirou. Faça login novamente."],
    [403, "PERMISSION_DENIED", "Você não tem permissão para confirmar esta OS ou sua sessão precisa ser renovada."],
    [404, "OPENING_NOT_FOUND", "A abertura não está mais disponível. Volte para a lista e tente novamente."],
    [409, "CUSTOMER_REQUIRED", "Selecione e salve o cliente antes de confirmar a OS."],
    [409, "EQUIPMENT_REQUIRED", "Selecione e salve o equipamento antes de confirmar a OS."],
    [409, "OPENING_NOT_IN_PROGRESS", "Esta abertura não está mais em andamento. Recarregue a tela."],
    [409, "OPENING_CONCURRENCY_CONFLICT", "O estado da abertura mudou. Recarregue antes de tentar novamente."],
    [409, "UNKNOWN_CONFLICT", "Não foi possível confirmar a OS devido ao estado atual da abertura."],
    [422, "UNPROCESSABLE_ENTITY", "A solicitação de confirmação foi rejeitada. Revise os dados da abertura."],
  ])("apresenta mensagem segura para %s %s", async (status, code, message) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: confirmableOpening }))
      .mockResolvedValueOnce(apiError(status, code, "Mensagem de servidor"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Confirmar OS" }));
    await user.click(screen.getByRole("button", { name: "Confirmar e criar OS" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("informa indisponibilidade quando a rede falha", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: confirmableOpening })).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Confirmar OS" }));
    await user.click(screen.getByRole("button", { name: "Confirmar e criar OS" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível comunicar com o servidor para confirmar a OS.");
  });

  it("consulta a abertura atual e cria uma quando não existe, com CSRF", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(response({ data: opening }, 201));
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText("OS-000132")).toBeInTheDocument();
    expect(screen.getByText("Em andamento")).toBeInTheDocument();
    expect(screen.getByText(/Esta abertura ainda não é uma OS confirmada/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/service-orders/openings/current", expect.objectContaining({ method: "GET", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/service-orders/openings", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }),
      body: "{}",
    }));
  });

  it("retoma a abertura atual sem criar outra", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: opening }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText("OS-000132")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/service-orders/openings", expect.anything());
  });

  it("exibe o resumo público do cliente ao retomar uma abertura", async () => {
    const saved = {
      ...opening,
      customerPublicId: "75f1f19d-8b30-45ad-84a5-7ac1bf22e768",
      customer: {
        publicId: "75f1f19d-8b30-45ad-84a5-7ac1bf22e768",
        name: "Cliente Retomado",
        documentHint: "***.***.***-01",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: saved })));

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText("Cliente Retomado")).toBeInTheDocument();
    expect(screen.getByText("Documento: ***.***.***-01")).toBeInTheDocument();
  });

  it("mantém fallback seguro com backend antigo que só retorna customerPublicId", async () => {
    const legacyOpening = { ...opening, customerPublicId: "customer-public-id" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: legacyOpening })));

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText(/Há um cliente vinculado a esta abertura/)).toBeInTheDocument();
    expect(screen.queryByText("customer-public-id")).not.toBeInTheDocument();
  });

  it("recupera a abertura atual se a criação concorrente responder 409", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(apiError(409, "OPENING_ALREADY_EXISTS", "Já existe uma abertura."))
      .mockResolvedValueOnce(response({ data: opening }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText("OS-000132")).toBeInTheDocument();
    expect(await screen.findByText("Já existe uma abertura de OS em andamento. Ela foi carregada para continuação.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/service-orders/openings/current",
      "/api/v1/service-orders/openings",
      "/api/v1/service-orders/openings/current",
    ]);
  });

  it("cancela com POST e CSRF, confirma o resultado e volta à lista", async () => {
    const canceled = { ...opening, status: "CANCELED" as const, numberReleased: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(response({ data: canceled }));
    vi.stubGlobal("fetch", fetchMock);
    const onBack = vi.fn();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={onBack} />);
    await screen.findByText("OS-000132");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar abertura" }));

    expect(await screen.findByText("A abertura OS-000132 foi cancelada.")).toBeInTheDocument();
    expect(screen.getByText("O número reservado foi liberado.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/service-orders/openings/${opening.publicId}/cancel`, expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }),
      body: "{}",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Voltar para lista de OS" }));
    expect(onBack).toHaveBeenCalledOnce();
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((url) => /\/confirm(?:\?|$)/.test(url))).toBe(false);
    expect(fetchMock.mock.calls.some(([, options]) => options.method === "PATCH")).toBe(false);
    expect(calledUrls.every((url) => !url.includes("/service-orders/openings/") || url.endsWith("/current") || url.endsWith("/cancel"))).toBe(true);
    expect(calledUrls.some((url) => /\/people\/customers|\/equipment\/opening-search|\/equipment-types|\/equipment-brands/.test(url))).toBe(false);
  });

  it("trata 401 sem tentar criar abertura", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiError(401, "UNAUTHORIZED", "Unauthorized")));
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sua sessão expirou");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem definida para 403 ao tentar criar", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(apiError(403, "PERMISSION_DENIED", "Forbidden"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para iniciar ou cancelar abertura de OS.");
  });

  it("trata 404 ao cancelar sem abandonar a abertura", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("OS-000132");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar abertura" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A abertura de OS não foi encontrada.");
    expect(screen.getByText("OS-000132")).toBeInTheDocument();
  });

  it.each([400, 422])("apresenta orientação segura para erro de validação HTTP %s", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(apiError(status, "VALIDATION_ERROR", "Invalid request"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("A solicitação não foi aceita");
  });

  it("mantém a abertura e orienta atualizar quando o cancelamento conflita", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(apiError(409, "OPENING_NOT_IN_PROGRESS", "A abertura não está em andamento."));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("OS-000132");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar abertura" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A abertura mudou de estado");
    expect(screen.getByText("OS-000132")).toBeInTheDocument();
  });

  it("busca clientes com paginação e pesquisa e salva o cliente com CSRF", async () => {
    const customer = {
      publicId: "75f1f19d-8b30-45ad-84a5-7ac1bf22e768",
      personType: "PJ",
      name: "NoteDuke Cliente de Teste",
      documentHint: "**.***.***/****-12",
    };
    const savedOpening = {
      ...opening,
      customerPublicId: customer.publicId,
      customer: { publicId: customer.publicId, name: customer.name, documentHint: customer.documentHint },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(response({ data: [customer], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedOpening }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Cliente")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar cliente por nome, documento ou telefone"), "NoteDuke");
    await user.click(screen.getByRole("button", { name: "Buscar clientes" }));

    expect(await screen.findByRole("button", { name: /NoteDuke Cliente de Teste/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/people/customers?page=1&pageSize=20&search=NoteDuke", expect.objectContaining({
      method: "GET",
      credentials: "include",
    }));

    await user.click(screen.getByRole("button", { name: /NoteDuke Cliente de Teste/ }));
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    expect((await screen.findAllByText("NoteDuke Cliente de Teste")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Documento: \*\*\.\*\*\*\.\*\*\*\/\*\*\*\*-12/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }),
      body: JSON.stringify({ customerPublicId: customer.publicId }),
    }));
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((url) => /\/confirm(?:\?|$)/.test(url))).toBe(false);
    expect(calledUrls.some((url) => /\/equipment\/opening-search|\/equipment-types|\/equipment-brands/.test(url))).toBe(false);
  });

  it("permite trocar o cliente salvo enquanto a abertura continua em andamento", async () => {
    const existing = { publicId: "75f1f19d-8b30-45ad-84a5-7ac1bf22e768", personType: "PF", name: "Cliente Atual", documentHint: null };
    const replacement = { publicId: "3e45c65d-8b30-45ad-84a5-7ac1bf22e768", personType: "PJ", name: "Cliente Novo", documentHint: null };
    const savedOpening = {
      ...opening,
      customerPublicId: existing.publicId,
      customer: { publicId: existing.publicId, name: existing.name, documentHint: "***.***.***-42" },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: savedOpening }))
      .mockResolvedValueOnce(response({ data: [replacement], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: {
        ...opening,
        customerPublicId: replacement.publicId,
        customer: { publicId: replacement.publicId, name: replacement.name, documentHint: replacement.documentHint },
      } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Cliente Atual")).toBeInTheDocument();
    expect(screen.getByText("Documento: ***.***.***-42")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Trocar cliente" }));
    await user.type(screen.getByLabelText("Buscar cliente por nome, documento ou telefone"), "Novo");
    await user.click(screen.getByRole("button", { name: "Buscar clientes" }));
    await user.click(await screen.findByRole("button", { name: /Cliente Novo/ }));
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    expect((await screen.findAllByText("Cliente Novo")).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ customerPublicId: replacement.publicId }),
    }));
  });

  it("exibe a mensagem de permissão quando a busca de clientes retorna 403", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(apiError(403, "PERMISSION_DENIED", "Forbidden"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente");
    await user.click(screen.getByRole("button", { name: "Buscar clientes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para pesquisar clientes");
  });

  it.each([400, 422])("explica que o cliente não pôde ser vinculado quando o PATCH retorna %s", async (status) => {
    const customer = { publicId: "75f1f19d-8b30-45ad-84a5-7ac1bf22e768", personType: "PF", name: "Cliente Inválido", documentHint: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(response({ data: [customer], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(apiError(status, "VALIDATION_ERROR", "Pessoa não elegível"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente");
    await user.click(screen.getByRole("button", { name: "Buscar clientes" }));
    await user.click(await screen.findByRole("button", { name: /Cliente Inválido/ }));
    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível vincular este cliente à abertura da OS.");
  });

  it("não expõe publicId em destaque nem chama endpoints fora da seleção de cliente", async () => {
    const selected = { publicId: "75f1f19d-8b30-45ad-84a5-7ac1bf22e768", personType: "PF", name: "Cliente Selecionado", documentHint: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(response({ data: [selected], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente");
    await user.click(screen.getByRole("button", { name: "Buscar clientes" }));
    await user.click(await screen.findByRole("button", { name: /Cliente Selecionado/ }));

    expect(screen.getAllByText("Cliente Selecionado").length).toBeGreaterThan(0);
    expect(screen.queryByText(selected.publicId)).not.toBeInTheDocument();
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.every((url) => url.includes("/api/v1/service-orders/openings/current") || url.includes("/api/v1/people/customers"))).toBe(true);
    expect(calledUrls.some((url) => /\/equipment\/opening-search|\/equipment-types|\/equipment-brands|\/confirm(?:\?|$)/.test(url))).toBe(false);
  });

  it("orienta selecionar e salvar cliente antes de pesquisar equipamento", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: opening })));
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Equipamento" })).toBeInTheDocument();
    expect(screen.getByText("Selecione e salve um cliente antes de escolher o equipamento.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buscar equipamentos" })).not.toBeInTheDocument();
  });

  it("pesquisa equipamento com paginação e busca, mostra dados seguros e salva o publicId com CSRF", async () => {
    const savedOpening = { ...linkedOpening, equipmentPublicId: equipment.publicId, equipment: equipmentSummary };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [equipment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedOpening }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.type(screen.getByLabelText("Buscar equipamento por modelo, série, tipo, marca ou proprietário"), "latitude");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));

    expect(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ })).toBeInTheDocument();
    expect(screen.getByText("Série: SERIAL-001")).toBeInTheDocument();
    expect(screen.getByText("Proprietário atual: Cliente Atual")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/equipment/opening-search?page=1&pageSize=20&search=latitude", expect.objectContaining({
      method: "GET",
      credentials: "include",
    }));

    await user.click(screen.getByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));
    await user.click(screen.getByRole("button", { name: "Salvar equipamento" }));

    expect(await screen.findByText("Equipamento salvo na abertura em andamento.")).toBeInTheDocument();
    expect(screen.getByText(/NOTEBOOK · DELL · LATITUDE 5440/)).toBeInTheDocument();
    expect(screen.getByText("Documento do proprietário: ***.***.***-01")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }),
      body: JSON.stringify({ equipmentPublicId: equipment.publicId }),
    }));
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((url) => /\/equipment-types|\/equipment-brands|\/confirm(?:\?|$)/.test(url))).toBe(false);
    expect(calledUrls.every((url) => !url.includes("/service-orders") || !url.endsWith("/confirm"))).toBe(true);
  });

  it("exibe série não identificada quando a API informa serial nulo", async () => {
    const unidentified = { ...equipment, serialNumber: null, serialIdentificationStatus: "NOT_IDENTIFIED" as const };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [unidentified], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));

    expect(screen.getAllByText("Número de série não identificado").length).toBeGreaterThan(0);
  });

  it("impede salvar equipamento de outro titular e explica que transferência ficará para depois", async () => {
    const otherOwnerEquipment = {
      ...equipment,
      owner: { publicId: "other-customer-public-id", name: "Outro Cliente" },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [otherOwnerEquipment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));

    expect(screen.getAllByText("Proprietário atual: Outro Cliente")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Este equipamento está vinculado a outro cliente. A transferência de titularidade será tratada em uma etapa posterior.");
    expect(screen.getByRole("button", { name: "Salvar equipamento" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exibe mensagem de permissão quando a busca de equipamentos retorna 403", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(apiError(403, "PERMISSION_DENIED", "Forbidden"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para pesquisar equipamentos para a abertura da OS.");
  });

  it.each([400, 422])("mostra mensagem segura quando o PATCH de equipamento retorna %s", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [equipment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(apiError(status, "VALIDATION_ERROR", "Equipamento inválido"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));
    await user.click(screen.getByRole("button", { name: "Salvar equipamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível vincular este equipamento à abertura da OS.");
  });

  it("permite trocar equipamento vinculado e mostra aviso genérico ao retomar sem resumo público", async () => {
    const currentWithEquipment = { ...linkedOpening, equipmentPublicId: "saved-equipment-public-id" };
    const replacement = { ...equipment, publicId: "replacement-equipment-public-id", model: "LATITUDE 5450" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: currentWithEquipment }))
      .mockResolvedValueOnce(response({ data: [replacement], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: { ...currentWithEquipment, equipmentPublicId: replacement.publicId } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Há um equipamento vinculado a esta abertura. O resumo não é retornado pela API de retomada.")).toBeInTheDocument();
    expect(screen.queryByText("saved-equipment-public-id")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Trocar equipamento" }));
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5450/ }));
    await user.click(screen.getByRole("button", { name: "Salvar equipamento" }));

    expect(await screen.findByText("Equipamento salvo na abertura em andamento.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ equipmentPublicId: replacement.publicId }),
    }));
  });

  it("exibe o resumo público do equipamento ao retomar uma abertura salva", async () => {
    const currentWithEquipment = {
      ...linkedOpening,
      equipmentPublicId: equipmentSummary.publicId,
      equipment: equipmentSummary,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: currentWithEquipment })));

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText(/NOTEBOOK · DELL · LATITUDE 5440/)).toBeInTheDocument();
    expect(screen.getByText("Série: SERIAL-001")).toBeInTheDocument();
    expect(screen.getByText("Proprietário atual: Cliente Atual")).toBeInTheDocument();
    expect(screen.getByText("Documento do proprietário: ***.***.***-01")).toBeInTheDocument();
    expect(screen.queryByText(equipmentSummary.publicId)).not.toBeInTheDocument();
  });

  it("não chama tipos, marcas ou confirmação durante a busca e seleção", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [equipment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));

    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls).toContain("/api/v1/equipment/opening-search?page=1&pageSize=20");
    expect(calledUrls.some((url) => /\/equipment-types|\/equipment-brands|\/confirm(?:\?|$)/.test(url))).toBe(false);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "PATCH" || String(options.method).startsWith("POST")).length).toBe(0);
  });

  it("mostra Novo equipamento somente com equipment.create e explica a permissão ausente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ data: linkedOpening })));
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canConfirmServiceOrderOpening={false} onConfirmed={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    expect(screen.queryByRole("button", { name: "Novo equipamento" })).not.toBeInTheDocument();
    expect(screen.getByText(/permissão equipment\.create/)).toBeInTheDocument();
  });

  it("carrega os catálogos, salva rascunho identificado por PATCH com CSRF e não cria equipamento", async () => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "DELL" };
    const draft = { typePublicId: type.publicId, brandPublicId: brand.publicId, model: "LATITUDE 5450", serialIdentificationStatus: "IDENTIFIED", serialNumber: "SERIAL-5450" };
    const savedOpening = { ...linkedOpening, equipmentPublicId: null, equipment: null, equipmentDraft: draft, equipmentDraftVersion: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedOpening }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    expect(await screen.findByRole("option", { name: "NOTEBOOK" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "DELL" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/equipment-types?page=1&pageSize=100", expect.objectContaining({ method: "GET", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/equipment-brands?page=1&pageSize=100", expect.objectContaining({ method: "GET", credentials: "include" }));
    await user.selectOptions(screen.getByLabelText("Tipo do equipamento"), type.publicId);
    await user.selectOptions(screen.getByLabelText("Marca"), brand.publicId);
    await user.type(screen.getByLabelText("Modelo"), "LATITUDE 5450");
    await user.type(screen.getByLabelText("Número de série"), "SERIAL-5450");
    await user.click(screen.getByRole("button", { name: "Salvar novo equipamento na abertura" }));

    expect(await screen.findByText("Novo equipamento da abertura")).toBeInTheDocument();
    expect(screen.getByText("Este equipamento ainda não foi criado no cadastro. Ele será criado definitivamente apenas quando a OS for confirmada.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(4, `/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session", "Content-Type": "application/json" }),
      body: JSON.stringify({ equipmentDraft: draft }),
    }));
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.every((url) => !/\/equipment(?:\?|$)|\/equipment-types(?:\/|\?|$)|\/equipment-brands(?:\/|\?|$)/.test(url) || /^(?:\/api\/v1\/equipment-types|\/api\/v1\/equipment-brands)/.test(url))).toBe(true);
  });

  it("envia serialNumber nulo quando a série é marcada como não identificada", async () => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "NÃO INFORMADA" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: { ...linkedOpening, equipmentPublicId: null, equipment: null, equipmentDraft: { typePublicId: type.publicId, brandPublicId: brand.publicId, model: "NÃO INFORMADO", serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null }, equipmentDraftVersion: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    await screen.findByRole("option", { name: "NOTEBOOK" });
    await user.selectOptions(screen.getByLabelText("Tipo do equipamento"), type.publicId);
    await user.selectOptions(screen.getByLabelText("Marca"), brand.publicId);
    await user.click(screen.getByRole("button", { name: "Usar “NÃO INFORMADO”" }));
    await user.click(screen.getByLabelText("Série não identificada"));
    expect(screen.queryByLabelText("Número de série")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar novo equipamento na abertura" }));
    await screen.findByText("Novo equipamento da abertura");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ equipmentDraft: { typePublicId: type.publicId, brandPublicId: brand.publicId, model: "NÃO INFORMADO", serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null } }),
    }));
  });

  it("habilita confirmação com cliente e rascunho salvo; confirmação delega criação ao Backend", async () => {
    const draft = { typePublicId: "type-public-id", brandPublicId: "brand-public-id", model: "LATITUDE", serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null };
    const savedOpening = { ...linkedOpening, equipmentDraft: draft, equipmentDraftVersion: 1 };
    const orderPublicId = "9f491492-4287-4e0f-9201-f642174e94cd";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [{ publicId: draft.typePublicId, name: "NOTEBOOK" }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [{ publicId: draft.brandPublicId, name: "DELL" }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedOpening }))
      .mockResolvedValueOnce(response({ data: { publicId: orderPublicId, visibleNumber: "OS-000133", macroStatus: "ABERTA", operationalSituation: "TRIAGEM" } }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment canConfirmServiceOrderOpening onConfirmed={onConfirmed} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    await screen.findByRole("option", { name: "NOTEBOOK" });
    await user.selectOptions(screen.getByLabelText("Tipo do equipamento"), draft.typePublicId);
    await user.selectOptions(screen.getByLabelText("Marca"), draft.brandPublicId);
    await user.type(screen.getByLabelText("Modelo"), draft.model);
    await user.click(screen.getByLabelText("Série não identificada"));
    await user.click(screen.getByRole("button", { name: "Salvar novo equipamento na abertura" }));
    await screen.findByText("Novo equipamento da abertura");
    expect(screen.getByRole("button", { name: "Confirmar OS" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Confirmar OS" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("O equipamento novo será criado pelo Backend somente nesta confirmação.");
    await user.click(screen.getByRole("button", { name: "Confirmar e criar OS" }));

    expect(onConfirmed).toHaveBeenCalledWith(orderPublicId);
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/openings/${opening.publicId}/confirm`, expect.objectContaining({ method: "POST", body: "{}", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }) }));
    expect(fetchMock.mock.calls.some(([url]) => /\/equipment(?:\?|$)|\/equipment-types\/|\/equipment-brands\//.test(String(url)))).toBe(false);
  });

  it("cancelar uma abertura com rascunho não chama criação direta de equipamento nem confirmação", async () => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "DELL" };
    const draft = { typePublicId: type.publicId, brandPublicId: brand.publicId, model: "LATITUDE", serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null };
    const savedOpening = { ...linkedOpening, equipmentDraft: draft, equipmentDraftVersion: 1 };
    const canceled = { ...savedOpening, status: "CANCELED", numberReleased: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedOpening }))
      .mockResolvedValueOnce(response({ data: canceled }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    await screen.findByRole("option", { name: "NOTEBOOK" });
    await user.selectOptions(screen.getByLabelText("Tipo do equipamento"), type.publicId);
    await user.selectOptions(screen.getByLabelText("Marca"), brand.publicId);
    await user.type(screen.getByLabelText("Modelo"), draft.model);
    await user.click(screen.getByLabelText("Série não identificada"));
    await user.click(screen.getByRole("button", { name: "Salvar novo equipamento na abertura" }));
    await screen.findByText("Novo equipamento da abertura");
    await user.click(screen.getByRole("button", { name: "Cancelar abertura" }));
    expect(await screen.findByText("A abertura OS-000132 foi cancelada.")).toBeInTheDocument();
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((url) => /\/confirm(?:\?|$)|\/equipment(?:\?|$)/.test(url))).toBe(false);
  });

  it("trocar para novo equipamento limpa uma seleção existente não salva", async () => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "DELL" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [equipment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));
    expect(screen.getByText(/Equipamento selecionado:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    await screen.findByRole("option", { name: "NOTEBOOK" });
    expect(screen.queryByText(/Equipamento selecionado:/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "PATCH")).toHaveLength(0);
  });

  it("trocar para equipamento existente substitui e limpa o rascunho salvo", async () => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "DELL" };
    const draft = { typePublicId: type.publicId, brandPublicId: brand.publicId, model: "LATITUDE", serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null };
    const savedDraftOpening = { ...linkedOpening, equipmentDraft: draft, equipmentDraftVersion: 1 };
    const savedExistingOpening = { ...linkedOpening, equipmentPublicId: equipment.publicId, equipment: equipmentSummary, equipmentDraft: null, equipmentDraftVersion: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: savedDraftOpening }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [equipment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedExistingOpening }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Novo equipamento da abertura");
    await user.click(screen.getByRole("button", { name: "Editar equipamento da abertura" }));
    await user.click(screen.getByRole("button", { name: "Equipamento existente" }));
    await user.click(screen.getByRole("button", { name: "Buscar equipamentos" }));
    await user.click(await screen.findByRole("button", { name: /NOTEBOOK · DELL · LATITUDE 5440/ }));
    await user.click(screen.getByRole("button", { name: "Salvar equipamento" }));
    expect(await screen.findByText("Equipamento salvo na abertura em andamento.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/openings/${opening.publicId}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ equipmentPublicId: equipment.publicId }),
    }));
    expect(screen.queryByText("Novo equipamento da abertura")).not.toBeInTheDocument();
  });

  it.each([
    [400, "Os dados do novo equipamento são inválidos."],
    [422, "Os dados do novo equipamento são inválidos."],
    [401, "Sua sessão expirou."],
    [403, "Você não tem permissão para criar equipamento ou alterar esta abertura."],
    [404, "A abertura não foi encontrada."],
    [409, "A abertura mudou de estado."],
  ])("apresenta orientação segura quando salvar rascunho retorna %s", async (status, expectedMessage) => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "DELL" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(apiError(status, "VALIDATION_ERROR", "Não exibir erro interno"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    await screen.findByRole("option", { name: "NOTEBOOK" });
    await user.selectOptions(screen.getByLabelText("Tipo do equipamento"), type.publicId);
    await user.selectOptions(screen.getByLabelText("Marca"), brand.publicId);
    await user.type(screen.getByLabelText("Modelo"), "LATITUDE");
    await user.click(screen.getByLabelText("Série não identificada"));
    await user.click(screen.getByRole("button", { name: "Salvar novo equipamento na abertura" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expectedMessage);
    expect(screen.getByRole("alert")).not.toHaveTextContent("Não exibir erro interno");
  });

  it("apresenta mensagem segura quando a rede falha ao salvar rascunho", async () => {
    const type = { publicId: "type-public-id", name: "NOTEBOOK" };
    const brand = { publicId: "brand-public-id", name: "DELL" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: linkedOpening }))
      .mockResolvedValueOnce(response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" canCreateEquipment onConfirmed={vi.fn()} canConfirmServiceOrderOpening={false} onBack={vi.fn()} />);
    await screen.findByText("Cliente Atual");
    await user.click(screen.getByRole("button", { name: "Novo equipamento" }));
    await screen.findByRole("option", { name: "NOTEBOOK" });
    await user.selectOptions(screen.getByLabelText("Tipo do equipamento"), type.publicId);
    await user.selectOptions(screen.getByLabelText("Marca"), brand.publicId);
    await user.type(screen.getByLabelText("Modelo"), "LATITUDE");
    await user.click(screen.getByLabelText("Série não identificada"));
    await user.click(screen.getByRole("button", { name: "Salvar novo equipamento na abertura" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar o novo equipamento na abertura.");
  });
});
