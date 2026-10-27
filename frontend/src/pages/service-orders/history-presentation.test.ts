import { historyFields, historyTitle } from "./history-presentation";
test("mantém informação operacional sem IDs, códigos ou metadados aninhados", () => {
  const fields = historyFields({ editToken: "segredo", eventId: "interno", version: 8, description: "Peça substituída", quantity: 2, stockOperations: [{ publicId: "interno", operation: "CONSUMED", quantity: 2, consumptionMovements: [{ publicId: "outro", quantity: 1 }] }] });
  const text = JSON.stringify(fields);
  expect(text).toContain("Peça substituída"); expect(text).toContain("Baixada"); expect(text).toContain("Quantidade");
  for (const hidden of ["segredo", "interno", "outro", "publicId", "version", "CONSUMED"]) expect(text).not.toContain(hidden);
  expect(historyTitle("ABERTURA_CONFIRMADA")).toBe("Abertura confirmada");
  expect(historyTitle("CODIGO_DESCONHECIDO")).toBe("Atualização da OS");
});
