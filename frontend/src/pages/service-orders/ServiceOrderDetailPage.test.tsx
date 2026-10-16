import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { operationalSituationOptions, type ServiceOrderEditControlState } from "../../api/serviceOrders";
import { ServiceOrderDetailPage } from "./ServiceOrderDetailPage";

const publicId = "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
const detail = {
  publicId,
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
  complaint: "Não liga",
  intakeObservations: null,
  newEquipmentSerialIdentificationStatus: null,
  createdByUserPublicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd",
  assignedUserPublicIds: [],
  snapshotVersion: 1,
  snapshotCapturedAt: "2026-10-10T13:00:00.000Z",
  customerSnapshotJson: { snapshotVersion: 1, capturedAt: "2026-10-10T13:00:00.000Z", name: "Marina Costa", document: null },
  equipmentSnapshotJson: { snapshotVersion: 1, capturedAt: "2026-10-10T13:00:00.000Z", type: "Notebook", brand: "Lenovo", model: "ThinkPad", serialNumber: "SN-45" },
};
const assignableUsers = [
  { publicId: "a1000000-0000-4000-8000-000000000001", username: "ana.tech" },
  { publicId: "b2000000-0000-4000-8000-000000000002", username: "bruno.tech" },
];

function assignableResponse(users = assignableUsers, page = 1, totalPages = 1, total = users.length) {
  return response({ data: users, pagination: { page, pageSize: 100, total, totalPages } });
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function withEditControl(fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<any>, state: ServiceOrderEditControlState = { held: true, holder: { publicId: "current-user", username: "marina.admin" }, isSameUser: true, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: true, generation: 1, heartbeatIntervalSeconds: 60 }) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/edit-control") && (init?.method ?? "GET") === "GET"
    ? Promise.resolve(response({ data: state }))
    : fetchMock(input, init));
}

