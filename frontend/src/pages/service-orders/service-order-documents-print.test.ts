import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceOrderBudgetItem, ServiceOrderDetail, ServiceOrderEvent } from "../../api/serviceOrders";
import type { CompanySettings } from "../../api/companySettings";
import { buildServiceOrderEntryPrintHtml, buildServiceOrderExitPrintHtml } from "./service-order-documents-print";

const order = { visibleNumber: "OS-12", macroStatus: "FECHADA", openedAt: "2026-10-16T10:00:00Z", confirmedAt: "2026-10-16T10:00:00Z", customer: { name: "Cliente" }, equipment: { type: "Notebook", brand: "Marca", model: "Modelo", serialNumber: "SN" }, complaint: "Não liga", intakeObservations: "Risco na tampa", customerSnapshotJson: { name: "Cliente", primaryPhone: "11999999999", primaryEmail: "c@example.test", address: { city: "São Paulo", state: "SP" } }, equipmentSnapshotJson: { type: "Notebook", brand: "Marca", model: "Modelo", serialNumber: "SN" } } as unknown as ServiceOrderDetail;
order.customerPrint = {name:"Cliente", personType:"PF", phones:["11999999999"], emails:["c@example.test"], address:{city:"São Paulo",state:"SP"}};
const item = { description: "Troca de peça", quantity: 1, unitPrice: "10.00", total: "10.00", unitCost: "5.00", totalCost: "5.00" } as ServiceOrderBudgetItem;
const event = { eventType: "OS_ENCERRADA", occurredAt: "2026-10-16T12:00:00Z", visibleNumber: "OS-12", numberValue: "12", actor: null, payload: { outcome: "REPAIRED", payment: "NAO_EXIBIR" } } as ServiceOrderEvent;
const company = { legalName: null, tradeName: null, cnpj: null, fullAddress: null, phone: null, email: null, logoDataUrl: null, logoMime: null, logoUnavailable: false, deploymentEnvironment: "production", updatedAt: "2026-10-16T12:00:00Z" } as CompanySettings;
const homologationCompany = { ...company, deploymentEnvironment: "homologation" } as CompanySettings;

