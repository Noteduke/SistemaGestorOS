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
  render(<ServiceOrderBudgetPanel publicId={orderId} csrfToken="csrf" canEdit={false} canReadCosts={false} canUpdateCosts={false} isOpen />);
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
  render(<ServiceOrderBudgetPanel publicId={orderId} csrfToken="csrf-token" canEdit canReadCosts canUpdateCosts isOpen />);
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
