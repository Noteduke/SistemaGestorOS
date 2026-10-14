import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ServiceOrderBudgetPanel } from "./ServiceOrderBudgetPanel";

const orderId = "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
const item = {
  publicId: "3a5ccbc1-a7cc-4a12-8f71-65b9f379d910", itemType: "MANUAL_PART", origin: "MANUAL", servicePublicId: null,
  description: "Fonte", quantity: 2, unitPrice: "10.00", total: "20.00", unitCost: "5.00", totalCost: "10.00", version: 1,
  snapshotToken: "signed-item-snapshot",
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

it("preserva o token da composição original ao readquirir controle após retirada integral", async () => {
  let reads = 0;
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.endsWith("/services/available-for-order")) return Promise.resolve(response({ data: [] }));
    if (options?.method === "POST") return Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "BUDGET_COMPOSITION_CONFLICT", message: "Composição retirada", details: { compositionEventId: 42 } }) });
    reads += 1;
    return Promise.resolve(response({ data: [], total: "0.00", canReadCosts: true, compositionToken: reads === 1 ? "before-withdrawal" : "after-withdrawal" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const props = { publicId: orderId, csrfToken: "csrf", editToken: "00000000-0000-4000-8000-000000000001", expectedRevision: "2026-10-14T12:00:00.000Z", canReadCosts: true, canUpdateCosts: true, isOpen: true };
  const view = render(<ServiceOrderBudgetPanel {...props} canEdit />);
  await userEvent.selectOptions(await screen.findByLabelText("Tipo"), "part");
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Peça pendente" } });
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "10.00" } });
  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit={false} />);
  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit />);
  await waitFor(() => expect(reads).toBe(2));
  await userEvent.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(post?.[1].body).compositionToken).toBe("before-withdrawal");
  expect(await screen.findByRole("button", { name: "Criar somente este novo item" })).toBeInTheDocument();
});

it("mantém baseline da inclusão enquanto salva a edição de outro item", async () => {
  let reads = 0;
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.endsWith("/services/available-for-order")) return Promise.resolve(response({ data: [] }));
    if (options?.method === "PATCH") return Promise.resolve(response({ data: { ...item, quantity: 3 }, serviceOrderRevision: "2026-10-14T12:00:01.000Z" }));
    if (options?.method === "POST") return Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "BUDGET_COMPOSITION_CONFLICT", message: "Composição retirada", details: { compositionEventId: 43 } }) });
    reads += 1;
    return Promise.resolve(response({ data: [item], total: "20.00", canReadCosts: true, compositionToken: reads === 1 ? "before-withdrawal" : "after-withdrawal" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const props = { publicId: orderId, csrfToken: "csrf", editToken: "00000000-0000-4000-8000-000000000001", expectedRevision: "2026-10-14T12:00:00.000Z", canReadCosts: true, canUpdateCosts: true, isOpen: true };
  const view = render(<ServiceOrderBudgetPanel {...props} canEdit />);
  await screen.findByText("Fonte");
  await userEvent.selectOptions(screen.getByLabelText("Tipo"), "part");
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Outra peça" } });
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "10.00" } });
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "3" } });
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(reads).toBe(2));
  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit={false} />);
  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit />);
  await waitFor(() => expect(reads).toBe(3));
  await userEvent.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(post?.[1].body).compositionToken).toBe("before-withdrawal");
});

it("envia somente o campo editado e resolve conflito real por escolha explícita", async () => {
  let patchCount = 0;
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.endsWith("/services/available-for-order")) return Promise.resolve(response({ data: [] }));
    if (options?.method === "PATCH") {
      patchCount += 1;
      if (patchCount === 1) return Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "BUDGET_FIELD_CONFLICT", message: "Conflito", details: { conflicts: [{ field: "unitPrice", label: "Valor unitário", current: "12.00", wanted: "13.00" }] } }) });
      return Promise.resolve(response({ data: { ...item, unitPrice: "13.00" }, serviceOrderRevision: "2026-10-14T12:00:01.000Z" }));
    }
    return Promise.resolve(response({ data: [item], total: "20.00", canReadCosts: true }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const props = { publicId: orderId, csrfToken: "csrf", editToken: "00000000-0000-4000-8000-000000000001", expectedRevision: "2026-10-14T12:00:00.000Z", canReadCosts: true, canUpdateCosts: true, isOpen: true };
  const view = render(<ServiceOrderBudgetPanel {...props} canEdit />);
  await screen.findByText("Fonte");
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText("Valor unitário"), { target: { value: "13.00" } });
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText(/Escolha como resolver cada campo/)).toBeInTheDocument();
  const first = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH");
  expect(JSON.parse(first?.[1].body)).toEqual({ expectedVersion: 1, unitPrice: "13.00", snapshotToken: "signed-item-snapshot", original: { unitPrice: "10.00" } });
  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit={false} />);
  expect(screen.getByRole("button", { name: "Salvar decisões" })).toBeDisabled();
  expect(patchCount).toBe(1);
  view.rerender(<ServiceOrderBudgetPanel {...props} canEdit />);
  await userEvent.click(screen.getByRole("radio", { name: "Usar meu valor" }));
  await userEvent.click(screen.getByRole("button", { name: "Salvar decisões" }));
  await waitFor(() => expect(patchCount).toBe(2));
  const patches = fetchMock.mock.calls.filter(([, options]) => options?.method === "PATCH");
  expect(JSON.parse(patches[1][1].body)).toEqual({ expectedVersion: 1, unitPrice: "13.00", snapshotToken: "signed-item-snapshot", original: { unitPrice: "10.00" }, useMine: ["unitPrice"], resolvedCurrent: { unitPrice: "12.00" } });
});

it("não restaura item removido e preserva o rascunho até criar um novo", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url.endsWith("/services/available-for-order")) return Promise.resolve(response({ data: [] }));
    if (options?.method === "PATCH") return Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "BUDGET_ITEM_REMOVED", message: "Este item foi removido enquanto você estava sem o controle da OS." }) });
    return Promise.resolve(response({ data: [item], total: "20.00", canReadCosts: true }));
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ServiceOrderBudgetPanel publicId={orderId} csrfToken="csrf" editToken="00000000-0000-4000-8000-000000000001" expectedRevision="2026-10-14T12:00:00.000Z" canEdit canReadCosts canUpdateCosts isOpen />);
  await screen.findByText("Fonte");
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "3" } });
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect((await screen.findAllByText(/Este item foi removido enquanto/)).length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole("button", { name: "Adicionar novamente como novo item" }));
  expect(screen.getByLabelText("Tipo")).toHaveValue("part");
  expect(screen.getByLabelText("Quantidade (1 a 999)")).toHaveValue(3);
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
});
