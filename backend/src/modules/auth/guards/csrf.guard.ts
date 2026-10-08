import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service.js";
import { IS_PUBLIC_KEY, PRE_AUTH_CSRF_KEY } from "../decorators/auth-metadata.js";
import { readPreAuthCookie, readSessionCookie } from "../domain/cookies.js";
import { deriveSessionCsrfToken, hashSha256, safeHashEquals, safeValueEquals } from "../domain/security-crypto.js";
import type { AuthRequest } from "../auth.types.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPreAuthCsrf = this.reflector.getAllAndOverride<boolean>(PRE_AUTH_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const candidate = headerValue(request.headers["x-csrf-token"]);
    if (!candidate) throw csrfRejected();

    if (isPublic) {
      if (!isPreAuthCsrf) throw csrfRejected();
      const contextToken = readPreAuthCookie(request, this.config);
      if (!contextToken) throw csrfRejected();
      const preAuth = await this.prisma.preAuthCsrfContext.findUnique({
        where: { identifierHash: hashSha256(contextToken) },
      });
      if (!preAuth || preAuth.usedAt || preAuth.expiresAt <= new Date() || !safeHashEquals(preAuth.csrfTokenHash, candidate)) {
        throw csrfRejected();
      }
      request.preAuthCsrfContextId = preAuth.id;
      return true;
    }

    if (!request.auth) throw csrfRejected();
    const sessionSecret = readSessionCookie(request, this.config);
    if (!sessionSecret) throw csrfRejected();
    const expected = deriveSessionCsrfToken(sessionSecret, request.auth.sessionId);
    if (!safeHashEquals(request.auth.sessionCsrfTokenHash, expected) || !safeValueEquals(expected, candidate)) {
      throw csrfRejected();
    }
    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return Array.isArray(value) && value.length === 1 ? value[0] : null;
}

function csrfRejected(): ForbiddenException {
  return new ForbiddenException({ code: "CSRF_TOKEN_INVALID", message: "Token CSRF ausente ou inválido." });
}