async function openAssignmentsEditor() {
  const button = screen.getByRole("button", { name: "Editar responsáveis" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByRole("textbox", { name: "Buscar usuário por username" });
}

describe("ServiceOrderDetailPage", () => {
  it("adquire automaticamente uma OS livre quando o usuário pode editar", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: { acquired: true, expiresAt: "2026-10-14T16:10:00.000Z", generation: 1, heartbeatIntervalSeconds: 60 } }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: false, holder: null, isSameUser: false, expiresAt: null, isCurrentContext: false, generation: 0, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageEdit currentUsername="marina.admin" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText("Você está editando esta OS.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/service-orders/${publicId}/edit-control`, expect.objectContaining({ method: "POST" }));
  });

  it("mantém somente leitura em OS livre quando o usuário não pode editar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: false, holder: null, isSameUser: false, expiresAt: null, isCurrentContext: false, generation: 0, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText("Você não possui autorização para editar esta OS.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it.each(["FECHADA", "CANCELADA"] as const)("mantém OS %s em somente visualização sem criar lock", async (macroStatus) => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { ...detail, macroStatus } }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { orderEditable: false, held: false, holder: null, isSameUser: false, expiresAt: null, isCurrentContext: false, currentContextExpired: false, generation: 0, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageEdit canTakeoverEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText(new RegExp(`OS ${macroStatus.toLocaleLowerCase("pt-BR")}`))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar OS" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("não assume quando a OS fica livre; só adquire após ação explícita", async () => {
    const intervals = new Map<number, () => void>();
    vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout = 0) => {
      if (typeof handler === "function") intervals.set(timeout, handler as () => void);
      return timeout as unknown as number;
    }) as typeof window.setInterval);
    let controlRead = 0;
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/edit-control") && (init?.method ?? "GET") === "GET") {
        controlRead += 1;
        const state = controlRead === 1
          ? { held: true, holder: { publicId: "other", username: "joao" }, isSameUser: false, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 3, heartbeatIntervalSeconds: 60 }
          : controlRead === 2
            ? { held: false, holder: null, isSameUser: false, expiresAt: null, isCurrentContext: false, generation: 4, heartbeatIntervalSeconds: 60 }
            : { held: true, holder: { publicId: "current", username: "maria" }, isSameUser: true, expiresAt: "2026-10-14T16:10:00.000Z", isCurrentContext: true, generation: 5, heartbeatIntervalSeconds: 60 };
        return Promise.resolve(response({ data: state }));
      }
      if (String(input).endsWith("/edit-control") && init?.method === "POST") return Promise.resolve(response({ data: { acquired: true, expiresAt: "2026-10-14T16:10:00.000Z", generation: 5, heartbeatIntervalSeconds: 60 } }));
      return fetchMock(input, init);
    }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageEdit currentUsername="maria" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("OS em edição por joao.")).toBeInTheDocument();
    await act(async () => { intervals.get(15_000)?.(); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText("Esta OS agora está disponível para edição.")).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Editar OS" }));
    expect(await screen.findByText("Você está editando esta OS.")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("reutiliza o contexto da aba no F5 e cria contexto novo ao reabrir sem navegação de reload", async () => {
    const key = `service-order-edit-context:${publicId}`;
    const previousToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    sessionStorage.setItem(key, previousToken);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" } as unknown as PerformanceEntry] as PerformanceEntryList);
    const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const reloadApi = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push([input, init]);
      if (String(input).endsWith("/edit-control") && (init?.method ?? "GET") === "GET") return Promise.resolve(response({ data: { held: true, holder: { publicId: "current", username: "marina.admin" }, isSameUser: true, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: true, generation: 8, heartbeatIntervalSeconds: 60 } }));
      return reloadApi(input, init);
    }));
    const firstView = render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Você está editando esta OS.")).toBeInTheDocument();
    expect(requests.some(([url, init]) => String(url).endsWith("/edit-control") && (init?.headers as Record<string, string>)["X-Service-Order-Edit-Token"] === previousToken)).toBe(true);

    firstView.unmount();
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "navigate" } as unknown as PerformanceEntry] as PerformanceEntryList);
    const reopenedApi = vi.fn().mockResolvedValue(response({ data: detail }));
    const requestStart = requests.length;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push([input, init]);
      if (String(input).endsWith("/edit-control") && (init?.method ?? "GET") === "GET") return Promise.resolve(response({ data: { held: true, holder: { publicId: "current", username: "marina.admin" }, isSameUser: true, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 8, heartbeatIntervalSeconds: 60 } }));
      return reopenedApi(input, init);
    }));
    const reopened = render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Transferir edição para esta aba" })).toBeInTheDocument();
    const newToken = requests.slice(requestStart).find(([url]) => String(url).endsWith("/edit-control"))?.[1]?.headers as Record<string, string>;
    expect(newToken).toBeDefined();
    expect(newToken["X-Service-Order-Edit-Token"]).not.toBe(previousToken);
    expect(sessionStorage.getItem(key)).toBe(newToken["X-Service-Order-Edit-Token"]);
    reopened.unmount();
  });

  it("mostra contexto expirado e só inicia nova edição após clique explícito", async () => {
    const key = `service-order-edit-context:${publicId}`;
    const expiredToken = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    sessionStorage.setItem(key, expiredToken);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" } as unknown as PerformanceEntry] as PerformanceEntryList);
    const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    let acquiredToken: string | null = null;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push([input, init]);
      if (String(input).endsWith("/edit-control") && (init?.method ?? "GET") === "GET") {
        const token = (init?.headers as Record<string, string>)?.["X-Service-Order-Edit-Token"];
        return Promise.resolve(response({ data: token === acquiredToken && acquiredToken
          ? { orderEditable: true, held: true, holder: { publicId: "current", username: "marina.admin" }, isSameUser: true, expiresAt: "2026-10-14T16:10:00.000Z", isCurrentContext: true, generation: 9, heartbeatIntervalSeconds: 60 }
          : { orderEditable: true, held: false, holder: null, isSameUser: false, expiresAt: null, isCurrentContext: false, currentContextExpired: true, generation: 8, heartbeatIntervalSeconds: 60 } }));
      }
      if (String(input).endsWith("/edit-control") && init?.method === "POST") {
        acquiredToken = (init.headers as Record<string, string>)["X-Service-Order-Edit-Token"];
        return Promise.resolve(response({ data: { acquired: true, expiresAt: "2026-10-14T16:10:00.000Z", generation: 9, heartbeatIntervalSeconds: 60 } }));
      }
      return Promise.resolve(response({ data: detail }));
    }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Seu controle de edição expirou. Seus valores locais foram preservados; clique em Editar OS para iniciar um novo controle.")).toBeInTheDocument();
    expect(requests.some(([url, init]) => String(url).endsWith("/edit-control") && init?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Editar OS" }));
    expect(await screen.findByText("Você está editando esta OS.")).toBeInTheDocument();
    const acquireRequest = requests.find(([url, init]) => String(url).endsWith("/edit-control") && init?.method === "POST");
    const newToken = (acquireRequest?.[1]?.headers as Record<string, string>)?.["X-Service-Order-Edit-Token"];
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(expiredToken);
  });

  it("preserva seleção local e torna os campos somente leitura após perder o controle", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(assignableResponse())
      .mockResolvedValueOnce(response({ code: "SERVICE_ORDER_EDIT_CONTROL_LOST", message: "Controle transferido." }, 409));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    const ana = await screen.findByRole("checkbox", { name: "ana.tech" });
    fireEvent.click(ana);
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsáveis" }));
    expect(await screen.findByText(/Seus valores locais foram preservados em somente leitura/)).toBeInTheDocument();
    expect(ana).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "ana.tech" })).toBeDisabled();
  });

  it("bloqueia salvar quando a OS mudou e exige carregar os dados atuais", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const latest = { ...detail, assignedUserPublicIds: [assignableUsers[1].publicId], updatedAt: "2026-10-14T14:00:00.000Z" };
    let detailReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/v1/service-orders/${publicId}`) return Promise.resolve(response({ data: detailReads++ === 0 ? detail : latest }));
      if (url.startsWith("/api/v1/users/assignable")) return Promise.resolve(assignableResponse());
      if (url.endsWith("/assignments") && init?.method === "PUT") return Promise.resolve(response({ code: "SERVICE_ORDER_DATA_CONFLICT", message: "Conflito." }, 409));
      return Promise.resolve(response({ data: [] }));
    });
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    fireEvent.click(await screen.findByRole("checkbox", { name: "ana.tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsáveis" }));
    expect(await screen.findByText(/nenhum valor local foi enviado/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ana.tech" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar responsáveis" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Dados atuais da OS" })).toHaveTextContent("bruno.tech");
    expect(screen.getByRole("region", { name: "Rascunho local não salvo" })).toHaveTextContent("ana.tech");
    fireEvent.click(screen.getByRole("button", { name: "Descartar rascunho explicitamente e começar pelos dados atuais" }));
    await screen.findByRole("button", { name: "Editar responsáveis" });
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
    expect(await screen.findByRole("checkbox", { name: "bruno.tech" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "ana.tech" })).not.toBeChecked();
  });

  it("transfere para outra aba do mesmo usuário sem permissão especial e pede confirmação própria", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: { acquired: true, expiresAt: "2026-10-14T16:10:00.000Z", generation: 2, heartbeatIntervalSeconds: 60 } }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: true, holder: { publicId: "current-user", username: "marina.admin" }, isSameUser: true, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 1, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageEdit canTakeoverEdit={false} section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Transferir edição para esta aba" }));
    expect(confirm).toHaveBeenCalledWith("Transferir edição para esta aba? A outra aba perderá o controle e ficará somente para leitura.");
    expect(await screen.findByText("Você está editando esta OS.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/service-orders/${publicId}/edit-control/takeover`, expect.objectContaining({ method: "POST" }));
  });

  it("permite escolher somente visualização em outra aba do mesmo usuário", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: true, holder: { publicId: "current-user", username: "marina.admin" }, isSameUser: true, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 1, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Somente visualização" }));
    expect(await screen.findByText("Você já está editando esta OS em outra aba.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferir edição para esta aba" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/edit-control") && init?.method === "POST")).toBe(false);
  });

  it("cancelar o takeover de outra pessoa não chama a operação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: true, holder: { publicId: "other-user", username: "joao.silva" }, isSameUser: false, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 7, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageEdit canTakeoverEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Assumir edição" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("joao.silva está editando esta OS"));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/takeover") && (init?.method ?? "GET") === "POST")).toBe(false);
  });

  it("libera o controle ao sair normalmente da tela da OS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    const view = render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    view.unmount();

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/service-orders/${publicId}/edit-control`, expect.objectContaining({ method: "DELETE", keepalive: true }));
  });

  it("libera a OS anterior ao navegar para outra OS na mesma tela", async () => {
    const nextPublicId = "7b6dd2d2-2f8b-4f63-9f3e-76d50768bf11";
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    const props = { publicId, csrfToken: "csrf-in-memory", section: "details" as const, onSectionChange: vi.fn(), onBack: vi.fn() };
    const view = render(<ServiceOrderDetailPage {...props} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    view.rerender(<ServiceOrderDetailPage {...props} publicId={nextPublicId} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/service-orders/${publicId}/edit-control`, expect.objectContaining({ method: "DELETE", keepalive: true })));
  });

  it("exibe detalhes e snapshots históricos sem recalculá-los", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "OS-000128" })).toBeInTheDocument();
    expect(screen.getAllByText("TRIAGEM").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Não liga")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Retrato do cliente" })).toHaveTextContent("Marina Costa");
    expect(screen.getByRole("region", { name: "Retrato do equipamento" })).toHaveTextContent("ThinkPad");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/service-orders/${publicId}`);
  });

  it("carrega e apresenta o histórico unificado por GET com cursor", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({
        data: [{ kind: "SYSTEM_EVENT", eventType: "ABERTURA_CONFIRMADA", occurredAt: "2026-10-10T13:00:00.000Z", serviceOrderNumber: "OS-000128", actor: { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" }, payload: { macroStatus: "ABERTA" } }],
        nextCursor: null, hasMore: false,
      }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    const onSectionChange = vi.fn();
    const props = { publicId, csrfToken: "csrf-in-memory", onSectionChange, onBack: vi.fn() };
    const view = render(<ServiceOrderDetailPage {...props} section="details" />);
    await screen.findByRole("heading", { name: "OS-000128" });

    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(onSectionChange).toHaveBeenCalledWith("events");
    view.rerender(<ServiceOrderDetailPage {...props} section="events" />);
    expect(await screen.findByText("Evento do sistema: ABERTURA CONFIRMADA")).toBeInTheDocument();
    expect(screen.getByText("marina.admin")).toBeInTheDocument();
    expect(screen.getByText("ABERTA")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/${publicId}/history?pageSize=20`, expect.objectContaining({ method: "GET" }));
    expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });

  it("permite reversões parciais para disponível e defeituoso, mantendo a OS fechada", async () => {
    const actor = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" };
    const movementPublicId = "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
    const closureEvent = { kind: "SYSTEM_EVENT", eventType: "OS_ENCERRADA", occurredAt: "2026-10-10T13:00:00.000Z", serviceOrderNumber: "OS-000128", actor,
      payload: { stockOperations: [{ itemPublicId: "a542fc64-f29a-4ba1-859e-0af1462d8435", productPublicId: "b2000000-0000-4000-8000-000000000002", description: "Tela", quantity: 3, operation: "CONSUMED", consumptionMovements: [{ publicId: movementPublicId, quantity: 3 }] }] } };
    const makeReversalEvent = (id: string, quantity: number, destination: "AVAILABLE" | "DEFECTIVE") => ({ kind: "SYSTEM_EVENT", eventType: "OS_BAIXA_DEFINITIVA_REVERTIDA", occurredAt: "2026-10-11T13:00:00.000Z", serviceOrderNumber: "OS-000128", actor,
      payload: { originalMovementPublicId: movementPublicId, reversalMovementPublicId: id, quantity, destination } });
    const reversalOne = makeReversalEvent("c3000000-0000-4000-8000-000000000003", 1, "AVAILABLE");
    const reversalTwo = makeReversalEvent("c3000000-0000-4000-8000-000000000004", 1, "DEFECTIVE");
    const reversalThree = makeReversalEvent("c3000000-0000-4000-8000-000000000005", 1, "AVAILABLE");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: { ...detail, macroStatus: "FECHADA" } }))
      .mockResolvedValueOnce(response({ data: [closureEvent], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(response({ data: { originalMovementPublicId: movementPublicId, quantity: 1, originalQuantity: 3, remainingReversible: 2, destination: "AVAILABLE", macroStatus: "FECHADA" } }, 201))
      .mockResolvedValueOnce(response({ data: [reversalOne, closureEvent], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(response({ data: { originalMovementPublicId: movementPublicId, quantity: 1, originalQuantity: 3, remainingReversible: 1, destination: "DEFECTIVE", macroStatus: "FECHADA" } }, 201))
      .mockResolvedValueOnce(response({ data: [reversalTwo, reversalOne, closureEvent], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(response({ data: { originalMovementPublicId: movementPublicId, quantity: 1, originalQuantity: 3, remainingReversible: 0, destination: "AVAILABLE", macroStatus: "FECHADA" } }, 201))
      .mockResolvedValueOnce(response({ data: [reversalThree, reversalTwo, reversalOne, closureEvent], nextCursor: null, hasMore: false }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageStock section="events" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    const quantityInput = await screen.findByRole("spinbutton", { name: "Quantidade a reverter" });
    expect(quantityInput).toHaveAttribute("max", "3");
    fireEvent.change(quantityInput, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Devolver ao estoque disponível" }));
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("estoque disponível"));
    expect(await screen.findByText("Reversão registrada em estoque disponível. Restam 2 unidade(s) reversível(is); a OS permaneceu fechada.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/${publicId}/stock-consumptions/${movementPublicId}/reversal`, expect.objectContaining({
      method: "POST", credentials: "include", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-in-memory" }), body: JSON.stringify({ confirmed: true, quantity: 1, destination: "AVAILABLE" }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Classificar como defeituosa" }));
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining("estoque defeituoso"));
    expect(await screen.findByText("Reversão registrada em estoque defeituoso. Restam 1 unidade(s) reversível(is); a OS permaneceu fechada.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(5, `/api/v1/service-orders/${publicId}/stock-consumptions/${movementPublicId}/reversal`, expect.objectContaining({ body: JSON.stringify({ confirmed: true, quantity: 1, destination: "DEFECTIVE" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Devolver ao estoque disponível" }));
    expect(await screen.findByText("Reversão registrada em estoque disponível. Restam 0 unidade(s) reversível(is); a OS permaneceu fechada.")).toBeInTheDocument();
    expect(await screen.findAllByText("Evento do sistema: OS BAIXA DEFINITIVA REVERTIDA")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Devolver ao estoque disponível" })).not.toBeInTheDocument();
  });

  it("cria observação com CSRF, sem controle de edição, e atualiza a linha do tempo", async () => {
    const actor = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" };
    const note = { kind: "MANUAL_NOTE", publicId: "1d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", occurredAt: "2026-10-11T14:00:00.000Z", actor, text: "Cliente autorizou pelo WhatsApp.", canDelete: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: [], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(response({ data: note }))
      .mockResolvedValueOnce(response({ data: [note], nextCursor: null, hasMore: false }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canCreateNote section="events" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    const input = await screen.findByRole("textbox", { name: "Nova observação" });
    expect(input).toHaveAttribute("maxlength", "255");
    fireEvent.change(input, { target: { value: note.text } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText(note.text)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/${publicId}/notes`, expect.objectContaining({
      method: "POST", credentials: "include", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-in-memory" }), body: JSON.stringify({ text: note.text }),
    }));
    expect(screen.queryByRole("button", { name: /editar observação/i })).not.toBeInTheDocument();
  });

  it("leitor não vê criação nem exclusão de nota alheia; pagina pelo cursor", async () => {
    const actor = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" };
    const note = { kind: "MANUAL_NOTE", publicId: "1d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", occurredAt: "2026-10-11T14:00:00.000Z", actor, text: "Nota segura", canDelete: false };
    const event = { kind: "SYSTEM_EVENT", occurredAt: "2026-10-10T13:00:00.000Z", actor, eventType: "ABERTURA_CONFIRMADA", serviceOrderNumber: "OS-000128", payload: null };
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: [note], nextCursor: "opaque_cursor", hasMore: true }))
      .mockResolvedValueOnce(response({ data: [event], nextCursor: null, hasMore: false }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="events" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Nota segura")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nova observação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Evento do sistema: ABERTURA CONFIRMADA")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/${publicId}/history?pageSize=20&cursor=opaque_cursor`, expect.objectContaining({ method: "GET" }));
  });

  it("confirma exclusão de nota permitida e envia DELETE com CSRF", async () => {
    const actor = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" };
    const note = { kind: "MANUAL_NOTE", publicId: "1d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", occurredAt: "2026-10-11T14:00:00.000Z", actor, text: "Excluir depois", canDelete: true };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: [note], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(response({ data: { deleted: true } }))
      .mockResolvedValueOnce(response({ data: [], nextCursor: null, hasMore: false }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="events" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText("Excluir depois")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText("Esta OS ainda não possui itens de histórico para exibir.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/${publicId}/notes/${note.publicId}`, expect.objectContaining({
      method: "DELETE", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-in-memory" }),
    }));
  });

  it("mostra OS não encontrada quando o detalhe responde 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ code: "SERVICE_ORDER_NOT_FOUND", message: "Not found" }, 404)));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ordem de Serviço não encontrada");
  });

  it("mantém a OS visível em modo de somente leitura e não mostra takeover sem autorização específica", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: true, holder: { publicId: "20000000-0000-4000-8000-000000000002", username: "outro.usuario" }, isSameUser: false, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 7, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageEdit canManageAssignments canTakeoverEdit={false} section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "OS-000128" })).toBeInTheDocument();
    expect(await screen.findByText("OS em edição por outro.usuario.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar responsáveis" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Assumir edição" })).not.toBeInTheDocument();
  });

  it("permite assumir edição com autorização e envia CSRF e contexto da aba", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: { acquired: true, expiresAt: "2026-10-14T16:10:00.000Z", generation: 8, heartbeatIntervalSeconds: 60 } }));
    vi.stubGlobal("fetch", withEditControl(fetchMock, { held: true, holder: { publicId: "20000000-0000-4000-8000-000000000002", username: "outro.usuario" }, isSameUser: false, expiresAt: "2026-10-14T16:00:00.000Z", isCurrentContext: false, generation: 7, heartbeatIntervalSeconds: 60 }));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageEdit canTakeoverEdit section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.click(await screen.findByRole("button", { name: "Assumir edição" }));
    expect(await screen.findByText("Você está editando esta OS.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/service-orders/${publicId}/edit-control/takeover`, expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-in-memory", "X-Service-Order-Edit-Token": expect.stringMatching(/^[0-9a-f-]{36}$/iu) }),
    }));
  });

  it("lista as dez situações e envia enum oficial com CSRF ao endpoint operacional", async () => {
    const updated = { ...detail, operationalSituation: "AGUARDANDO AVALIAÇÃO/ORÇAMENTO", updatedAt: "2026-10-11T13:00:00.000Z" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: updated }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canUpdateSituation section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    const select = screen.getByRole("combobox", { name: "Nova situação" });
    expect(select.querySelectorAll("option")).toHaveLength(10);
    expect(operationalSituationOptions.map(({ value }) => value)).toContain("AWAITING_EVALUATION_BUDGET");
    expect(screen.getByRole("region", { name: "Retrato do cliente" })).toHaveTextContent("Marina Costa");
    expect(screen.getByRole("region", { name: "Retrato do equipamento" })).toHaveTextContent("ThinkPad");

    fireEvent.change(select, { target: { value: "AWAITING_EVALUATION_BUDGET" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar situação" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Situação operacional atualizada.");
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/service-orders/${publicId}/operational-situation`, expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-in-memory", "Content-Type": "application/json" }),
      body: JSON.stringify({ operationalSituation: "AWAITING_EVALUATION_BUDGET" }),
    }));
    expect(screen.getAllByText("AGUARDANDO AVALIAÇÃO/ORÇAMENTO").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("ABERTA")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Retrato do cliente" })).toHaveTextContent("Marina Costa");
    expect(screen.getByRole("region", { name: "Retrato do equipamento" })).toHaveTextContent("ThinkPad");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/situation"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => /\/(openings|assignments|events|budget|parts|inventory|finance)(\/|\?|$)/.test(String(url)))).toBe(false);
  });

  it("não chama o PATCH quando a situação escolhida já é a atual", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canUpdateSituation section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    expect(screen.getByRole("button", { name: "Salvar situação" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "Sua sessão expirou ou não está autenticada"],
    [403, "Você não tem permissão para alterar a situação operacional"],
    [404, "Ordem de Serviço não encontrada"],
    [400, "A situação selecionada é inválida"],
    [422, "A situação selecionada é inválida"],
  ])("apresenta mensagem apropriada para erro HTTP %s", async (status, message) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ error: { code: "REQUEST_FAILED", message: "Request failed" } }, status));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canUpdateSituation section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.change(screen.getByRole("combobox", { name: "Nova situação" }), { target: { value: "REPAIR_AUTHORIZED" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar situação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("carrega usuários atribuíveis, mostra nomes atuais e não envia PUT para conjunto equivalente em outra ordem", async () => {
    const existing = { ...detail, assignedUserPublicIds: [assignableUsers[0].publicId, assignableUsers[1].publicId] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: existing }))
      .mockResolvedValueOnce(assignableResponse())
      .mockResolvedValueOnce(assignableResponse());
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    expect(await screen.findByRole("list", { name: "Responsáveis nominais atuais" })).toHaveTextContent("ana.tech");
    await openAssignmentsEditor();
    const ana = await screen.findByRole("checkbox", { name: "ana.tech" });
    const bruno = screen.getByRole("checkbox", { name: "bruno.tech" });
    expect(ana).toBeChecked();
    expect(bruno).toBeChecked();
    expect(await screen.findByRole("list", { name: "Responsáveis nominais atuais" })).toHaveTextContent("ana.tech");

    fireEvent.click(screen.getByRole("button", { name: "Remover ana.tech" }));
    fireEvent.click(ana);
    expect(screen.getByRole("button", { name: "Salvar responsáveis" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/assignments"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/users/assignable?page=1&pageSize=100"))).toBe(true);
  });

  it("permite buscar e paginar usuários sem perder a seleção", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(assignableResponse([assignableUsers[0]], 1, 2, 2))
      .mockResolvedValueOnce(assignableResponse([assignableUsers[1]], 2, 2, 2))
      .mockResolvedValueOnce(assignableResponse([assignableUsers[0]], 1, 1, 1));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    fireEvent.click(await screen.findByRole("checkbox", { name: "ana.tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByRole("checkbox", { name: "bruno.tech" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "bruno.tech" })).not.toBeChecked();
    expect(screen.getByText("ana.tech")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar usuário por username" }), { target: { value: "ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByRole("checkbox", { name: "ana.tech" })).toBeChecked();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/users/assignable?page=1&pageSize=100", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/users/assignable?page=2&pageSize=100", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/v1/users/assignable?page=1&pageSize=100&search=ana", expect.objectContaining({ method: "GET" }));
  });

  it("envia a substituição integral com CSRF e preserva situação, macrostatus, cliente, equipamento e snapshots", async () => {
    const updated = { ...detail, assignedUserPublicIds: [assignableUsers[0].publicId] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(assignableResponse())
      .mockResolvedValueOnce(response({ data: updated }))
      .mockResolvedValueOnce(response({
        data: [{ kind: "SYSTEM_EVENT", eventType: "ATRIBUICOES_ALTERADAS", occurredAt: "2026-10-11T13:00:00.000Z", serviceOrderNumber: "OS-000128", actor: { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" }, payload: { newUserPublicIds: [assignableUsers[0].publicId] } }],
        nextCursor: null, hasMore: false,
      }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    const props = { publicId, csrfToken: "csrf-in-memory", canManageAssignments: true, onSectionChange: vi.fn(), onBack: vi.fn() };
    const view = render(<ServiceOrderDetailPage {...props} section="details" />);

    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    fireEvent.click(await screen.findByRole("checkbox", { name: "ana.tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsáveis" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Responsáveis da OS atualizados.");
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/v1/service-orders/${publicId}/assignments`, expect.objectContaining({
      method: "PUT",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-in-memory", "Content-Type": "application/json" }),
      body: JSON.stringify({ userPublicIds: [assignableUsers[0].publicId] }),
    }));
    expect(await screen.findByRole("list", { name: "Responsáveis nominais atuais" })).toHaveTextContent("ana.tech");
    expect(screen.getAllByText("TRIAGEM").length).toBeGreaterThan(0);
    expect(screen.getByText("ABERTA")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Retrato do cliente" })).toHaveTextContent("Marina Costa");
    expect(screen.getByRole("region", { name: "Retrato do equipamento" })).toHaveTextContent("ThinkPad");
    expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes("/assignments") && options.method === "PATCH")).toBe(false);
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/service-orders/") || String(url).includes("/users/assignable"))).toBe(true);

    view.rerender(<ServiceOrderDetailPage {...props} section="events" />);
    expect(await screen.findByText("Evento do sistema: ATRIBUICOES ALTERADAS")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/${publicId}/history?pageSize=20`, expect.objectContaining({ method: "GET" }));
  });

  it("envia lista vazia para remover todos os responsáveis", async () => {
    const existing = { ...detail, assignedUserPublicIds: [assignableUsers[0].publicId] };
    const updated = { ...detail, assignedUserPublicIds: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: existing }))
      .mockResolvedValueOnce(assignableResponse([assignableUsers[0]]))
      .mockResolvedValueOnce(assignableResponse([assignableUsers[0]]))
      .mockResolvedValueOnce(response({ data: updated }));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    await screen.findByRole("checkbox", { name: "ana.tech" });
    fireEvent.click(screen.getByRole("button", { name: "Remover ana.tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsáveis" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Responsáveis da OS atualizados.");
    expect(fetchMock).toHaveBeenNthCalledWith(4, `/api/v1/service-orders/${publicId}/assignments`, expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ userPublicIds: [] }),
    }));
    expect(screen.getByText("Nenhum responsável nominal atribuído.")).toBeInTheDocument();
  });

  it.each([
    ["list", 401, "Sua sessão expirou ou não está autenticada"],
    ["list", 403, "Você não tem permissão para consultar usuários atribuíveis e alterar responsáveis da OS"],
  ] as const)("exibe mensagem apropriada quando a consulta de usuários retorna %s", async (_context, status, message) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ message: "blocked" }, status));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it.each([
    [401, "Sua sessão expirou ou não está autenticada"],
    [403, "Você não tem permissão para alterar os responsáveis da OS"],
    [404, "Ordem de Serviço não encontrada"],
    [400, "A lista de responsáveis é inválida"],
    [422, "A lista de responsáveis é inválida"],
    [409, "Um usuário selecionado não existe mais ou está inativo"],
  ])("apresenta mensagem apropriada para PUT de atribuições com HTTP %s", async (status, message) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(assignableResponse())
      .mockResolvedValueOnce(response({ message: "failed" }, status));
    vi.stubGlobal("fetch", withEditControl(fetchMock));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" canManageAssignments section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    await openAssignmentsEditor();
    fireEvent.click(await screen.findByRole("checkbox", { name: "ana.tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsáveis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
