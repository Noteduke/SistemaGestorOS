import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ServiceOrderBudgetPanel } from "./ServiceOrderBudgetPanel";

const orderId = "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
const item = {
  publicId: "3a5ccbc1-a7cc-4a12-8f71-65b9f379d910", itemType: "MANUAL_PART", origin: "MANUAL", servicePublicId: null,
  description: "Fonte", quantity: 2, unitPrice: "10.00", total: "20.00", unitCost: "5.00", totalCost: "10.00", version: 1,
  createdAt: "2026-10-14T12:00:00.000Z",
};
function response(body: unknown) { return { ok: true, status: 200, json: async () => body }; }

it("oculta custo e total de custo sem autorização específica", async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({ data: [{ ...item, unitCost: undefined, totalCost: undefined }], total: "20.00", canReadCosts: false }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ServiceOrderBudgetPanel publicId={orderId} csrfToken="csrf" editToken="00000000-0000-4000-8000-000000000001" expectedRevision="2026-10-14T12:00:00.000Z" canEdit={false} canReadCosts={false} canUpdateCosts={false} isOpen />);
  expect(await screen.findByText("Fonte")).toBeInTheDocument();
  expect(screen.queryByText("Custo unitário")).not.toBeInTheDocument();
  expect(screen.queryByText("R$ 5.00")).not.toBeInTheDocument();
  expect(screen.getByText("R$ 20.00")).toBeInTheDocument();
});

it("envia peça com quantidade máxima, custo opcional e CSRF", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: [], total: "0.00", canReadCosts: true }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ data: item }))
    .mockResolvedValueOnce(response({ data: [item], total: "20.00", canReadCosts: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ServiceOrderBudgetPanel publicId={orderId} csrfToken="csrf-token" editToken="00000000-0000-4000-8000-000000000001" expectedRevision="2026-10-14T12:00:00.000Z" canEdit canReadCosts canUpdateCosts isOpen />);
  await userEvent.selectOptions(await screen.findByLabelText("Tipo"), "part");
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Fonte" } });
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "10.00" } });
  fireEvent.change(screen.getByLabelText("Custo unitário (opcional)"), { target: { value: "5.00" } });
  fireEvent.change(screen.getByLabelText("Quantidade (1 a 999)"), { target: { value: "999" } });
  await userEvent.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(fetchMock.mock.calls[2][0]).toBe(`/api/v1/service-orders/${orderId}/budget-items/manual-part`);
  expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({
    method: "POST", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
    body: JSON.stringify({ description: "Fonte", quantity: 999, unitPrice: "10.00", unitCost: "5.00" }),
  }));
});

