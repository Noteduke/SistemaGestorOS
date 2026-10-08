import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function deriveSessionCsrfToken(sessionSecret: string, sessionId: number): string {
  return createHmac("sha256", sessionSecret)
    .update(`sistema-gestor-os:session:${sessionId}:csrf:v1`, "utf8")
    .digest("base64url");
}

export function safeHashEquals(expectedHex: string, candidate: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(hashSha256(candidate), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function safeValueEquals(expected: string, candidate: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(candidate, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
