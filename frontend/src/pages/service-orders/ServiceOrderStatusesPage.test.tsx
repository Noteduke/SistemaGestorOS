import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ServiceOrderStatusesPage } from "./ServiceOrderStatusesPage";

const initial = { publicId: "652c6498-a270-43b2-8627-4a754bb5fdad", name: "Em manutenção", technicalCompletion: "NOT_COMPLETED", allowsBudgetWithdrawal: false, isActive: true, technicalCompletionMutable: true, version: 2 };
function response(body: unknown) { return { ok: true, status: 200, json: async () => body }; }

describe("ServiceOrderStatusesPage", () => {
  it("permite ao administrador criar status com atributo de conclusão configurado", async () => {
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(response({ data: initial }));
      return Promise.resolve(response({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderStatusesPage csrfToken="csrf-local" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Nome do status" }), { target: { value: "Pronto para retirada" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Conclusão técnica" }), { target: { value: "COMPLETED_WITH_REPAIR" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar status" }));

    await screen.findByRole("status");
    const [url, init] = fetchMock.mock.calls.find(([, request]) => request?.method === "POST")!;
    expect(url).toBe("/api/v1/service-order-statuses");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Pronto para retirada", technicalCompletion: "COMPLETED_WITH_REPAIR" });
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf-local");
  });

  it("edita o atributo sem substituir a versão esperada", async () => {
    let listCalls = 0;
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(response({ data: { ...initial, technicalCompletion: "COMPLETED_WITHOUT_REPAIR", version: 3 } }));
      listCalls += 1;
      return Promise.resolve(response({ data: listCalls === 1 ? [initial] : [{ ...initial, technicalCompletion: "COMPLETED_WITHOUT_REPAIR", version: 3 }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderStatusesPage csrfToken="csrf-local" />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Conclusão técnica" }), { target: { value: "COMPLETED_WITHOUT_REPAIR" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar status" }));

    await screen.findByText(/não reclassifica OS/);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, request]) => request?.method === "PATCH")).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, request]) => request?.method === "PATCH")!;
    expect(String(url)).toBe(`/api/v1/service-order-statuses/${initial.publicId}`);
    expect(JSON.parse(String(init?.body))).toEqual({ name: initial.name, technicalCompletion: "COMPLETED_WITHOUT_REPAIR", isActive: true, expectedVersion: 2 });
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf-local");
  });

  it("impede editar atributo após uso e permite desativar o status", async () => {
    let listCalls = 0;
    const used = { ...initial, technicalCompletionMutable: false };
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(response({ data: { ...used, isActive: false, version: 3 } }));
      listCalls += 1;
      return Promise.resolve(response({ data: listCalls === 1 ? [used] : [{ ...used, isActive: false, version: 3 }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderStatusesPage csrfToken="csrf-local" />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByRole("combobox", { name: "Conclusão técnica" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Status ativo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar status" }));
    await screen.findByText("Inativo");
    const [, init] = fetchMock.mock.calls.find(([, request]) => request?.method === "PATCH")!;
    expect(JSON.parse(String(init?.body))).toMatchObject({ isActive: false, expectedVersion: 2 });
  });
});
