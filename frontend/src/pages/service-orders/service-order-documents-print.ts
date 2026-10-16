import type { ServiceOrderBudgetItem, ServiceOrderDetail, ServiceOrderEvent } from "../../api/serviceOrders";

const HOMOLOGATION_NOTICE = import.meta.env.MODE === "homologation" ? "DOCUMENTO DE TESTE — HOMOLOGAÇÃO" : "";
type DocumentKind = "Entrada da OS" | "Orçamento" | "Saída da OS";

function escapeHtml(value: unknown): string {
  return String(value ?? "—").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" && value.trim() ? value.trim() : "Não informado"; }
function date(value: string | null | undefined): string { return value ? new Date(value).toLocaleString("pt-BR") : "Não informado"; }
function money(value: string): string { const parsed = Number(value); return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"; }
function frame(kind: DocumentKind, number: string, body: string): string {
  const marker = HOMOLOGATION_NOTICE ? `<div class="notice">${HOMOLOGATION_NOTICE}</div><div class="watermark">${HOMOLOGATION_NOTICE}</div>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${kind}</title><style>
@page{size:A4 portrait;margin:15mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#172b3e;margin:0}header{border-bottom:2px solid #176b87;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between}h1{font-size:21px;margin:0}h2{font-size:13px;color:#176b87;margin:18px 0 6px;text-transform:uppercase}.brand{font-size:18px;font-weight:700}.muted{color:#546575}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.wide{grid-column:1/-1}.field{white-space:pre-wrap;overflow-wrap:anywhere}.field b{display:block;font-size:10px;color:#687b89;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{padding:7px 5px;border-bottom:1px solid #dbe4e8;text-align:left;vertical-align:top}th{background:#eef3f5;font-size:10px;text-transform:uppercase}.right{text-align:right;white-space:nowrap}.total{text-align:right;font-size:16px;font-weight:bold;margin-top:14px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:60px}.signatures div{border-top:1px solid #40515e;padding-top:6px;text-align:center}.notice{border:2px solid #911;color:#811;font-weight:bold;text-align:center;padding:7px;margin-bottom:14px;letter-spacing:.04em}.watermark{display:none}.no-print{margin-top:20px}@media print{.no-print{display:none!important}.watermark{display:block;position:fixed;z-index:999;top:43%;left:2%;width:96%;transform:rotate(-27deg);text-align:center;font-size:31px;font-weight:bold;letter-spacing:.08em;color:rgba(145,20,20,.16);pointer-events:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}}
</style></head><body>${marker}<header><div><div class="brand">NoteDuke</div><div class="muted">Sistema Gestor OS</div></div><div><h1>${kind}</h1><div>OS ${escapeHtml(number)}</div></div></header>${body}<button class="no-print" onclick="window.print()">Imprimir / salvar como PDF</button></body></html>`;
}
function personFields(order: ServiceOrderDetail): string {
  const customer = record(order.customerSnapshotJson); const address = record(customer.address); const equipment = record(order.equipmentSnapshotJson);
  return `<h2>Cliente</h2><div class="grid"><div class="field"><b>Nome</b>${escapeHtml(text(customer.name ?? order.customer.name))}</div><div class="field"><b>Telefone</b>${escapeHtml(text(customer.primaryPhone))}</div><div class="field"><b>E-mail</b>${escapeHtml(text(customer.primaryEmail))}</div><div class="field"><b>Endereço</b>${escapeHtml([address.street,address.number,address.complement,address.district,address.city,address.state,address.postalCode].filter((item) => typeof item === "string" && item).join(", ") || "Não informado")}</div></div><h2>Equipamento</h2><div class="grid"><div class="field"><b>Identificação</b>${escapeHtml([equipment.type, equipment.brand, equipment.model].filter((item) => typeof item === "string" && item).join(" · ") || [order.equipment.type,order.equipment.brand,order.equipment.model].join(" · "))}</div><div class="field"><b>Número de série</b>${escapeHtml(text(equipment.serialNumber ?? order.equipment.serialNumber))}</div></div>`;
}
export function buildServiceOrderEntryPrintHtml(order: ServiceOrderDetail): string {
  const body = `${personFields(order)}<h2>Recebimento</h2><div class="grid"><div class="field wide"><b>Reclamação / solicitação</b>${escapeHtml(text(order.complaint))}</div><div class="field wide"><b>Observações de entrada</b>${escapeHtml(text(order.intakeObservations))}</div><div class="field wide"><b>Condição física observada no recebimento</b><br><br><br></div><div class="field wide"><b>Acessórios recebidos</b><br><br><br></div><div class="field"><b>Data de emissão</b>${escapeHtml(date(new Date().toISOString()))}</div><div class="field"><b>Entrada confirmada</b>${escapeHtml(date(order.confirmedAt))}</div></div><div class="signatures"><div>Cliente / responsável — assinatura</div><div>Funcionário que recebeu</div></div>`;
  return frame("Entrada da OS", order.visibleNumber, body);
}
export function buildServiceOrderExitPrintHtml(order: ServiceOrderDetail, items: ServiceOrderBudgetItem[], budgetTotal: string, events: ServiceOrderEvent[]): string {
  const closure = events.find((event) => event.eventType === "OS_ENCERRADA" || event.eventType === "OS_CANCELADA");
  const payload = record(closure?.payload); const outcome = payload.outcome;
  const result = outcome === "REPAIRED" ? "Atendimento encerrado com reparo" : outcome === "WITHOUT_REPAIR" ? "Atendimento encerrado sem reparo" : outcome === "CANCELED" ? "OS cancelada" : `Situação atual: ${order.macroStatus}`;
  const rows = items.length ? items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td class="right">${item.quantity}</td><td class="right">${escapeHtml(money(item.unitPrice))}</td><td class="right">${escapeHtml(money(item.total))}</td></tr>`).join("") : `<tr><td colspan="4">Nenhum item de orçamento ativo registrado.</td></tr>`;
  const body = `${personFields(order)}<h2>Resultado do atendimento</h2><div class="grid"><div class="field"><b>Resultado</b>${escapeHtml(result)}</div><div class="field"><b>Data do evento</b>${escapeHtml(date(closure?.occurredAt))}</div></div><h2>Serviços e peças registrados no orçamento</h2><table><thead><tr><th>Descrição</th><th class="right">Qtd.</th><th class="right">Unitário</th><th class="right">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total do orçamento: ${escapeHtml(money(budgetTotal))}</div><p class="muted">O sistema registra valores de orçamento, mas não registra nesta etapa valores efetivamente cobrados ou pagamentos. Este documento não é comprovante de cobrança ou pagamento.</p><h2>Entrega e recebimento</h2><div class="grid"><div class="field"><b>Data de entrega</b>${escapeHtml(date(closure?.occurredAt))}</div><div class="field"><b>Informações adicionais</b>Não registradas no sistema.</div></div><div class="signatures"><div>Cliente / responsável — recebimento</div><div>Funcionário responsável pela entrega</div></div>`;
  return frame("Saída da OS", order.visibleNumber, body);
}
export function openServiceOrderDocumentPrint(html: string): void {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return;
  popup.document.open(); popup.document.write(html); popup.document.close();
  popup.setTimeout(() => popup.print(), 250);
}
