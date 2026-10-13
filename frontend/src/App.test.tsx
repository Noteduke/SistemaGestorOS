import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { App } from "./App";

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
    .mockResolvedValueOnce(response({ data: order }));
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);

  expect(await screen.findByText("OS-000128")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/ }));
  expect(await screen.findByRole("heading", { name: "OS-000128" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
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
  vi.stubGlobal("fetch", fetchMock);
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
  vi.stubGlobal("fetch", fetchMock);
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
  vi.stubGlobal("fetch", fetchMock);
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
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);

  await userEvent.click(await screen.findByRole("button", { name: "Sair" }));
  expect(await screen.findByRole("heading", { name: "Acesse sua conta" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/auth/logout", expect.objectContaining({
    method: "POST",
    credentials: "include",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-session-memory-only" }),
  }));
});
