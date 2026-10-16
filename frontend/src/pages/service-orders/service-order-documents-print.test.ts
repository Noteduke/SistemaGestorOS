import { describe, expect, it } from "vitest";
import type { ServiceOrderBudgetItem, ServiceOrderDetail, ServiceOrderEvent } from "../../api/serviceOrders";
import { buildServiceOrderEntryPrintHtml, buildServiceOrderExitPrintHtml } from "./service-order-documents-print";

const order = { visibleNumber: "OS-12", macroStatus: "FECHADA", openedAt: "2026-10-16T10:00:00Z", confirmedAt: "2026-10-16T10:00:00Z", customer: { name: "Cliente" }, equipment: { type: "Notebook", brand: "Marca", model: "Modelo", serialNumber: "SN" }, complaint: "Não liga", intakeObservations: "Risco na tampa", customerSnapshotJson: { name: "Cliente", primaryPhone: "11999999999", primaryEmail: "c@example.test", address: { city: "São Paulo", state: "SP" } }, equipmentSnapshotJson: { type: "Notebook", brand: "Marca", model: "Modelo", serialNumber: "SN" } } as unknown as ServiceOrderDetail;
const item = { description: "Troca de peça", quantity: 1, unitPrice: "10.00", total: "10.00", unitCost: "5.00", totalCost: "5.00" } as ServiceOrderBudgetItem;
const event = { eventType: "OS_ENCERRADA", occurredAt: "2026-10-16T12:00:00Z", visibleNumber: "OS-12", numberValue: "12", actor: null, payload: { outcome: "REPAIRED", payment: "NAO_EXIBIR" } } as ServiceOrderEvent;

describe("documentos de entrada e saída da OS", () => {
  it("gera entrada A4 com retratos, reclamação, campos de condição/acessórios e assinaturas", () => {
    const html = buildServiceOrderEntryPrintHtml(order);
    expect(html).toContain("@page{size:A4 portrait"); expect(html).toContain("OS-12"); expect(html).toContain("Não liga");
    expect(html).toContain("Condição física observada no recebimento"); expect(html).toContain("Acessórios recebidos");
    expect(html).toContain("11999999999");
  });
  it("gera saída sem custos e distingue orçamento de cobrança/pagamento", () => {
    const html = buildServiceOrderExitPrintHtml(order, [item], "10.00", [event]);
    expect(html).toContain("encerrado com reparo"); expect(html).toContain("10,00");
    expect(html).toContain("não registra nesta etapa valores efetivamente cobrados ou pagamentos");
    expect(html).not.toContain("5,00"); expect(html).not.toContain("NAO_EXIBIR");
  });
  it("não marca documentos de produção", () => {
    expect(buildServiceOrderEntryPrintHtml(order)).not.toContain("DOCUMENTO DE TESTE — HOMOLOGAÇÃO");
    expect(buildServiceOrderExitPrintHtml(order, [], "0.00", [])).not.toContain("DOCUMENTO DE TESTE — HOMOLOGAÇÃO");
  });
});
