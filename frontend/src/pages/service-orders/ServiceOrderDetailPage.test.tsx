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

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("ServiceOrderDetailPage", () => {
  it("exibe detalhes e snapshots históricos sem recalculá-los", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: detail }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" eventsPage={1} onSectionChange={vi.fn()} onEventsPageChange={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "OS-000128" })).toBeInTheDocument();
    expect(screen.getAllByText("TRIAGEM").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Não liga")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Retrato do cliente" })).toHaveTextContent("Marina Costa");
    expect(screen.getByRole("region", { name: "Retrato do equipamento" })).toHaveTextContent("ThinkPad");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/service-orders/${publicId}`);
  });

  it("carrega e apresenta o histórico somente por GET paginado", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({
        data: [{ eventType: "ABERTURA_CONFIRMADA", occurredAt: "2026-10-10T13:00:00.000Z", visibleNumber: "OS-000128", numberValue: "128", actor: { publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "marina.admin" }, payload: { macroStatus: "ABERTA" } }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const onSectionChange = vi.fn();
    const props = { publicId, csrfToken: "csrf-in-memory", eventsPage: 1, onSectionChange, onEventsPageChange: vi.fn(), onBack: vi.fn() };
    const view = render(<ServiceOrderDetailPage {...props} section="details" />);
    await screen.findByRole("heading", { name: "OS-000128" });

    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(onSectionChange).toHaveBeenCalledWith("events");
    view.rerender(<ServiceOrderDetailPage {...props} section="events" />);
    expect(await screen.findByText("ABERTURA CONFIRMADA")).toBeInTheDocument();
    expect(screen.getByText("marina.admin")).toBeInTheDocument();
    expect(screen.getByText("ABERTA")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/service-orders/${publicId}/events?page=1&pageSize=20`, expect.objectContaining({ method: "GET" }));
    expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });

  it("mostra OS não encontrada quando o detalhe responde 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ code: "SERVICE_ORDER_NOT_FOUND", message: "Not found" }, 404)));
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" eventsPage={1} onSectionChange={vi.fn()} onEventsPageChange={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ordem de Serviço não encontrada");
  });

  it("lista as dez situações e envia enum oficial com CSRF ao endpoint operacional", async () => {
    const updated = { ...detail, operationalSituation: "AGUARDANDO AVALIAÇÃO/ORÇAMENTO", updatedAt: "2026-10-11T13:00:00.000Z" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: detail }))
      .mockResolvedValueOnce(response({ data: updated }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" eventsPage={1} onSectionChange={vi.fn()} onEventsPageChange={vi.fn()} onBack={vi.fn()} />);

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
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" eventsPage={1} onSectionChange={vi.fn()} onEventsPageChange={vi.fn()} onBack={vi.fn()} />);

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
    render(<ServiceOrderDetailPage publicId={publicId} csrfToken="csrf-in-memory" section="details" eventsPage={1} onSectionChange={vi.fn()} onEventsPageChange={vi.fn()} onBack={vi.fn()} />);

    await screen.findByRole("heading", { name: "OS-000128" });
    fireEvent.change(screen.getByRole("combobox", { name: "Nova situação" }), { target: { value: "REPAIR_AUTHORIZED" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar situação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
