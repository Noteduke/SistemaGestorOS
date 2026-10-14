import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { invalidPagination } from "../dto/list-service-order-history-query.dto.js";

export type HistoryKind = "SYSTEM_EVENT" | "MANUAL_NOTE";
export interface HistoryPosition { occurredAt: Date; kind: HistoryKind; id: number }

// Cursors are short-lived and contain internal sort keys. Encryption keeps those keys out of the API.
// Restarting this single-process backend invalidates previously issued cursors.
const key = randomBytes(32);
const ttlMs = 60 * 60 * 1000;

export function encodeHistoryCursor(orderPublicId: string, position: HistoryPosition): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ v: 1, orderPublicId, occurredAt: position.occurredAt.toISOString(), kind: position.kind, id: position.id, expiresAt: Date.now() + ttlMs });
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decodeHistoryCursor(cursor: string | undefined, orderPublicId: string): HistoryPosition | null {
  if (cursor === undefined) return null;
  try {
    const raw = Buffer.from(cursor, "base64url");
    if (raw.length < 29) throw new Error("Short cursor");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const decoded: unknown = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    if (!decoded || typeof decoded !== "object") throw new Error("Invalid cursor");
    const value = decoded as Record<string, unknown>;
    if (value.v !== 1 || value.orderPublicId !== orderPublicId || (value.kind !== "SYSTEM_EVENT" && value.kind !== "MANUAL_NOTE")
      || typeof value.occurredAt !== "string" || typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id < 1
      || typeof value.expiresAt !== "number" || value.expiresAt <= Date.now()) throw new Error("Invalid cursor");
    const occurredAt = new Date(value.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== value.occurredAt) throw new Error("Invalid date");
    return { occurredAt, kind: value.kind, id: value.id };
  } catch {
    throw invalidPagination();
  }
}
