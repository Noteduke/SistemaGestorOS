import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanySettingsPage } from "./CompanySettingsPage";

const api = vi.hoisted(() => ({
  getCompanySettings: vi.fn(), updateCompanySettings: vi.fn(), uploadCompanyLogo: vi.fn(), removeCompanyLogo: vi.fn(),
}));
vi.mock("../../api/companySettings", () => api);

const blank = {
  legalName: null, tradeName: null, cnpj: null, fullAddress: null, phone: null, email: null,
  logoDataUrl: null, logoMime: null, logoUnavailable: false, deploymentEnvironment: "production", updatedAt: "2026-10-16T12:00:00.000Z",
};

describe("CompanySettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCompanySettings.mockResolvedValue({ data: blank });
    api.updateCompanySettings.mockResolvedValue({ data: { ...blank, legalName: "EMPRESA OFICIAL" } });
    api.uploadCompanyLogo.mockResolvedValue({ data: { ...blank, logoDataUrl: "data:image/png;base64,iVBORw0KGgo=" } });
    api.removeCompanyLogo.mockResolvedValue({ data: blank });
  });

  it("edita os dados cadastrais e envia CSRF", async () => {
    render(<CompanySettingsPage csrfToken="csrf-admin" />);
    fireEvent.change(await screen.findByLabelText("Razão social"), { target: { value: "Empresa oficial" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "contato@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar dados da empresa" }));
    await waitFor(() => expect(api.updateCompanySettings).toHaveBeenCalledWith(expect.objectContaining({ legalName: "Empresa oficial", email: "contato@example.test" }), "csrf-admin"));
  });

  it("envia e mostra a logo selecionada", async () => {
    render(<CompanySettingsPage csrfToken="csrf-admin" />);
    await screen.findByText("Nenhuma logo cadastrada.");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Selecionar logo"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar / substituir logo" }));
    await waitFor(() => expect(api.uploadCompanyLogo).toHaveBeenCalledWith(file, "csrf-admin"));
    expect(await screen.findByAltText("Logo cadastrada da empresa")).toBeInTheDocument();
  });
});
