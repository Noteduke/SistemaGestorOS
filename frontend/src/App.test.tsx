import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { App } from "./App";

it("restringe a tela de Serviços a Administrador ou services.manage", async () => {
  window.location.hash = "#/services";
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "usuario.teste",
    isAdmin: false,
    permissions: [],
    csrfToken: "csrf-session",
    session: { expiresAt: "2026-10-20T20:00:00.000Z" },
  };
  const fetchMock = vi.fn().mockResolvedValue(response({ data: identity }));
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);
  expect(await screen.findByText("Você não tem permissão para administrar Serviços.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Serviços" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object));
});

it("restringe o Cadastro de Produtos a Administrador ou products.manage", async () => {
  window.location.hash = "#/products";
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "usuario.teste",
    isAdmin: false,
    permissions: [],
    csrfToken: "csrf-session",
    session: { expiresAt: "2026-10-20T20:00:00.000Z" },
  };
  const fetchMock = vi.fn().mockResolvedValue(response({ data: identity }));
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);
  expect(await screen.findByText("Você não tem permissão para administrar Produtos.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Produtos" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object));
});

const order = {
  publicId: "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910",
  openingPublicId: "a542fc64-f29a-4ba1-859e-0af1462d8435",
  visibleNumber: "OS-000128",
  numberValue: "128",
  macroStatus: "ABERTA",
  operationalSituation: "TRIAGEM",
  customer: { publicId: "d7d60964-4c5d-4d4e-9362-c56c2c08b4cf", name: "Marina Costa" },
  equipment: { publicId: "a23a7f29-8a4c-4704-9ce4-593c3ba013a0", type: "Notebook", brand: "Lenovo", model: "ThinkPad", serialNumber: "SN-45", ownerPublicId: "d7d60964-4c5d-4d4e-9362-c56c2c08b4cf" },
  openedAt: "2026-10-10T13:00:00.000Z",
  createdAt: "2026-10-10T13:00:00.000Z",
  updatedAt: "2026-10-10T13:00:00.000Z",
  confirmedAt: "2026-10-10T13:00:00.000Z",
  complaint: null,
  intakeObservations: null,
  newEquipmentSerialIdentificationStatus: null,
  createdByUserPublicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
  assignedUserPublicIds: [],
  snapshotVersion: 1,
  snapshotCapturedAt: "2026-10-10T13:00:00.000Z",
  customerSnapshotJson: { snapshotVersion: 1, capturedAt: "2026-10-10T13:00:00.000Z", name: "Marina Costa" },
  equipmentSnapshotJson: { snapshotVersion: 1, capturedAt: "2026-10-10T13:00:00.000Z", model: "ThinkPad" },
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function unauthorized() {
  return { ok: false, status: 401, json: async () => ({ error: { message: "Sessão inválida." } }) };
}

function withEditControl(fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<any>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/edit-control") && (init?.method ?? "GET") === "GET"
    ? Promise.resolve(response({ data: { held: true, holder: { publicId: "current-user", username: "usuario.teste" }, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: true, generation: 1, heartbeatIntervalSeconds: 60 } }))
    : fetchMock(input, init));
}

it("navega da listagem para o detalhe sem chamar endpoints mutáveis", async () => {
  window.location.hash = "#/service-orders";
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "usuario.teste",
    isAdmin: true,
    permissions: ["service_orders.read", "service_orders.events.read"],
    csrfToken: "csrf-session",
    session: { expiresAt: "2026-10-11T20:00:00.000Z" },
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: identity }))
    .mockResolvedValueOnce(response({ data: [order], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
    .mockResolvedValueOnce(response({ data: order }))
    .mockResolvedValueOnce(response({ data: [], total: "0.00", canReadCosts: true }))
    .mockResolvedValueOnce(response({ data: [] }));
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  expect(await screen.findByText("OS-000128")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/ }));
  expect(await screen.findByRole("heading", { name: "OS-000128" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});

it("inicia a abertura a partir da lista e reserva o número com CSRF", async () => {
  window.location.hash = "#/service-orders";
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "usuario.teste",
    isAdmin: false,
    permissions: ["service_orders.read", "service_orders.opening.create", "service_orders.opening.read"],
    csrfToken: "csrf-session",
    session: { expiresAt: "2026-10-13T20:00:00.000Z" },
  };
  const opening = {
    publicId: "75811f19-8b30-45ad-84a5-7ac1bf22e768",
    visibleNumber: "OS-000132",
    numberValue: "132",
    status: "IN_PROGRESS",
    initiatedByUserPublicId: identity.publicId,
    createdBy: identity.publicId,
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
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: identity }))
    .mockResolvedValueOnce(response({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }))
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: "OPENING_NOT_FOUND", message: "Abertura não encontrada." } }) })
    .mockResolvedValueOnce(response({ data: opening }));
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Nova OS" }));
  expect(await screen.findByText("OS-000132")).toBeInTheDocument();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/v1/auth/me",
    "/api/v1/service-orders?page=1&pageSize=20",
    "/api/v1/service-orders/openings/current",
    "/api/v1/service-orders/openings",
  ]);
  expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/service-orders/openings", expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }),
  }));
});

