import { fireEvent, render, screen } from "@testing-library/react";
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

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function apiError(status: number, code: string, message: string) {
  return response({ error: { code, message } }, status);
}

describe("ServiceOrderOpeningPage", () => {
  it("consulta a abertura atual e cria uma quando não existe, com CSRF", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(response({ data: opening }, 201));
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);

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

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);

    expect(await screen.findByText("OS-000132")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/service-orders/openings", expect.anything());
  });

  it("recupera a abertura atual se a criação concorrente responder 409", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(apiError(409, "OPENING_ALREADY_EXISTS", "Já existe uma abertura."))
      .mockResolvedValueOnce(response({ data: opening }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);

    expect(await screen.findByText("OS-000132")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Já existe uma abertura de OS em andamento");
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

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={onBack} />);
    await screen.findByText("OS-000132");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar abertura" }));

    expect(await screen.findByRole("status")).toHaveTextContent("A abertura OS-000132 foi cancelada.");
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
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sua sessão expirou");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem definida para 403 ao tentar criar", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."))
      .mockResolvedValueOnce(apiError(403, "PERMISSION_DENIED", "Forbidden"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para iniciar ou cancelar abertura de OS.");
  });

  it("trata 404 ao cancelar sem abandonar a abertura", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(apiError(404, "OPENING_NOT_FOUND", "Abertura não encontrada."));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
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
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("A solicitação não foi aceita");
  });

  it("mantém a abertura e orienta atualizar quando o cancelamento conflita", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(apiError(409, "OPENING_NOT_IN_PROGRESS", "A abertura não está em andamento."));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
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
    const savedOpening = { ...opening, customerPublicId: customer.publicId };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: opening }))
      .mockResolvedValueOnce(response({ data: [customer], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: savedOpening }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
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
    const savedOpening = { ...opening, customerPublicId: existing.publicId };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: savedOpening }))
      .mockResolvedValueOnce(response({ data: [replacement], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response({ data: { ...opening, customerPublicId: replacement.publicId } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
    expect(await screen.findByText(/Há um cliente vinculado/)).toBeInTheDocument();
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

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
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

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
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

    render(<ServiceOrderOpeningPage csrfToken="csrf-session" onBack={vi.fn()} />);
    await screen.findByText("Cliente");
    await user.click(screen.getByRole("button", { name: "Buscar clientes" }));
    await user.click(await screen.findByRole("button", { name: /Cliente Selecionado/ }));

    expect(screen.getAllByText("Cliente Selecionado").length).toBeGreaterThan(0);
    expect(screen.queryByText(selected.publicId)).not.toBeInTheDocument();
    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.every((url) => url.includes("/api/v1/service-orders/openings/current") || url.includes("/api/v1/people/customers"))).toBe(true);
    expect(calledUrls.some((url) => /\/equipment\/opening-search|\/equipment-types|\/equipment-brands|\/confirm(?:\?|$)/.test(url))).toBe(false);
  });
});
