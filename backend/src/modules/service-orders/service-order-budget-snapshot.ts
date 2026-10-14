import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

export type BudgetSnapshot = {
  kind: "item" | "composition" | "order";
  orderId: number;
  sessionId: number;
  itemPublicId?: string;
  itemVersion?: number;
  values?: { quantity: number; unitPrice: string; description: string; unitCost?: string | null };
  lastWithdrawalId?: number | null;
  operationalSituation?: string;
  assignedUserPublicIds?: string[];
};

export function signBudgetSnapshot(snapshot: BudgetSnapshot, sessionTokenHash: string): string {
  const payload = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64url");
  const signature = createHmac("sha256", Buffer.from(sessionTokenHash, "hex")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyBudgetSnapshot(token: string | undefined, sessionTokenHash: string, kind: BudgetSnapshot["kind"], orderId: number, sessionId: number): BudgetSnapshot {
  if (!token || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) throw invalidSnapshot();
  const [payload, supplied] = token.split(".");
  const expected = createHmac("sha256", Buffer.from(sessionTokenHash, "hex")).update(payload).digest();
  const suppliedBytes = Buffer.from(supplied, "base64url");
  if (suppliedBytes.length !== expected.length || !timingSafeEqual(suppliedBytes, expected)) throw invalidSnapshot();
  let decoded: BudgetSnapshot;
  try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BudgetSnapshot; }
  catch { throw invalidSnapshot(); }
  if (!decoded || typeof decoded !== "object" || decoded.kind !== kind || decoded.orderId !== orderId || decoded.sessionId !== sessionId) throw invalidSnapshot();
  return decoded;
}

function invalidSnapshot(): BadRequestException {
  return new BadRequestException({ code: "INVALID_BUDGET_SNAPSHOT", message: "Fotografia original inválida. Recarregue o orçamento." });
}