it("pesquisa peça do estoque, copia preço padrão editável e não envia saldo nem custo", async () => {
  const productPublicId = "2a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
  const productItem = {
    publicId: "4a5ccbc1-a7cc-4a12-8f71-65b9f379d910", itemType: "STOCK_PART", origin: "PRODUCT_CATALOG",
    servicePublicId: null, productPublicId, description: "FONTE", quantity: 2, unitPrice: "0.00", total: "0.00", version: 1,
    createdAt: "2026-10-14T12:00:00.000Z",
  };
  let budgetReads = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith(`/service-orders/${orderId}/budget-items`)) {
      budgetReads += 1;
      return response({ data: budgetReads === 1 ? [] : [productItem], total: "0.00", canReadCosts: true });
    }
    if (url.endsWith("/services/available-for-order")) return response({ data: [] });
    if (url.includes("/products/available-for-order")) return response({
      data: [{ publicId: productPublicId, internalCode: "F-01", description: "FONTE", defaultPrice: "6.50" }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    if (url.endsWith("/budget-items/stock-part") && init?.method === "POST") return response({ data: productItem, serviceOrderRevision: "2026-10-14T12:01:00.000Z" });
    throw new Error(`Fetch inesperado: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ServiceOrderBudgetPanel publicId={orderId} csrfToken="csrf-token" editToken="00000000-0000-4000-8000-000000000001" expectedRevision="2026-10-14T12:00:00.000Z" canEdit canReadCosts canUpdateCosts isOpen />);
  await screen.findByText("Nenhum item no orçamento.");
  await userEvent.selectOptions(screen.getByLabelText("Tipo"), "stock-part");
  await userEvent.type(screen.getByLabelText("Pesquisar produtos ativos"), "fonte");
  await screen.findByRole("option", { name: /F-01 · FONTE/ });
  await userEvent.selectOptions(screen.getByLabelText("Produto"), productPublicId);
  expect(screen.getByLabelText("Valor unitário")).toHaveValue("6.50");
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "0.00" } });
  fireEvent.change(screen.getByLabelText("Quantidade (1 a 999)"), { target: { value: "2" } });
  await userEvent.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/budget-items/stock-part") && init?.method === "POST")).toBe(true));
  const lookupCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/products/available-for-order"));
  expect(String(lookupCall?.[0])).toContain("search=fonte");
  const createCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/budget-items/stock-part") && init?.method === "POST");
  expect(createCall?.[1]).toEqual(expect.objectContaining({
    method: "POST", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token" }),
    body: JSON.stringify({ productPublicId, quantity: 2, unitPrice: "0.00" }),
  }));
  expect(screen.queryByText("Custo unitário")).not.toBeInTheDocument();
  expect(screen.getAllByText("Peça do estoque").length).toBeGreaterThan(0);
});

it("mantém rascunho do orçamento visível e somente leitura após perder o controle", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: [], total: "0.00", canReadCosts: true }))
    .mockResolvedValueOnce(response({ data: [] }));
  vi.stubGlobal("fetch", fetchMock);
  const props = { publicId: orderId, csrfToken: "csrf", editToken: "00000000-0000-4000-8000-000000000001", expectedRevision: "2026-10-14T12:00:00.000Z", canReadCosts: true, canUpdateCosts: true, isOpen: true };
  const view = render(<ServiceOrderBudgetPanel {...props} canEdit />);
  await userEvent.selectOptions(await screen.findByLabelText("Tipo"), "part");
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Fonte digitada localmente" } });
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "125.00" } });

  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit={false} />);
  expect(screen.getByLabelText("Descrição")).toHaveValue("Fonte digitada localmente");
  expect(screen.getByLabelText("Descrição")).toBeDisabled();
  expect(screen.getByLabelText("Valor unitário")).toHaveValue("125.00");
  expect(screen.getByLabelText("Valor unitário")).toBeDisabled();
  expect(screen.getByText("Rascunho não salvo preservado em somente leitura.")).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, init]) => ["POST", "PATCH", "DELETE"].includes(init?.method ?? ""))).toBe(false);
});

it("separa composição atual e rascunho local após rejeição por revisão desatualizada", async () => {
  const currentItem = { ...item, description: "Tela atual", quantity: 3, unitPrice: "12.00", total: "36.00", unitCost: undefined, totalCost: undefined };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ data: [item], total: "20.00", canReadCosts: true }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: "SERVICE_ORDER_DATA_CONFLICT", message: "OS modificada." }) })
    .mockResolvedValueOnce(response({ data: [currentItem], total: "36.00", canReadCosts: true }));
  vi.stubGlobal("fetch", fetchMock);
  const props = { publicId: orderId, csrfToken: "csrf", editToken: "00000000-0000-4000-8000-000000000001", expectedRevision: "2026-10-14T12:00:00.000Z", canReadCosts: true, canUpdateCosts: true, isOpen: true };
  const view = render(<ServiceOrderBudgetPanel {...props} canEdit />);
  await screen.findByText("Fonte");
  await userEvent.selectOptions(screen.getByLabelText("Tipo"), "part");
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Minha intenção" } });
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "25.00" } });
  await userEvent.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));

  expect(await screen.findByRole("region", { name: "Composição atual do orçamento" })).toHaveTextContent("Tela atual");
  expect(screen.getByRole("form", { name: "Rascunho local do orçamento não salvo" })).toBeInTheDocument();
  expect(screen.getByLabelText("Descrição")).toHaveValue("Minha intenção");
  expect(screen.getByLabelText("Descrição")).toBeDisabled();
  expect(screen.getByText("Rascunho local não salvo:")).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([, init]) => ["POST", "PATCH", "DELETE"].includes(init?.method ?? ""))).toHaveLength(1);
  view.unmount();
});
