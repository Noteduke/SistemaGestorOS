import { Injectable } from "@nestjs/common";

const DELL_ORIGIN = "https://www.dell.com";
const LOOKUP_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const SERVICE_TAG = /^[A-Z0-9]{7}$/u;

type LookupFailure = "INVALID_SERVICE_TAG" | "PRODUCT_NOT_FOUND" | "TIMEOUT" | "ACCESS_BLOCKED" | "MODEL_NOT_FOUND" | "UNEXPECTED_REDIRECT" | "NETWORK_ERROR";

@Injectable()
export class DellPublicLookupService {
  async lookup(value: unknown) {
    const serviceTag = typeof value === "string" ? value.trim().toUpperCase().slice(0, 64) : "";
    if (!SERVICE_TAG.test(serviceTag)) {
      return failure(serviceTag, "INVALID_SERVICE_TAG", "Informe uma Service Tag Dell com 7 caracteres alfanuméricos.");
    }

    const url = `${DELL_ORIGIN}/support/product-details/pt-br/servicetag/${encodeURIComponent(serviceTag)}/overview`;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: "GET", redirect: "manual", signal: abort.signal, headers: { Accept: "text/html" } });
      if (response.status >= 300 && response.status < 400) return failure(serviceTag, "UNEXPECTED_REDIRECT", "A Dell redirecionou a consulta para uma página diferente da esperada.");
      if (response.status === 403 || response.status === 429) return failure(serviceTag, "ACCESS_BLOCKED", "A consulta pública da Dell está bloqueada no momento.");
      if (response.status === 404) return failure(serviceTag, "PRODUCT_NOT_FOUND", "A Dell não encontrou um produto para esta Service Tag.");
      if (!response.ok) return failure(serviceTag, "NETWORK_ERROR", `A consulta pública da Dell respondeu HTTP ${response.status}.`);

      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_HTML_BYTES) return failure(serviceTag, "MODEL_NOT_FOUND", "A resposta pública da Dell excede o limite seguro para análise.");
      const html = await readLimitedHtml(response);
      if (html === null) return failure(serviceTag, "MODEL_NOT_FOUND", "A resposta pública da Dell excede o limite seguro para análise.");
      const model = extractModelForTag(html, serviceTag);
      if (!model) return failure(serviceTag, "MODEL_NOT_FOUND", "Não foi possível identificar o modelo no retorno público da Dell.");
      return { success: true as const, serviceTag, model, source: "dell_public_site" as const };
    } catch {
      if (abort.signal.aborted) return failure(serviceTag, "TIMEOUT", "A consulta pública da Dell excedeu o tempo limite.");
      return failure(serviceTag, "NETWORK_ERROR", "Não foi possível conectar ao site público da Dell.");
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readLimitedHtml(response: Response): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

function extractModelForTag(html: string, serviceTag: string): string | null {
  // Only accept structured product records that bind the exact Service Tag and model.
  // Generic page titles and product words elsewhere in the document are not evidence.
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu);
  for (const match of scripts) {
    try {
      const data: unknown = JSON.parse(match[1]);
      const records = flattenRecords(data);
      for (const record of records) {
        const tag = record.serviceTag ?? record.serialNumber ?? record.identifier;
        const model = record.model ?? record.productModel;
        if (typeof tag === "string" && tag.trim().toUpperCase() === serviceTag && typeof model === "string") {
          const clean = model.trim().replace(/\s+/gu, " ");
          if (clean.length > 0 && clean.length <= 191) return clean;
        }
      }
    } catch { /* Ignore unrelated or malformed JSON-LD blocks. */ }
  }
  return null;
}

function flattenRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenRecords);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap((entry) => entry && typeof entry === "object" ? flattenRecords(entry) : [])];
}

function failure(serviceTag: string, error: LookupFailure, message: string) {
  return { success: false as const, serviceTag, error, message };
}
