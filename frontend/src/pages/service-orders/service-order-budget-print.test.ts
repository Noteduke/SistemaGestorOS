import { describe, expect, it } from "vitest";
import type { ServiceOrderBudget, ServiceOrderDetail } from "../../api/serviceOrders";
import { buildServiceOrderBudgetPrintHtml } from "./service-order-budget-print";

const order = {
  visibleNumber: "OS-000123", operationalSituation: "AGUARDANDO APROVAÇÃO DO ORÇAMENTO",
  customer: { publicId: "customer", name: "Cliente <Teste>" },
  equipment: { publicId: "equipment", type: "Notebook", brand: "Marca", model: "Modelo", serialNumber: "SN-1", ownerPublicId: "customer" },
} as ServiceOrderDetail;
const budget = {
  total: "25.50", canReadCosts: true,
  data: [{ publicId: "item", itemType: "STOCK_PART", origin: "PRODUCT_CATALOG", servicePublicId: null, productPublicId: "product",
    description: "Peça & acessório", quantity: 2, unitPrice: "12.75", total: "25.50", unitCost: "999.99", totalCost: "1999.98", version: 1, createdAt: "2026-10-16T12:00:00.000Z" }],
} as ServiceOrderBudget;

describe("impressão do orçamento de OS", () => {
  it("gera documento A4 com os dados cobrados e sem custos internos", () => {
    const html = buildServiceOrderBudgetPrintHtml(order, budget, new Date("2026-10-16T12:00:00.000Z"));
    expect(html).toContain("@page{size:A4 portrait");
    expect(html).toContain("NoteDuke");
    expect(html).toContain("OS-000123");
    expect(html).toContain("Cliente &lt;Teste&gt;");
    expect(html).toContain("Peça &amp; acessório");
    expect(html).toContain("25,50");
    expect(html).toContain("AGUARDANDO APROVAÇÃO DO ORÇAMENTO");
    expect(html).not.toContain("999,99");
    expect(html).not.toContain("1999,98");
    expect(html).not.toContain("lucro");
  });
});
