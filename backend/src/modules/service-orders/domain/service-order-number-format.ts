export function formatServiceOrderNumber(numberValue: bigint): string {
  if (numberValue < 1n) throw new RangeError("O número da OS deve ser positivo.");
  return "OS-" + numberValue.toString().padStart(6, "0");
}
