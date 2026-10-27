import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ServiceOrderListPage } from "./ServiceOrderListPage";

const order = {
  publicId: "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910",
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
};

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function pageResult(page: number) {
  return { data: [order], pagination: { page, pageSize: 20, total: 21, totalPages: 2 } };
}

describe("ServiceOrderListPage", () => {
  it("combina estado, técnico e dia, reinicia página e limpa filtros sem inventar garantia", async () => {
    const fetchMock=vi.fn().mockResolvedValue(response(pageResult(1)));vi.stubGlobal("fetch",fetchMock);
    render(<ServiceOrderListPage page={2} onPageChange={vi.fn()} onOpen={vi.fn()} onStartOpening={vi.fn()}/>);
    await screen.findByText("OS-000128");
    expect(screen.getByLabelText("Garantia")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Estado"),{target:{value:"CLOSED"}});
    fireEvent.change(screen.getByLabelText("Técnico responsável"),{target:{value:"none"}});
    fireEvent.change(screen.getByLabelText("Campo de data"),{target:{value:"exit"}});
    fireEvent.change(screen.getByLabelText("Período"),{target:{value:"specific"}});
    fireEvent.change(screen.getByLabelText("Data específica"),{target:{value:"2026-10-23"}});
    fireEvent.click(screen.getByRole("button",{name:"Filtrar"}));
    await waitFor(()=>expect(String(fetchMock.mock.lastCall?.[0])).toContain("dateTo=2026-10-23"));
    const url=new URL(String(fetchMock.mock.lastCall?.[0]),"http://localhost");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({page:"1",state:"CLOSED",unassigned:"true",dateField:"exit",dateFrom:"2026-10-23",dateTo:"2026-10-23"});
    fireEvent.click(screen.getByRole("button",{name:"Limpar filtros"}));
    await waitFor(()=>expect(String(fetchMock.mock.lastCall?.[0])).not.toContain("dateTo="));
    expect(screen.getByLabelText("Estado")).toHaveValue("");
  });
  it("exibe OS confirmadas com número, cliente e equipamento resumidos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(pageResult(1)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceOrderListPage page={1} onPageChange={vi.fn()} onOpen={vi.fn()} onStartOpening={vi.fn()} />);

    expect(await screen.findByText("OS-000128")).toBeInTheDocument();
    expect(screen.getByText("Marina Costa")).toBeInTheDocument();
    expect(screen.getByText("Notebook · Lenovo · ThinkPad")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/service-orders?page=1&pageSize=20", expect.objectContaining({ method: "GET", credentials: "include" }));
  });

  it("avança página e solicita a API com page e pageSize obrigatórios", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(pageResult(1)));
    vi.stubGlobal("fetch", fetchMock);
    const onPageChange = vi.fn();
    const view = render(<ServiceOrderListPage page={1} onPageChange={onPageChange} onOpen={vi.fn()} onStartOpening={vi.fn()} />);
    await screen.findByText("OS-000128");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    fetchMock.mockResolvedValue(response(pageResult(2)));
    view.rerender(<ServiceOrderListPage page={2} onPageChange={onPageChange} onOpen={vi.fn()} onStartOpening={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/service-orders?page=2&pageSize=20", expect.any(Object)));
  });

  it("exibe mensagem de permissão quando a API responde 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ code: "FORBIDDEN", message: "Forbidden" }, 403)));
    render(<ServiceOrderListPage page={1} onPageChange={vi.fn()} onOpen={vi.fn()} onStartOpening={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("não tem permissão");
  });

  it("informa que a sessão é necessária quando a API responde 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401)));
    render(<ServiceOrderListPage page={1} onPageChange={vi.fn()} onOpen={vi.fn()} onStartOpening={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sua sessão é necessária");
  });
  it("exibe Nova OS e encaminha a ação de abertura", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(pageResult(1)));
    vi.stubGlobal("fetch", fetchMock);
    const onStartOpening = vi.fn();
    render(<ServiceOrderListPage page={1} onPageChange={vi.fn()} onOpen={vi.fn()} onStartOpening={onStartOpening} />);

    fireEvent.click(await screen.findByRole("button", { name: "Nova OS" }));
    expect(onStartOpening).toHaveBeenCalledOnce();
  });
});
