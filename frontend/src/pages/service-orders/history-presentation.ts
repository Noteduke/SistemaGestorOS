const labels: Record<string, string> = {
  field: "Campo", totalBefore: "Total anterior", totalAfter: "Novo total", totalCost: "Custo total", previousOperationalStatus: "Status anterior", newOperationalStatus: "Novo status", previousTechnicalCompletedAt: "Conclusão anterior em", previousTechnicalCompletionStatus: "Status da conclusão anterior",
  previousSituation: "Situação anterior", newSituation: "Nova situação", operationalStatus: "Status", previousStatus: "Status anterior", newStatus: "Novo status", previousTechnicalCompletion: "Conclusão anterior", newTechnicalCompletion: "Nova conclusão", previousAssignments: "Responsáveis anteriores", newAssignments: "Novos responsáveis", customer: "Cliente", equipment: "Equipamento", item: "Item", items: "Itens", amount: "Valor",
  description: "Descrição", name: "Nome", model: "Modelo", quantity: "Quantidade", unitPrice: "Valor unitário", total: "Total", unitCost: "Custo unitário",
  itemType: "Tipo do item", previousMacroStatus: "Situação anterior da OS", newMacroStatus: "Nova situação da OS", previous: "Anterior", current: "Atual", before: "Anterior", after: "Atual", oldValue: "Anterior", newValue: "Novo valor", changes: "Alterações", fields: "Campos",
  outcome: "Resultado", reason: "Motivo", message: "Descrição", status: "Situação", macroStatus: "Situação da OS", operationalSituation: "Situação operacional",
  username: "Funcionário", technician: "Técnico", technicians: "Técnicos", attendant: "Atendente", assignments: "Responsáveis", role: "Função",
  stockOperations: "Peças", consumptionMovements: "Quantidades baixadas", operation: "Operação", destination: "Destino", defectiveQuantity: "Defeituosas", remainingReversibleQuantity: "Quantidade ainda reversível",
  physicalRemovalConfirmed: "Retirada física confirmada", type: "Tipo", brand: "Marca", serialNumber: "Número de série", complaint: "Reclamação", reportedDefect: "Sintoma identificado",
  technicalCompletion: "Conclusão técnica", technicalCompletedAt: "Data da conclusão", price: "Preço", cost: "Custo", updatedFields: "Campos alterados",
};
const values: Record<string, string> = { REGISTERED_LABOR: "Serviço cadastrado", MANUAL_LABOR: "Mão de obra avulsa", MANUAL_PART: "Peça avulsa", STOCK_PART: "Peça do estoque", OPEN: "Aberta", CLOSED: "Encerrada", CANCELED: "Cancelada", REPAIRED: "Com reparo", WITHOUT_REPAIR: "Sem reparo", NOT_COMPLETED: "Não concluído", COMPLETED_WITH_REPAIR: "Concluído com reparo", COMPLETED_WITHOUT_REPAIR: "Concluído sem reparo", AVAILABLE: "Disponível", DEFECTIVE: "Defeituosa", CONSUMED: "Baixada", APPLIED: "Aplicada", REVERSED: "Devolvida", TECHNICIAN: "Técnico", ATTENDANT: "Atendente" };
export function historyValue(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) return "";
    return labels[value] ?? values[value] ?? value;
  }
  if (Array.isArray(value)) return value.map(v => historyValue(v, depth + 1)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).filter(([key]) => labels[key]).map(([key, v]) => { const text = historyValue(v, depth + 1); return text ? `${labels[key]}: ${text}` : ""; }).filter(Boolean).join(" · ");
  return "";
}
export function historyFields(payload: Record<string, unknown> | null) {
  return Object.entries(payload ?? {}).filter(([key]) => labels[key]).map(([key, value]) => ({ key, label: labels[key], value: historyValue(value) })).filter(item => item.value);
}
export function historyTitle(eventType: string): string {
  const titles: Record<string, string> = { ITEM_ORCAMENTO_CRIADO: "Item incluído no orçamento", ITEM_ORCAMENTO_ALTERADO: "Item do orçamento alterado", ITEM_ORCAMENTO_REMOVIDO: "Item removido do orçamento", SITUACAO_OPERACIONAL_ALTERADA: "Situação operacional alterada", CONCLUSAO_TECNICA_REGISTRADA: "Conclusão técnica registrada", RETORNO_AO_ATENDIMENTO: "Retorno ao laboratório", ORCAMENTO_RETIRADO: "Orçamento retirado", PECA_ESTOQUE_APLICADA: "Peça aplicada ao equipamento", PECA_ESTOQUE_APLICACAO_REVERTIDA: "Aplicação da peça desfeita", EQUIPAMENTO_CRIADO_DURANTE_ABERTURA: "Equipamento cadastrado na abertura", TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA: "Titularidade do equipamento transferida", ABERTURA_CONFIRMADA: "Abertura confirmada", ATRIBUICOES_ALTERADAS: "Responsáveis alterados", OS_ABERTA: "Abertura da OS", OS_CONFIRMADA: "Abertura confirmada", OS_ENCERRADA: "Atendimento encerrado", OS_CANCELADA: "OS cancelada", OS_SITUACAO_ALTERADA: "Situação alterada", OS_ATRIBUICOES_ALTERADAS: "Responsáveis alterados", OS_BAIXA_DEFINITIVA_REVERTIDA: "Devolução de peça ao estoque", OS_ORCAMENTO_ITEM_INCLUIDO: "Item incluído no orçamento", OS_ORCAMENTO_ITEM_ALTERADO: "Item do orçamento alterado", OS_ORCAMENTO_ITEM_REMOVIDO: "Item removido do orçamento" };
  return titles[eventType] ?? "Atualização da OS";
}
