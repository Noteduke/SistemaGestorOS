/**
 * Experimental Correios Rastro lookup. Not imported by the application.
 * Credentials are read only from process environment and are never logged.
 */
import { pathToFileURL } from "node:url";

type CorreiosEnvironment = "homologation" | "production";
type AuthorizationMode = "contract" | "posting-card";

type CorreiosEvent = {
  codigo?: string;
  tipo?: string;
  dtHrCriado?: string;
  descricao?: string;
  unidade?: {
    tipo?: string;
    endereco?: {
      cidade?: string;
      uf?: string;
    };
  };
};

type CorreiosObject = {
  codObjeto?: string;
  eventos?: CorreiosEvent[];
};

type TrackingResponse = {
  objetos?: CorreiosObject[];
};

export type TrackingEvent = {
  description: string;
  occurredAt: string | null;
  location: string | null;
};

export type CorreiosTrackingResult =
  | {
      success: true;
      code: string;
      status: string | null;
      lastEventAt: string | null;
      lastLocation: string | null;
      events: TrackingEvent[];
      source: "correios_api_rastro";
    }
  | {
      success: false;
      code: string;
      error: "CREDENTIALS_REQUIRED" | "AUTHENTICATION_FAILED" | "TRACKING_FAILED" | "TRACKING_NOT_FOUND";
      message: string;
    };

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EVENTS = 10;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function normalizeLocation(event: CorreiosEvent): string | null {
  const address = event.unidade?.endereco;
  const city = address?.cidade?.trim();
  const state = address?.uf?.trim();
  if (city && state) return `${city}/${state}`;
  return city || state || null;
}

function parseEventDate(value: string | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function summarizeEvents(events: CorreiosEvent[]): TrackingEvent[] {
  return events
    .filter((event) => typeof event.descricao === "string" && event.descricao.trim().length > 0)
    .toSorted((left, right) => parseEventDate(right.dtHrCriado) - parseEventDate(left.dtHrCriado))
    .slice(0, MAX_EVENTS)
    .map((event) => ({
      description: event.descricao!.trim(),
      occurredAt: event.dtHrCriado ?? null,
      location: normalizeLocation(event),
    }));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function getAccessToken(apiBaseUrl: string): Promise<string> {
  const username = requiredEnv("CORREIOS_ID");
  // Must be the API access code/password created in CWS, not the Meu Correios login password.
  const apiAccessCode = requiredEnv("CORREIOS_PASS");
  const mode = requiredEnv("CORREIOS_AUTH_MODE") as AuthorizationMode;
  if (mode !== "contract" && mode !== "posting-card") {
    throw new Error("CORREIOS_AUTH_MODE must be 'contract' or 'posting-card'.");
  }

  const authorization = `Basic ${Buffer.from(`${username}:${apiAccessCode}`).toString("base64")}`;
  const body: Record<string, string | number> = {};
  const regionalOffice = optionalEnv("CORREIOS_DR");

  if (mode === "contract") {
    body.numero = requiredEnv("CORREIOS_CONTRACT_NUMBER");
  } else {
    body.numero = requiredEnv("CORREIOS_POSTING_CARD");
    const contractNumber = optionalEnv("CORREIOS_CONTRACT_NUMBER");
    if (contractNumber) body.contrato = contractNumber;
  }

  if (regionalOffice) {
    const dr = Number(regionalOffice);
    if (!Number.isInteger(dr) || dr < 0) throw new Error("CORREIOS_DR must be a non-negative integer.");
    body.dr = dr;
  }

  const response = await fetch(`${apiBaseUrl}/token/v1/autentica/${mode === "contract" ? "contrato" : "cartaopostagem"}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Correios token request failed with HTTP ${response.status}. Check API access code, contract/card, and permissions.`);
  }

  const payload = (await readJson(response)) as { token?: unknown } | undefined;
  if (typeof payload?.token !== "string" || payload.token.length === 0) {
    throw new Error("Correios token response did not include a usable token.");
  }
  return payload.token;
}

function getEnvironment(): { name: CorreiosEnvironment; baseUrl: string } {
  const name = (optionalEnv("CORREIOS_ENV") ?? "homologation") as CorreiosEnvironment;
  if (name === "homologation") return { name, baseUrl: "https://apihom.correios.com.br" };
  if (name === "production") return { name, baseUrl: "https://api.correios.com.br" };
  throw new Error("CORREIOS_ENV must be 'homologation' or 'production'.");
}

function normalizeTrackingCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{13}$/.test(normalized)) {
    throw new Error("Tracking code must contain exactly 13 letters or digits.");
  }
  return normalized;
}

/** Looks up one tracking code and returns only a small, normalized event summary. */
export async function lookupCorreiosTracking(code: string): Promise<CorreiosTrackingResult> {
  const normalizedCode = normalizeTrackingCode(code);
  const environment = getEnvironment();

  try {
    const token = await getAccessToken(environment.baseUrl);
    const trackingUrl = new URL(
      `${environment.baseUrl}/srorastro/v1/objetos/${encodeURIComponent(normalizedCode)}`,
    );
    trackingUrl.searchParams.set("resultado", "T");

    const response = await fetch(trackingUrl, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        code: normalizedCode,
        error: "AUTHENTICATION_FAILED",
        message: "Correios recusou a autenticação ou a autorização para este objeto/serviço.",
      };
    }
    if (response.status === 404) {
      return {
        success: false,
        code: normalizedCode,
        error: "TRACKING_NOT_FOUND",
        message: "Objeto não encontrado ou não disponível para esta credencial.",
      };
    }
    if (!response.ok) {
      return {
        success: false,
        code: normalizedCode,
        error: "TRACKING_FAILED",
        message: `Consulta Correios falhou com HTTP ${response.status}.`,
      };
    }

    const payload = (await readJson(response)) as TrackingResponse | undefined;
    const object = payload?.objetos?.find((item) => item.codObjeto === normalizedCode) ?? payload?.objetos?.[0];
    if (!object) {
      return {
        success: false,
        code: normalizedCode,
        error: "TRACKING_NOT_FOUND",
        message: "A resposta dos Correios não contém eventos para este objeto.",
      };
    }

    const events = summarizeEvents(object.eventos ?? []);
    const latestEvent = events[0];
    return {
      success: true,
      code: object.codObjeto ?? normalizedCode,
      status: latestEvent?.description ?? null,
      lastEventAt: latestEvent?.occurredAt ?? null,
      lastLocation: latestEvent?.location ?? null,
      events,
      source: "correios_api_rastro",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const credentialsMissing = message.startsWith("Missing required environment variable:");
    const authFailure = message.includes("token request failed");
    return {
      success: false,
      code: normalizedCode,
      error: credentialsMissing ? "CREDENTIALS_REQUIRED" : authFailure ? "AUTHENTICATION_FAILED" : "TRACKING_FAILED",
      message: credentialsMissing
        ? "Configure as variáveis de acesso locais exigidas para a API dos Correios."
        : authFailure
          ? "Não foi possível autenticar na API dos Correios. Confira o código de acesso, contrato/cartão e permissões."
          : `Não foi possível consultar os Correios: ${message}`,
    };
  }
}

async function runCli(): Promise<void> {
  const code = process.argv[2];
  if (!code) {
    process.stderr.write("Uso: node --experimental-strip-types backend/src/integrations/_spikes/correios-tracking.ts <codigo-rastreio>\n");
    process.exitCode = 2;
    return;
  }

  const result = await lookupCorreiosTracking(code);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.success) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
