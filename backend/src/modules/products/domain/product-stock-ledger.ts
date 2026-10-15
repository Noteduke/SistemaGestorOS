export type StockDeltas = { total: number; applied: number; defective: number };
export type StockBalance = StockDeltas & { available: number };
export type StockMovementType = "MANUAL_ENTRY" | "MANUAL_ADJUSTMENT" | "DEFECTIVE_CLASSIFIED" | "DEFECTIVE_RETURNED" | "DEFECTIVE_DISCARDED";

export function stockBalanceFromDeltas(deltas: StockDeltas): StockBalance {
  const total = deltas.total;
  const applied = deltas.applied;
  const defective = deltas.defective;
  const available = total - applied - defective;
  if (![total, applied, defective, available].every(Number.isSafeInteger)) {
    throw new Error("Stock balance is outside the safe integer range.");
  }
  return { total, applied, defective, available };
}

export function movementDeltas(type: StockMovementType, amount: number): StockDeltas {
  switch (type) {
    case "MANUAL_ENTRY": return { total: amount, applied: 0, defective: 0 };
    case "MANUAL_ADJUSTMENT": return { total: amount, applied: 0, defective: 0 };
    case "DEFECTIVE_CLASSIFIED": return { total: 0, applied: 0, defective: amount };
    case "DEFECTIVE_RETURNED": return { total: 0, applied: 0, defective: -amount };
    case "DEFECTIVE_DISCARDED": return { total: -amount, applied: 0, defective: -amount };
  }
}

export function stockMovementViolation(type: StockMovementType, amount: number, before: StockBalance): string | undefined {
  const deltas = movementDeltas(type, amount);
  const after = stockBalanceFromDeltas({
    total: before.total + deltas.total,
    applied: before.applied + deltas.applied,
    defective: before.defective + deltas.defective,
  });

  if (type === "DEFECTIVE_CLASSIFIED" && before.available < amount) return "INSUFFICIENT_AVAILABLE_STOCK";
  if ((type === "DEFECTIVE_RETURNED" || type === "DEFECTIVE_DISCARDED") && before.defective < amount) return "INSUFFICIENT_DEFECTIVE_STOCK";
  const classified = after.applied + after.defective;
  if (type === "MANUAL_ADJUSTMENT" && amount < 0 && classified > 0 && after.total < classified) return "CLASSIFIED_STOCK_PROTECTED";
  return undefined;
}