it("confirma a abertura e navega ao detalhe, que busca a OS novamente por publicId", async () => {
  window.location.hash = "#/service-orders/opening";
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "usuario.teste",
    isAdmin: true,
    permissions: [],
    csrfToken: "csrf-session",
    session: { expiresAt: "2026-10-13T20:00:00.000Z" },
  };
  const openingPublicId = "75811f19-8b30-45ad-84a5-7ac1bf22e768";
  const confirmedOrder = { ...order, publicId: "9f491492-4287-4e0f-9201-f642174e94cd", visibleNumber: "OS-000133" };
  const opening = {
    publicId: openingPublicId,
    visibleNumber: "OS-000132",
    numberValue: "132",
    status: "IN_PROGRESS",
    initiatedByUserPublicId: identity.publicId,
    createdBy: identity.publicId,
    customerPublicId: order.customer.publicId,
    customer: { ...order.customer, documentHint: null },
    equipmentPublicId: order.equipment.publicId,
    equipment: {
      publicId: order.equipment.publicId,
      type: { publicId: "type-public-id", name: "Notebook" },
      brand: { publicId: "brand-public-id", name: "Lenovo" },
      model: "ThinkPad",
      serialNumber: "SN-45",
      serialIdentificationStatus: "IDENTIFIED",
      owner: { publicId: order.customer.publicId, name: order.customer.name },
    },
    equipmentDraft: null,
    equipmentDraftVersion: null,
    transferRequested: false,
    transferRequestedByUserPublicId: null,
    complaint: null,
    createdAt: "2026-10-13T12:00:00.000Z",
    updatedAt: "2026-10-13T12:00:00.000Z",
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: identity }))
    .mockResolvedValueOnce(response({ data: opening }))
    .mockResolvedValueOnce(response({ data: { publicId: confirmedOrder.publicId, visibleNumber: confirmedOrder.visibleNumber, macroStatus: "ABERTA", operationalSituation: "TRIAGEM" } }))
    .mockResolvedValueOnce(response({ data: confirmedOrder }))
    .mockResolvedValueOnce(response({ data: [], total: "0.00", canReadCosts: true }))
    .mockResolvedValueOnce(response({ data: [] }));
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  await userEvent.click(await screen.findByRole("button", { name: "Confirmar OS" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmar e criar OS" }));
  expect(await screen.findByRole("heading", { name: "OS-000133" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/v1/auth/me",
    "/api/v1/service-orders/openings/current",
    `/api/v1/service-orders/openings/${openingPublicId}/confirm`,
    `/api/v1/service-orders/${confirmedOrder.publicId}`,
    `/api/v1/service-orders/${confirmedOrder.publicId}/budget-items`,
    "/api/v1/services/available-for-order",
  ]));
  expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({
    method: "POST",
    credentials: "include",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session" }),
    body: "{}",
  }));
  expect(fetchMock.mock.calls[3][1]).toEqual(expect.objectContaining({ method: "GET" }));
});