describe("documentos de entrada e saída da OS", () => {
  it("preserva fontes legíveis sem reduzir escala para forçar duas vias",()=>{
    const html=buildServiceOrderEntryPrintHtml(order,company);
    expect(html).toContain('font:12px/1.25 Arial');expect(html).toContain('font-size:10.67px');expect(html).toContain('font-size:16px');
    expect(html).not.toContain('font-size:9px');expect(html).not.toContain('font-size:9.5px');expect(html).not.toContain('transform:scale');
  });
  it("duas vias identificadas, separador e proteção de conteúdo extenso sem redução de fonte",()=>{
    const html=buildServiceOrderEntryPrintHtml({...order,complaint:'Texto extenso '.repeat(400)},company);
    expect(html.match(/<article class="copy"/g)).toHaveLength(2);expect(html).toContain('Via NoteDuke');expect(html).toContain('Via do cliente');expect(html).toContain('border-top:1px dashed');expect(html).toContain('copy.scrollHeight>copy.clientHeight');expect(html).toContain('Cada via será impressa separadamente');expect(html).not.toContain('overflow:hidden');
  });
  it("usa dados atuais PF/PJ, não o retrato histórico; campos ausentes não são inventados",()=>{
    const html=buildServiceOrderEntryPrintHtml({...order,complaint:null,intakeData:null,equipment:{...order.equipment,serialNumber:null},customerPrint:{name:'EMPRESA ATUAL',personType:'PJ',document:'DOCUMENTO SINTÉTICO',tradeName:'FANTASIA',contactName:'CONTATO',phones:[],emails:[],address:null},customerSnapshotJson:{name:'NOME HISTÓRICO SIGILOSO'}},company);
    expect(html).toContain('EMPRESA ATUAL');expect(html).toContain('Razão social / cliente');expect(html).toContain('Não identificado');expect(html).toContain('Não informado');expect(html).not.toContain('NOME HISTÓRICO SIGILOSO');
  });
  it("recusa OS aberta mesmo tecnicamente concluída; saída não inventa entrega ou garantia",()=>{
    expect(()=>buildServiceOrderExitPrintHtml({...order,macroStatus:'ABERTA',technicalCompletion:'COMPLETED_WITH_REPAIR'},[],"0.00",[],company)).toThrow();
    const html=buildServiceOrderExitPrintHtml({...order,closureEvent:{eventType:'OS_ENCERRADA',occurredAt:'2026-10-23T18:00:00Z',outcome:'WITHOUT_REPAIR'}},[],"0.00",[],company);
    expect(html).toContain('encerrado sem reparo');expect(html).toContain('Data de encerramento');expect(html).toContain('Data da retirada: ____');expect(html).toContain('Hora: ____ : ____');expect(html).not.toContain('não registradas separadamente no sistema');expect(html).not.toContain('Data de entrega</b>');
  });
  it("repete identificação segura da OS e da via em documentos extensos",()=>{
    const html=buildServiceOrderEntryPrintHtml({...order,visibleNumber:'HOS-123<&'},company);
    expect(html).toContain('HOS-123&lt;&amp; · Via NoteDuke · Continuação');
    expect(html).toContain('HOS-123&lt;&amp; · Via do cliente · Continuação');
    expect(html).toContain('.long-document .continuation-head{display:table-header-group}');
  });
  afterEach(() => vi.unstubAllEnvs());
  it("gera entrada A4 com retratos, reclamação, campos de condição/acessórios e assinaturas", () => {
    const html = buildServiceOrderEntryPrintHtml(order, company);
    expect(html).toContain("@page{size:A4 portrait"); expect(html).toContain("OS-12"); expect(html).toContain("Não liga");
    expect(html).toContain("Condição física observada no recebimento"); expect(html).toContain("Acessórios recebidos");
    expect(html).toContain("11999999999");
  });
  it("gera saída sem custos e distingue orçamento de cobrança/pagamento", () => {
    const html = buildServiceOrderExitPrintHtml(order, [item], "10.00", [event], company);
    expect(html).toContain("encerrado com reparo"); expect(html).toContain("10,00");
    expect(html).toContain("não comprova a execução dos serviços");expect(html).toContain("não é recibo nem comprovante de pagamento");
    expect(html).not.toContain("5,00"); expect(html).not.toContain("NAO_EXIBIR");
  });
  it("imprime somente os dados de entrada da OS e escapa texto livre", () => {
    const html = buildServiceOrderEntryPrintHtml({ ...order, intakeData: { version: 1, reportedDefect: '<script>defeito</script>', physicalCondition: 'RISCOS NA BASE', accessories: 'FONTE ORIGINAL', battery: 'NÃO TESTADA', observations: '', priority: 'NORMAL' } }, company);
    expect(html).toContain('FONTE ORIGINAL'); expect(html).toContain('RISCOS NA BASE'); expect(html).toContain('NÃO TESTADA');
    expect(html).toContain('&lt;script&gt;defeito&lt;/script&gt;'); expect(html).not.toContain('<script>defeito</script>');
  });
  it("não marca documentos de produção", () => {
    vi.stubEnv("MODE", "production");
    expect(buildServiceOrderEntryPrintHtml(order, company)).not.toContain("DOCUMENTO DE TESTE — HOMOLOGAÇÃO");
    expect(buildServiceOrderExitPrintHtml(order, [], "0.00", [], company)).not.toContain("DOCUMENTO DE TESTE — HOMOLOGAÇÃO");
  });
  it("usa os dados cadastrados e a identificação obrigatória da homologação", () => {
    vi.stubEnv("MODE", "homologation");
    const withCompany = { ...company, legalName: "EMPRESA TESTE", tradeName: "MARCA CADASTRADA", logoDataUrl: "data:image/png;base64,iVBORw0KGgo=" } as CompanySettings;
    const html = buildServiceOrderEntryPrintHtml(order, withCompany);
    expect(html).toContain("MARCA CADASTRADA");
    expect(html).toContain("EMPRESA TESTE");
    expect(html).toContain("data:image/png;base64");
    expect(html.match(/DOCUMENTO DE TESTE — HOMOLOGAÇÃO/gu)).toHaveLength(3);
    expect(html).toContain("Via NoteDuke");
  });
  it("não marca um build de produção mesmo se a API estiver configurada como homologação", () => {
    vi.stubEnv("MODE", "production");
    expect(buildServiceOrderEntryPrintHtml(order, homologationCompany)).not.toContain("DOCUMENTO DE TESTE — HOMOLOGAÇÃO");
  });
});
