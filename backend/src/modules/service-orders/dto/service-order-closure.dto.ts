import { BadRequestException } from "@nestjs/common";

export type ServiceOrderClosureOutcome = "REPAIRED" | "WITHOUT_REPAIR";
export type DefectiveStockPartInput = { itemPublicId: string; quantity: number };
export type CloseServiceOrderInput = {
  outcome: ServiceOrderClosureOutcome;
  confirmPhysicalRemoval: boolean;
  defectiveItems: DefectiveStockPartInput[];
};

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseCloseServiceOrder(value: unknown): CloseServiceOrderInput {
  if (!isRecord(value) || !["REPAIRED", "WITHOUT_REPAIR"].includes(String(value.outcome))) {
    throw invalid("Informe se o encerramento ocorreu com reparo ou sem reparo.");
  }
  const outcome = value.outcome as ServiceOrderClosureOutcome;
  if (outcome === "REPAIRED") {
    if (Object.keys(value).some((key) => !["outcome"].includes(key))) throw invalid("O encerramento com reparo não recebe confirmação de retirada nem classificação de defeitos.");
    return { outcome, confirmPhysicalRemoval: false, defectiveItems: [] };
  }
  const confirmPhysicalRemoval = value.confirmPhysicalRemoval === true;
  if (value.confirmPhysicalRemoval !== undefined && typeof value.confirmPhysicalRemoval !== "boolean") throw invalid("A confirmação de retirada física deve ser booleana.");
  const rawItems = value.defectiveItems ?? [];
  if (!Array.isArray(rawItems)) throw invalid("Informe uma lista válida de itens defeituosos.");
  const seen = new Set<string>();
  const defectiveItems = rawItems.map((entry) => {
    if (!isRecord(entry) || Object.keys(entry).some((key) => !["itemPublicId", "quantity"].includes(key))
      || typeof entry.itemPublicId !== "string" || !PUBLIC_ID.test(entry.itemPublicId)
      || !Number.isSafeInteger(entry.quantity) || Number(entry.quantity) < 1) throw invalid("Cada classificação exige o identificador público do item e uma quantidade inteira positiva.");
    const normalizedId = entry.itemPublicId.toLowerCase();
    if (seen.has(normalizedId)) throw invalid("Um item não pode aparecer mais de uma vez na lista de defeituosos.");
    seen.add(normalizedId);
    return { itemPublicId: normalizedId, quantity: Number(entry.quantity) };
  });
  if (Object.keys(value).some((key) => !["outcome", "confirmPhysicalRemoval", "defectiveItems"].includes(key))) throw invalid("O corpo contém campos não reconhecidos.");
  return { outcome, confirmPhysicalRemoval, defectiveItems };
}

export function parseCancelServiceOrder(value: unknown): Pick<CloseServiceOrderInput, "confirmPhysicalRemoval" | "defectiveItems"> {
  if (!isRecord(value) || Object.keys(value).some((key) => !["confirmPhysicalRemoval", "defectiveItems"].includes(key))) throw invalid("Informe os dados de retirada física em um objeto válido.");
  const parsed = parseCloseServiceOrder({ outcome: "WITHOUT_REPAIR", ...value });
  return { confirmPhysicalRemoval: parsed.confirmPhysicalRemoval, defectiveItems: parsed.defectiveItems };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function invalid(message: string): BadRequestException { return new BadRequestException({ code: "INVALID_SERVICE_ORDER_CLOSURE", message }); }
