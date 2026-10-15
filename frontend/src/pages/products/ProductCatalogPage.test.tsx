import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ProductCatalogPage } from "./ProductCatalogPage";
import type { CatalogProduct } from "../../api/products";

const product: CatalogProduct = {
  publicId: "123e4567-e89b-42d3-a456-426614174000",
  internalCode: "P-1",
  description: "PLACA MÃE",
  category: "PART" as const,
  salePrice: null,
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
      body: JSON.stringify({ internalCode: "P-2", description: "Nova peça", category: "RESALE_GOOD", salePrice: null }),
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
      body: JSON.stringify({ internalCode: "P-1", description: "Placa revisada", category: "PART", salePrice: null, expectedVersion: 1 }),
    })));
    fireEvent.click(await screen.findByRole("button", { name: "Inativar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/products/${product.publicId}`), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ isActive: false, expectedVersion: 1 }),
    })));
  });

  it("mostra custo/lucro somente com leitura e oferece edição independente", async () => {
    const priced = { ...product, salePrice: "0.00", acquisitionCost: "0.00", grossProfitEstimate: "0.00" };
    const fetchMock = vi.fn().mockResolvedValue(response(listing([priced])));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ProductCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("PLACA MÃE");
    expect(screen.queryByLabelText("Custo de aquisição (opcional)")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Lucro bruto estimado" })).not.toBeInTheDocument();
    unmount();

    render(<ProductCatalogPage csrfToken="csrf-test" canReadCosts canUpdateCosts />);
    expect(await screen.findByText("PLACA MÃE")).toBeInTheDocument();
    expect(screen.getByLabelText("Custo de aquisição (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lucro bruto estimado" })).toBeInTheDocument();
    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
  });

  it("usuário somente de leitura vê custo, mas não recebe campo para alterá-lo", async () => {
    const priced = { ...product, salePrice: "10.00", acquisitionCost: "4.00", grossProfitEstimate: "6.00" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(listing([priced]))));
    render(<ProductCatalogPage csrfToken="csrf-test" canReadCosts />);
    await screen.findByText("PLACA MÃE");
    expect(screen.getByText("R$ 4,00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
    expect(screen.queryByLabelText("Custo de aquisição (opcional)")).not.toBeInTheDocument();
  });

  it("usuário somente de alteração não vê o custo atual e pode enviar custo sem recebê-lo", async () => {
    const priced = { ...product, salePrice: "10.00", acquisitionCost: "4.00", grossProfitEstimate: "6.00" };
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "PATCH") return Promise.resolve(response({ data: { ...priced, version: 2 } }));
      return Promise.resolve(response(listing([priced])));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductCatalogPage csrfToken="csrf-test" canUpdateCosts />);
    await screen.findByText("PLACA MÃE");
    expect(screen.queryByText("R$ 4,00")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
    const costInput = screen.getByLabelText("Novo custo de aquisição (opcional; em branco mantém o atual)");
    expect(costInput).toHaveValue("");
    fireEvent.change(costInput, { target: { value: "3,25" } });
    fireEvent.change(screen.getAllByLabelText("Descrição")[1], { target: { value: "Descrição revisada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/products/${product.publicId}`), expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ internalCode: "P-1", description: "Descrição revisada", category: "PART", salePrice: "10.00", acquisitionCost: "3.25", expectedVersion: 1 }),
    })));
    expect(screen.queryByText("R$ 4,00")).not.toBeInTheDocument();
  });

  it("usuário somente de alteração limpa o custo por ação explícita", async () => {
    const priced = { ...product, salePrice: "10.00", acquisitionCost: "4.00", grossProfitEstimate: "6.00" };
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "PATCH") return Promise.resolve(response({ data: { ...priced, version: 2 } }));
      return Promise.resolve(response(listing([priced])));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductCatalogPage csrfToken="csrf-test" canUpdateCosts />);
    await screen.findByText("PLACA MÃE");
    fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
    fireEvent.click(screen.getByLabelText("Definir custo como desconhecido (NULL)"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/products/${product.publicId}`), expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ internalCode: "P-1", description: "PLACA MÃE", category: "PART", salePrice: "10.00", acquisitionCost: null, expectedVersion: 1 }),
    })));
  });
});
