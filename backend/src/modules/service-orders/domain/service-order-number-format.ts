export function formatServiceOrderNumber(numberValue: bigint, deploymentEnvironment = process.env.GOS_DEPLOYMENT_ENV): string {
  if (numberValue < 1n) throw new RangeError("O número da OS deve ser positivo.");
  if (deploymentEnvironment === "homologation") return "HOS-" + numberValue.toString().padStart(7, "0");
  return "OS-" + numberValue.toString().padStart(6, "0");
}
