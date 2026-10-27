import type { CompanySettings } from "../../api/companySettings";

export function escapePrintHtml(value: unknown): string {
  return String(value ?? "—").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function companyDocumentHeader(company: CompanySettings): string {
  const registeredName = company.tradeName || company.legalName;
  const logo = company.logoDataUrl && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/u.test(company.logoDataUrl)
    ? `<img class="company-logo" src="${escapePrintHtml(company.logoDataUrl)}" alt="Logo da empresa">` : "";
  const details = [
    company.legalName ? `<div><b>Razão social</b>${escapePrintHtml(company.legalName)}</div>` : "",
    company.cnpj ? `<div><b>CNPJ</b>${escapePrintHtml(company.cnpj)}</div>` : "",
    company.fullAddress ? `<div class="company-address"><b>Endereço</b>${escapePrintHtml(company.fullAddress).replace(/\n/gu, "<br>")}</div>` : "",
    company.phone ? `<div><b>Telefone</b>${escapePrintHtml(company.phone)}</div>` : "",
    company.email ? `<div><b>E-mail</b>${escapePrintHtml(company.email)}</div>` : "",
  ].filter(Boolean).join("");
  return `<div class="company-identity">${logo}<div class="company-identity__content"><div class="company-name">${escapePrintHtml(registeredName || "Dados cadastrais da empresa não configurados")}</div>${details ? `<div class="company-details">${details}</div>` : ""}<div class="company-system">Sistema Gestor OS</div></div></div>`;
}

export function homologationMark(): string {
  return import.meta.env.MODE === "homologation"
    ? `<div class="test-notice">DOCUMENTO DE TESTE — HOMOLOGAÇÃO</div><div class="test-watermark" aria-hidden="true">DOCUMENTO DE TESTE — HOMOLOGAÇÃO</div>` : "";
}

export function openPrintWindow(): Window | null {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (popup) popup.opener = null;
  return popup;
}

export function writePrintDocument(popup: Window, html: string, options: { autoPrint?: boolean } = {}): void {
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  if (options.autoPrint !== false) popup.setTimeout(() => popup.print(), 250);
}

export function writePrintError(popup: Window, message = "Não foi possível carregar a identificação da empresa. Feche esta janela e tente novamente."): void {
  popup.document.open();
  popup.document.write(`<!doctype html><html lang='pt-BR'><meta charset='utf-8'><title>Impressão indisponível</title><body><p>${escapePrintHtml(message)}</p></body></html>`);
  popup.document.close();
}
