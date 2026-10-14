import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ServiceCatalogPage } from "./ServiceCatalogPage";

const service = {
  publicId: "123e4567-e89b-42d3-a456-426614174000",
  name: "Formatação",
  defaultPrice: "0.00",
  isActive: true,
  version: 1,
  createdAt: "2026-10-14T10:00:00.000Z",
  updatedAt: "2026-10-14T10:00:00.000Z",
};

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function listing(rows = [service]) {
  return { data: rows, pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: rows.length ? 1 : 0 } };
}

describe("ServiceCatalogPage", () => {
  it("consulta ativos por padrão, mostra só campos aprovados e oferece filtros e busca", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(listing()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    expect(await screen.findByText("Formatação")).toBeInTheDocument();
    expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ativos" })).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/services?page=1&pageSize=20&status=active", expect.objectContaining({ credentials: "include" }));
    expect(screen.queryByLabelText("Categoria")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Custo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desabilitados" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/services?page=1&pageSize=20&status=inactive", expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/services?page=1&pageSize=20&status=all", expect.any(Object)));
    fireEvent.change(screen.getByLabelText("Buscar por nome"), { target: { value: "Reparo" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/services?page=1&pageSize=20&status=all&search=Reparo", expect.any(Object)));
  });

  it("cria serviço com preço zero e envia CSRF sem campo de atividade", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "POST") return Promise.resolve(response({ data: service }));
      return Promise.resolve(response(listing()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("Formatação");
    fireEvent.change(screen.getByLabelText("Nome do serviço"), { target: { value: "Novo serviço" } });
    fireEvent.change(screen.getByLabelText("Preço padrão"), { target: { value: "0,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/services", expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: "Novo serviço", defaultPrice: "0.00" }),
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }),
    })));
    expect(await screen.findByText("Serviço cadastrado.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("mostra conflito claro inclusive para serviço desabilitado", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "POST") return Promise.resolve(response({ error: { code: "DUPLICATE_SERVICE_NAME", message: "Duplicado" } }, 409));
      return Promise.resolve(response(listing()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("Formatação");
    fireEvent.change(screen.getByLabelText("Nome do serviço"), { target: { value: "formatacao" } });
    fireEvent.change(screen.getByLabelText("Preço padrão"), { target: { value: "1,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("inclusive entre os desabilitados");
  });

  it("altera preço sem edição de nome e habilita/desabilita com a mesma permissão", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "PATCH") return Promise.resolve(response({ data: service }));
      return Promise.resolve(response(listing()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("Formatação");
    fireEvent.click(screen.getByRole("button", { name: "Alterar preço" }));
    expect(screen.getByText("Preço padrão: Formatação")).toBeInTheDocument();
    expect(screen.queryByLabelText("Novo nome")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Novo preço"), { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/services/"), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ defaultPrice: "12.50", expectedVersion: 1 }),
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }),
    })));
    fireEvent.click(screen.getByRole("button", { name: "Desabilitar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/services/"), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ isActive: false, expectedVersion: 1 }),
    })));
  });

  it("pede confirmação antes da exclusão direta e envia CSRF/versão", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "DELETE") {
        deleted = true;
        return Promise.resolve(response({ data: { deleted: true, publicId: service.publicId } }));
      }
      return Promise.resolve(response(listing(deleted ? [] : [service])));
    });
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("Formatação");
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("expectedVersion=1"), expect.objectContaining({
      method: "DELETE", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }),
    })));
    expect(confirmMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Nenhum serviço encontrado neste filtro.")).toBeInTheDocument();
    expect(screen.queryByText("Formatação")).not.toBeInTheDocument();
  });

  it("permite preço em serviço desabilitado e reabilita sem alterar o nome", async () => {
    const inactive = { ...service, isActive: false, defaultPrice: "7.00" };
    const fetchMock = vi.fn().mockImplementation((_path: string, options: RequestInit) => {
      if (options.method === "PATCH") return Promise.resolve(response({ data: inactive }));
      return Promise.resolve(response(listing([inactive])));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("Formatação");
    fireEvent.click(screen.getByRole("button", { name: "Alterar preço" }));
    expect(screen.getByLabelText("Novo preço")).toHaveValue("7.00");
    fireEvent.change(screen.getByLabelText("Novo preço"), { target: { value: "0,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/services/"), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ defaultPrice: "0.00", expectedVersion: 1 }),
    })));
    fireEvent.click(screen.getByRole("button", { name: "Habilitar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/services/"), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ isActive: true, expectedVersion: 1 }),
    })));
  });

  it("exige nome e preço no formulário de criação", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(listing()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceCatalogPage csrfToken="csrf-test" />);
    await screen.findByText("Formatação");
    const name = screen.getByLabelText("Nome do serviço") as HTMLInputElement;
    const price = screen.getByLabelText("Preço padrão") as HTMLInputElement;
    expect(name.required).toBe(true);
    expect(price.required).toBe(true);
    expect(name.checkValidity()).toBe(false);
    expect(price.checkValidity()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