it("autentica com CSRF, consulta a sessão e libera a leitura de OS", async () => {
  window.location.hash = "#/service-orders";
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "validacao.frontend",
    isAdmin: true,
    permissions: ["service_orders.read", "service_orders.events.read"],
    csrfToken: "csrf-session-memory-only",
    session: { expiresAt: "2026-10-11T20:00:00.000Z" },
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(unauthorized())
    .mockResolvedValueOnce(response({ data: { csrfToken: "csrf-prelogin" } }))
    .mockResolvedValueOnce(response({ data: identity }))
    .mockResolvedValueOnce(response({ data: identity }))
    .mockResolvedValueOnce(response({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  await userEvent.type(await screen.findByLabelText("Usuário"), "validacao.frontend");
  await userEvent.type(screen.getByLabelText("Senha"), "senha-descartavel");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

  expect(await screen.findByText("Ainda não há Ordens de Serviço confirmadas.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/auth/me", expect.objectContaining({ method: "GET", credentials: "include" }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/auth/csrf", expect.objectContaining({ method: "GET", credentials: "include" }));
  expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/auth/login", expect.objectContaining({
    method: "POST",
    credentials: "include",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-prelogin" }),
    body: JSON.stringify({ username: "validacao.frontend", password: "senha-descartavel" }),
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/v1/auth/me", expect.objectContaining({ method: "GET" }));
  expect(fetchMock.mock.calls.slice(0, 5).every(([, options]) => options.credentials === "include")).toBe(true);
  expect(window.localStorage.length).toBe(0);
});

it("mostra erro genérico de credenciais e limpa a senha após falha", async () => {
  const invalidCredentials = { ok: false, status: 401, json: async () => ({ error: { message: "Usuário ou senha inválidos." } }) };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(unauthorized())
    .mockResolvedValueOnce(response({ data: { csrfToken: "csrf-prelogin" } }))
    .mockResolvedValueOnce(invalidCredentials);
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  await userEvent.type(await screen.findByLabelText("Usuário"), "usuario.teste");
  const password = screen.getByLabelText("Senha");
  await userEvent.type(password, "senha-nao-persistida");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Usuário ou senha inválidos.");
  expect(password).toHaveValue("");
  expect(window.localStorage.length).toBe(0);
});

it("encerra somente a sessão atual usando o token CSRF da sessão", async () => {
  const identity = {
    publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
    username: "usuario.teste",
    isAdmin: true,
    permissions: ["service_orders.read"],
    csrfToken: "csrf-session-memory-only",
    session: { expiresAt: "2026-10-11T20:00:00.000Z" },
  };
  const noContent = { ok: true, status: 204, json: async () => null };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: identity }))
    .mockResolvedValueOnce(response({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }))
    .mockResolvedValueOnce(noContent);
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  await userEvent.click(await screen.findByRole("button", { name: "Sair" }));
  expect(await screen.findByRole("heading", { name: "Acesse sua conta" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/auth/logout", expect.objectContaining({
    method: "POST",
    credentials: "include",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session-memory-only" }),
  }));
});

it("avisa antes de sair da OS com alteração local e permite continuar editando", async () => {
  const orderId = order.publicId;
  window.location.hash = `#/service-orders/${orderId}?section=events`;
  const identity = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "usuario.teste", isAdmin: true, permissions: ["service_orders.read", "service_orders.events.read", "service_orders.update"], csrfToken: "csrf-session", session: { expiresAt: "2026-10-20T20:00:00.000Z" } };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Promise.resolve(response({ data: identity }));
    if (url === `/api/v1/service-orders/${orderId}`) return Promise.resolve(response({ data: order }));
    if (url.includes(`/service-orders/${orderId}/history`)) return Promise.resolve(response({ data: [], nextCursor: null, hasMore: false }));
    if (url === "/api/v1/service-orders?page=1&pageSize=20") return Promise.resolve(response({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));
    if (url.endsWith("/edit-control") && init?.method === "DELETE") return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { released: true } }) });
    return Promise.resolve(response({ data: [] }));
  });
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  const note = await screen.findByRole("textbox", { name: "Nova observação" });
  await userEvent.type(note, "Nota ainda não salva");
  await userEvent.click(screen.getByRole("link", { name: "Sistema Gestor OS, início" }));
  expect(await screen.findByRole("dialog", { name: "Alterações não salvas" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
  expect(screen.getByRole("textbox", { name: "Nova observação" })).toHaveValue("Nota ainda não salva");
  expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/v1/service-orders?page=1&pageSize=20")).toBe(false);

  await userEvent.click(screen.getByRole("link", { name: "Sistema Gestor OS, início" }));
  await userEvent.click(screen.getByRole("button", { name: "Sair sem salvar" }));
  expect(await screen.findByText("Ainda não há Ordens de Serviço confirmadas.")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Nova observação" })).not.toBeInTheDocument();
});

it("pede confirmação antes do logout quando o formulário da OS está sujo", async () => {
  const orderId = order.publicId;
  window.location.hash = `#/service-orders/${orderId}?section=events`;
  const identity = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "usuario.teste", isAdmin: true, permissions: ["service_orders.read", "service_orders.events.read", "service_orders.update"], csrfToken: "csrf-session", session: { expiresAt: "2026-10-20T20:00:00.000Z" } };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Promise.resolve(response({ data: identity }));
    if (url === `/api/v1/service-orders/${orderId}`) return Promise.resolve(response({ data: order }));
    if (url.includes(`/service-orders/${orderId}/history`)) return Promise.resolve(response({ data: [], nextCursor: null, hasMore: false }));
    if (url === "/api/v1/auth/logout") return Promise.resolve({ ok: true, status: 204, json: async () => null });
    if (url.endsWith("/edit-control") && init?.method === "DELETE") return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { released: true } }) });
    return Promise.resolve(response({ data: [] }));
  });
  vi.stubGlobal("fetch", withEditControl(fetchMock));
  render(<App />);

  await userEvent.type(await screen.findByRole("textbox", { name: "Nova observação" }), "Não descartar sem confirmar");
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  expect(await screen.findByRole("dialog", { name: "Alterações não salvas" })).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/v1/auth/logout")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
  expect(screen.getByRole("textbox", { name: "Nova observação" })).toHaveValue("Não descartar sem confirmar");
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  await userEvent.click(screen.getByRole("button", { name: "Sair sem salvar" }));
  expect(await screen.findByRole("heading", { name: "Acesse sua conta" })).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/auth/logout")).toHaveLength(1);
});
