import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { PersonForm } from "./PersonForm";
import { formatBrazilianPhone, validBrazilianPhone } from "./brazilian-phone";

test("PF oculta inscrições e país; somente nome é obrigatório; PJ mantém inscrições", async () => {
  const user = userEvent.setup(); const save = vi.fn(async (_data: import("../../api/people").PersonFormInput) => {});
  render(<PersonForm onSave={save} onCancel={vi.fn()} />);
  expect(screen.queryByLabelText("Inscrição estadual")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/País/)).not.toBeInTheDocument();
  expect(document.querySelectorAll("[required]")).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("Tipo de pessoa"), "PJ");
  expect(screen.getByLabelText("Inscrição estadual")).toBeInTheDocument();
  expect(screen.getByLabelText("Inscrição municipal")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Nome / Razão social"), "Empresa");
  await user.click(screen.getByRole("button", { name: "Cadastrar cliente" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].address.country).toBe("BR");
});
test.each([ ["1132345678", "(11) 3234-5678"], ["11987654321", "(11) 98765-4321"] ])("máscara e dígitos nacionais %s", (number, masked) => {
  expect(formatBrazilianPhone(number)).toBe(masked); expect(validBrazilianPhone(masked)).toBe(true);
});
test.each(["5511987654321", "00987654321", "11876543210", "123", "1162345678", "2032345678", "1032345678"])("rejeita telefone inválido/internacional %s", value => expect(validBrazilianPhone(value)).toBe(false));
test("telefone inválido preserva formulário e múltiplos contatos mantêm principal", async () => {
  const user = userEvent.setup(); const save = vi.fn(async (_data: unknown) => {});
  render(<PersonForm onSave={save} onCancel={vi.fn()} />);
  await user.type(screen.getByLabelText("Nome / Razão social"), "Cliente");
  await user.click(screen.getByRole("button", { name: "Adicionar telefone" }));
  await user.type(screen.getByLabelText("Telefone 1"), "123");
  fireEvent.submit(document.querySelector("form")!);
  expect(await screen.findByText(/Informe DDD/)).toBeInTheDocument(); expect(save).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Telefone 1")); await user.type(screen.getByLabelText("Telefone 1"), "1132345678");
  await user.click(screen.getByRole("button", { name: "Adicionar telefone" })); await user.type(screen.getByLabelText("Telefone 2"), "11987654321");
  await user.click(screen.getByLabelText("Telefone principal 2")); fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0]).toMatchObject({ name: "Cliente", phones: [{ isPrimary: false }, { isPrimary: true }] });
});
