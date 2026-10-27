import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ServiceOrderOpeningPage } from "./ServiceOrderOpeningPage";
import { emptyIntake } from "../../api/openingWorkflow";
const person = { publicId: "person", personType: "PF", name: "CLIENTE ATUAL", document: "", tradeName: "", stateRegistration: "", municipalRegistration: "", contactName: "", observations: "", warning: "", isActive: true, updatedAt: "2026-10-23T12:00:00.000Z", address: { street: "RUA TESTE", number: "10", postalCode: "", complement: "", district: "", city: "SÃO PAULO", state: "SP", country: "BR" }, phones: [{ publicId: "phone", number: "1132345678", isPrimary: true }], emails: [{ publicId: "email", address: "cliente@example.test", isPrimary: true }] };
function setup() {
  let current = { publicId: "opening", visibleNumber: "HOS-0000001", status: "IN_PROGRESS", customerPublicId: "person", customerCreatedDuringOpening: true, customer: { publicId: "person", name: person.name, documentHint: null }, equipmentPublicId: "eq", equipment: { publicId: "eq", type: { publicId: "type", name: "NOTEBOOK" }, brand: { publicId: "brand", name: "DELL" }, model: "LATITUDE", serialNumber: "ABC", owner: { publicId: "person", name: person.name } }, complaint: "", intakeData: emptyIntake(), transferRequested: false };
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const body = options.body ? JSON.parse(String(options.body)) : {}; const method = options.method ?? "GET"; calls.push({ url, method, body });
    let data: unknown;
    if (url.endsWith("/openings/options")) data = { initialStatus: { publicId: "status", name: "RECEPÇÃO" } };
    else if (url.includes("people/customers/opening")) data = method === "PATCH" ? { ...person, ...body, name: "CLIENTE ALTERADO" } : person;
    else if (url.endsWith("/openings/current")) data = current;
    else if (url.endsWith("/openings/opening") && method === "PATCH") { current = { ...current, ...body }; data = current; }
    else if (url.endsWith("/confirm")) data = { publicId: "order" };
    else data = [];
    return { ok: true, status: 200, json: async () => ({ data }) };
  });
  vi.stubGlobal("fetch", fetch); const onConfirmed = vi.fn();
  render(<ServiceOrderOpeningPage csrfToken="csrf" canConfirmServiceOrderOpening canCreateCustomer canUpdateCustomer onBack={vi.fn()} onConfirmed={onConfirmed} />);
  return { calls, onConfirmed, user: userEvent.setup() };
}
test("resumo vinculado mostra contatos principais e endereço; somente alterar/substituir cliente", async () => {
  setup(); const summary = await screen.findByLabelText("Cliente vinculado");
  expect(await within(summary).findByText(/3234-5678/)).toBeInTheDocument();
  expect(within(summary).getByText(/cliente@example.test/)).toBeInTheDocument();
  expect(within(summary).getAllByText(/Principal/)).toHaveLength(2);
  expect(within(summary).getByText(/RUA TESTE/)).toBeInTheDocument();
  expect(within(summary).getAllByRole("button").map(b => b.textContent)).toEqual(["Alterar cliente", "Substituir cliente"]);
  expect(screen.queryByRole("button", { name: "Novo cliente" })).not.toBeInTheDocument();
});
test("sintoma vazio exige aceite; voltar preserva dados e focaliza o sintoma", async () => {
  const { user, calls, onConfirmed } = setup();
  const confirm = await screen.findByRole("button", { name: "Confirmar OS" }); await waitFor(() => expect(confirm).toBeEnabled());
  await user.click(confirm);
  expect(screen.getByText("Nenhum defeito foi informado. Deseja prosseguir com a gravação da Ordem de Serviço mesmo assim?")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Voltar e preencher" }));
  await waitFor(() => expect(screen.getByLabelText("Sintoma identificado")).toHaveFocus());
  expect(calls.some(c => c.url.endsWith("/confirm"))).toBe(false);
  await user.click(confirm); const proceed = screen.getByRole("button", { name: "Prosseguir sem informar" }); fireEvent.click(proceed); fireEvent.click(proceed);
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1)); expect(calls.filter(c => c.url.endsWith("/confirm"))).toHaveLength(1);
});
test("alterar cliente usa API protegida e revisão atual sem apagar contatos", async () => {
  const { user, calls } = setup(); vi.spyOn(window, "confirm").mockReturnValue(true);
  await screen.findByText(/3234-5678/); await user.click(screen.getByRole("button", { name: "Alterar cliente" }));
  const name = screen.getByLabelText("Nome / Razão social"); await user.clear(name); await user.type(name, "Cliente alterado");
  await user.click(screen.getByRole("button", { name: "Salvar alterações do cliente" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar alterações do cliente" })).not.toBeInTheDocument());
  const update = calls.find(c => c.method === "PATCH" && c.url.includes("people/customers/opening"));
  expect(update?.body).not.toHaveProperty("publicId"); expect(update?.body).not.toHaveProperty("updatedAt");
  expect(update?.body).toMatchObject({ expectedUpdatedAt: person.updatedAt, confirmPersonChange: true, phones: [{ publicId: "phone" }], emails: [{ publicId: "email" }] });
});
