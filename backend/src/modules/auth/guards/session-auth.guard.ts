import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service.js";
import { AUTH_COOKIE_NAME, SESSION_IDLE_TIMEOUT_MS } from "../auth.constants.js";
import { IS_PUBLIC_KEY } from "../decorators/auth-metadata.js";
import { readSessionCookie, writeSessionCookie } from "../domain/cookies.js";
import { hashSha256 } from "../domain/security-crypto.js";
import type { AuthRequest } from "../auth.types.js";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const secret = readSessionCookie(request, this.config);
    if (!secret) throw unauthorized();

    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: hashSha256(secret) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
      throw unauthorized();
    }

    const expiresAt = new Date(now.getTime() + SESSION_IDLE_TIMEOUT_MS);
    const refreshed = await this.prisma.userSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastUsedAt: now, expiresAt },
    });
    if (refreshed.count !== 1) throw unauthorized();

    request.auth = {
      id: session.user.id,
      publicId: session.user.publicId,
      username: session.user.username,
      isAdmin: session.user.isAdmin,
      sessionId: session.id,
      sessionExpiresAt: expiresAt,
      sessionCsrfTokenHash: session.csrfTokenHash,
    };
    const response = context.switchToHttp().getResponse<Response>();
    writeSessionCookie(response, secret, this.config);
    return true;
  }
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Autenticação necessária ou sessão expirada." });
}
