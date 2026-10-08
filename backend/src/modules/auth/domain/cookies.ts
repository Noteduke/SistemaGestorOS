import type { ConfigService } from "@nestjs/config";
import type { CookieOptions, Request, Response } from "express";
import { AUTH_COOKIE_NAME, PRE_AUTH_COOKIE_NAME, PRE_AUTH_CSRF_TTL_MS, SESSION_IDLE_TIMEOUT_MS } from "../auth.constants.js";

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function writeSessionCookie(response: Response, token: string, config: ConfigService): void {
  response.cookie(cookieName(config, AUTH_COOKIE_NAME), token, {
    ...baseCookieOptions(config),
    maxAge: SESSION_IDLE_TIMEOUT_MS,
  });
}

export function clearSessionCookie(response: Response, config: ConfigService): void {
  response.clearCookie(cookieName(config, AUTH_COOKIE_NAME), baseCookieOptions(config));
}

export function writePreAuthCookie(response: Response, token: string, config: ConfigService): void {
  response.cookie(cookieName(config, PRE_AUTH_COOKIE_NAME), token, {
    ...baseCookieOptions(config),
    maxAge: PRE_AUTH_CSRF_TTL_MS,
  });
}

export function clearPreAuthCookie(response: Response, config: ConfigService): void {
  response.clearCookie(cookieName(config, PRE_AUTH_COOKIE_NAME), baseCookieOptions(config));
}

export function readSessionCookie(request: Request, config: ConfigService): string | null {
  return readCookie(request, cookieName(config, AUTH_COOKIE_NAME));
}

export function readPreAuthCookie(request: Request, config: ConfigService): string | null {
  return readCookie(request, cookieName(config, PRE_AUTH_COOKIE_NAME));
}

function cookieName(config: ConfigService, fallback: string): string {
  const key = fallback === AUTH_COOKIE_NAME ? "AUTH_SESSION_COOKIE_NAME" : "AUTH_PREAUTH_COOKIE_NAME";
  return config.get<string>(key)?.trim() || fallback;
}

function baseCookieOptions(config: ConfigService): CookieOptions {
  const configuredSecure = config.get<string>("AUTH_COOKIE_SECURE");
  const secure = configuredSecure === undefined
    ? config.get<string>("NODE_ENV") === "production"
    : configuredSecure.toLowerCase() === "true";
  const sameSiteValue = (config.get<string>("AUTH_COOKIE_SAME_SITE") ?? "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(sameSiteValue)) {
    throw new Error("AUTH_COOKIE_SAME_SITE deve ser lax, strict ou none.");
  }
  if (sameSiteValue === "none" && !secure) {
    throw new Error("AUTH_COOKIE_SECURE deve ser true quando AUTH_COOKIE_SAME_SITE=none.");
  }

  return {
    httpOnly: true,
    secure,
    sameSite: sameSiteValue as CookieOptions["sameSite"],
    path: "/",
  };
}
