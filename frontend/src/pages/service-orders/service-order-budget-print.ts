import type { ServiceOrderBudget, ServiceOrderDetail } from "../../api/serviceOrders";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function money(value: string): string {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/u.test(value)) return "R$ 0,00";
  const [whole, fraction = ""] = value.split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ".")},${fraction.padEnd(2, "0")}`;
}

function itemType(item: ServiceOrderBudget["data"][number]): string {
  if (item.itemType === "STOCK_PART") return "Peça do estoque";
  if (item.itemType === "MANUAL_PART") return "Peça avulsa";
  return item.origin === "REGISTERED" ? "Serviço" : "Mão de obra";
}

export function buildServiceOrderBudgetPrintHtml(order: ServiceOrderDetail, budget: ServiceOrderBudget, issuedAt: Date): string {
  const equipment = [order.equipment.type, order.equipment.brand, order.equipment.model].filter(Boolean).join(" · ");
  const rows = budget.data.map((item) => `<tr><td>${escapeHtml(itemType(item))}</td><td>${escapeHtml(item.description)}</td><td class="number">${item.quantity}</td><td class="number">${money(item.unitPrice)}</td><td class="number">${money(item.total)}</td></tr>`).join("");
  const serial = order.equipment.serialNumber || "Não informado";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orçamento ${escapeHtml(order.visibleNumber)}</title><style>
@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#172b3e;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #176b87;padding-bottom:12px;margin-bottom:18px}h1{font-size:21px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:20px 0 8px;color:#176b87}.brand{font-size:19px;font-weight:700;color:#114b64}.meta{text-align:right;color:#526575}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}.field{margin:0}.field strong{display:block;font-size:10px;text-transform:uppercase;color:#718091}table{width:100%;border-collapse:collapse;margin-top:8px}thead{display:table-header-group}th{background:#f0f5f7;text-align:left;font-size:10px;text-transform:uppercase}th,td{border-bottom:1px solid #dce5eb;padding:8px 6px;vertical-align:top}.number{text-align:right;white-space:nowrap}.total{margin:18px 0 22px;text-align:right;font-size:17px;font-weight:700}.approval{padding:10px 12px;background:#f7f9fa;border:1px solid #dce5eb;border-radius:4px}.signature{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:54px}.signature div{border-top:1px solid #526575;padding-top:6px;text-align:center;color:#526575}.foot{margin-top:28px;color:#718091;font-size:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none!important}tr{break-inside:avoid}}
</style></head><body><header><div><div class="brand">NoteDuke</div><h1>Orçamento de serviço</h1></div><div class="meta"><strong>${escapeHtml(order.visibleNumber)}</strong><br>Emitido em ${escapeHtml(issuedAt.toLocaleString("pt-BR"))}</div></header>
<h2>Cliente</h2><div class="grid"><p class="field"><strong>Nome</strong>${escapeHtml(order.customer.name)}</p></div>
<h2>Equipamento</h2><div class="grid"><p class="field"><strong>Equipamento</strong>${escapeHtml(equipment || "—")}</p><p class="field"><strong>Número de série</strong>${escapeHtml(serial)}</p></div>
<h2>Itens do orçamento</h2><table><thead><tr><th>Tipo</th><th>Descrição</th><th class="number">Qtd.</th><th class="number">Valor unitário</th><th class="number">Total</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Nenhum item registrado.</td></tr>'}</tbody></table>
<p class="total">Valor total: ${money(budget.total)}</p><div class="approval"><strong>Situação registrada da OS/orçamento:</strong> ${escapeHtml(order.operationalSituation)}</div>
<div class="signature"><div>Cliente / responsável — aceite ou assinatura</div><div>Data</div></div><p class="foot">Documento emitido para apresentação do orçamento. A autorização é registrada conforme o fluxo operacional vigente.</p><div class="no-print"><button onclick="window.print()">Imprimir / salvar como PDF</button></div></body></html>`;
}

export function openServiceOrderBudgetPrint(order: ServiceOrderDetail, budget: ServiceOrderBudget): boolean {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  popup.document.open();
  popup.document.write(buildServiceOrderBudgetPrintHtml(order, budget, new Date()));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 250);
  return true;
}
