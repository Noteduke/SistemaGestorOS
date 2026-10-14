import type { Prisma } from "../../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;

/** A transaction-scoped row lock coordinates catalog and manual-labor name checks. */
export async function acquireCatalogNameLock(tx: Tx, normalizedName: string): Promise<void> {
  await tx.serviceOrderBudgetNameLock.upsert({
    where: { normalizedName },
    create: { normalizedName },
    update: {},
  });
  await tx.$queryRaw`SELECT normalized_name FROM service_order_budget_name_locks WHERE normalized_name = ${normalizedName} FOR UPDATE`;
}
