import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { operationalSituationOptions } from "../../api/serviceOrders";
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

describe("ServiceOrderDetailPage", () => {
  it("exibe detalhes e snapshots históricos sem recalculá-los", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", fetchMock);
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
    vi.stubGlobal("fetch", fetchMock);
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

  it("cria observação com CSRF, sem controle de edição, e atualiza a linha do tempo", async () => {
    const actor = { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" };
    const note = { kind: "MANUAL_NOTE", publicId: "1d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", occurredAt: "2026-10-11T14:00:00.000Z", actor, text: "Cliente autorizou pelo WhatsApp.", canDelete: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: [], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(response({ data: note }))
      .mockResolvedValueOnce(response({ data: [note], nextCursor: null, hasMore: false }));
    vi.stubGlobal("fetch", fetchMock);
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
    vi.stubGlobal("fetch", fetchMock);
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
    vi.stubGlobal("fetch", fetchMock);
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

  it("lista as dez situações e envia enum oficial com CSRF ao endpoint operacional", async () => {
    const updated = { ...detail, operationalSituation: "AGUARDANDO AVALIAÇÃO/ORÇAMENTO", updatedAt: "2026-10-11T13:00:00.000Z" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: updated }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    expect(await screen.findByRole("list", { name: "Responsáveis nominais atuais" })).toHaveTextContent("ana.tech");
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
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
    vi.stubGlobal("fetch", fetchMock);
    const props = { publicId, csrfToken: "csrf-in-memory", onSectionChange: vi.fn(), onBack: vi.fn() };
    const view = render(<ServiceOrderDetailPage {...props} section="details" />);

    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
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
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" onSectionChange={vi.fn()} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.click(screen.getByRole("button", { name: "Editar responsáveis" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "ana.tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar responsáveis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
