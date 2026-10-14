import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ProductCatalogPage } from "./ProductCatalogPage";

const product = {
  publicId: "123e4567-e89b-42d3-a456-426614174000",
  internalCode: "P-1",
  description: "PLACA MÃE",
  category: "PART" as const,
  isActive: true,
  version: 1,
  createdAt: "2026-10-14T10:00:00.000Z",
  updatedAt: "2026-10-14T10:00:00.000Z",
};

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function listing(rows = [product]) {
  return { data: rows, pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: rows.length ? 1 : 0 } };
}

describe("ProductCatalogPage", () => {
  it("consulta produtos ativos, pesquisa, filtra categoria e situação, sem mostrar campos de estoque", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(listing()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductCatalogPage csrfToken="csrf-test" />);
    expect(await screen.findByText("PLACA MÃE")).toBeInTheDocument();
    expect(screen.getAllByText("Peça").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/products?page=1&pageSize=20&status=active", expect.objectContaining({ credentials: "include" }));
    expect(screen.getByRole("table").textContent).not.toMatch(/saldo|custo|série/i);
    fireEvent.change(screen.getAllByLabelText("Categoria", { selector: "select" })[1], { target: { value: "PART" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("category=PART"), expect.any(Object)));
    fireEvent.change(screen.getByLabelText("Buscar por código ou descrição"), { target: { value: "P-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("search=P-1"), expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("status=inactive"), expect.any(Object)));
  });

  it("cadastra produto com código opcional, categoria, CSRF e sem campos de estoque", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "POST") return Promise.resolve(response({ data: product }, 201));
      return Promise.resolve(response(listing()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("PLACA MÃE");
    fireEvent.change(screen.getByLabelText("Código interno (opcional)"), { target: { value: "P-2" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Nova peça" } });
    fireEvent.change(screen.getAllByLabelText("Categoria", { selector: "select" })[0], { target: { value: "RESALE_GOOD" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar produto" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/products", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ internalCode: "P-2", description: "Nova peça", category: "RESALE_GOOD" }),
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }),
    })));
    expect(await screen.findByText("Produto cadastrado.")).toBeInTheDocument();
  });

  it("edita e inativa com revisão esperada", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "PATCH") return Promise.resolve(response({ data: { ...product, version: 2, isActive: false } }));
      return Promise.resolve(response(listing()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("PLACA MÃE");
    fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
    fireEvent.change(screen.getAllByLabelText("Descrição")[1], { target: { value: "Placa revisada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/products/${product.publicId}`), expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ internalCode: "P-1", description: "Placa revisada", category: "PART", expectedVersion: 1 }),
    })));
    fireEvent.click(await screen.findByRole("button", { name: "Inativar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/products/${product.publicId}`), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ isActive: false, expectedVersion: 1 }),
    })));
  });
});
