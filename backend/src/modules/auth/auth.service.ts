import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AUTH_AUDIT_EVENT, PRE_AUTH_CSRF_TTL_MS, SESSION_IDLE_TIMEOUT_MS } from "./auth.constants.js";
import type { AuthenticatedUser } from "./auth.types.js";
import { clearPreAuthCookie, clearSessionCookie, readSessionCookie, writePreAuthCookie, writeSessionCookie } from "./domain/cookies.js";
import { createOpaqueToken, deriveSessionCsrfToken, hashSha256, safeHashEquals } from "./domain/security-crypto.js";
import { isValidUsername, normalizeUsername } from "./domain/username.js";
import type { LoginInput } from "./dto/auth.dto.js";
import { AuthPolicyService } from "./auth-policy.service.js";

const FAILURE_THRESHOLD = 5;
const GENERIC_LOGIN_FAILURE = {
  code: "INVALID_CREDENTIALS",
  message: "Usuário ou senha inválidos.",
};

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly policy: AuthPolicyService,
  ) {}

  async createPreAuthCsrf(request: Request, response: Response) {
    const identifier = createOpaqueToken();
    const token = createOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PRE_AUTH_CSRF_TTL_MS);
    await this.prisma.preAuthCsrfContext.create({
      data: {
        identifierHash: hashSha256(identifier),
        csrfTokenHash: hashSha256(token),
        createdAt: now,
        expiresAt,
        ...requestAuditFields(request),
      },
    });
    writePreAuthCookie(response, identifier, this.config);
    return { data: { csrfToken: token, expiresAt } };
  }

  async login(input: LoginInput, request: Request, response: Response, preAuthContextId?: number) {
    const username = normalizeUsername(input.username);
    const validUsername = isValidUsername(username);
    const attemptedUsername = username.length > 0 && username.length <= 50 ? username : null;
    const user = validUsername
      ? await this.prisma.user.findUnique({ where: { username } })
      : null;

    if (!user) {
      await argon2.verify(await this.dummyPasswordHash, input.password).catch(() => false);
      await this.recordUnknownFailure(attemptedUsername, request);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    const passwordMatches = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!passwordMatches) {
      await this.recordKnownFailure(user.id, username, request);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }
    if (!user.isActive) {
      await this.recordInactiveLogin(user.id, username, request);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }
    if (!preAuthContextId) {
      throw new ForbiddenException({ code: "CSRF_TOKEN_INVALID", message: "Contexto CSRF pré-login ausente ou inválido." });
    }

    const rawSessionSecret = createOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_IDLE_TIMEOUT_MS);
    const metadata = requestAuditFields(request);
    const result = await this.prisma.$transaction(async (tx) => {
      const consumedContext = await tx.preAuthCsrfContext.updateMany({
        where: { id: preAuthContextId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumedContext.count !== 1) {
        throw new ForbiddenException({ code: "CSRF_TOKEN_INVALID", message: "Contexto CSRF pré-login expirado ou já utilizado." });
      }

      const activeUser = await tx.user.updateMany({
        where: { id: user.id, isActive: true },
        data: { consecutiveFailedLoginCount: 0, lastLoginAt: now },
      });
      if (activeUser.count !== 1) throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);

      const session = await tx.userSession.create({
        data: {
          userId: user.id,
          tokenHash: hashSha256(rawSessionSecret),
          csrfTokenHash: "0".repeat(64),
          createdAt: now,
          lastUsedAt: now,
          expiresAt,
          ...metadata,
        },
      });
      const csrfToken = deriveSessionCsrfToken(rawSessionSecret, session.id);
      await tx.userSession.update({
        where: { id: session.id },
        data: { csrfTokenHash: hashSha256(csrfToken) },
      });
      await tx.adminAuditLog.create({
        data: {
          eventCode: AUTH_AUDIT_EVENT.LOGIN_SUCCEEDED,
          occurredAt: now,
          actorUserId: user.id,
          targetUserId: user.id,
          attemptedUsername: username,
          ...metadata,
        },
      });
      return { sessionId: session.id, csrfToken };
    });

    clearPreAuthCookie(response, this.config);
    writeSessionCookie(response, rawSessionSecret, this.config);
    const authenticatedUser = {
      id: user.id,
      publicId: user.publicId,
      username: user.username,
      isAdmin: user.isAdmin,
    };
    return {
      data: {
        publicId: authenticatedUser.publicId,
        username: authenticatedUser.username,
        isAdmin: authenticatedUser.isAdmin,
        permissions: await this.policy.effectivePermissions(authenticatedUser),
        csrfToken: result.csrfToken,
        session: { expiresAt },
      },
    };
  }

  async logout(user: AuthenticatedUser, response: Response, request: Request): Promise<void> {
    const now = new Date();
    const metadata = requestAuditFields(request);
    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.updateMany({
        where: { id: user.sessionId, userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.adminAuditLog.create({
        data: {
          eventCode: AUTH_AUDIT_EVENT.LOGOUT,
          occurredAt: now,
          actorUserId: user.id,
          targetUserId: user.id,
          ...metadata,
        },
      });
    });
    clearSessionCookie(response, this.config);
  }

  async currentIdentity(user: AuthenticatedUser, request: Request) {
    const rawSessionSecret = readSessionCookie(request, this.config);
    if (!rawSessionSecret) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sessão inválida." });
    const csrfToken = deriveSessionCsrfToken(rawSessionSecret, user.sessionId);
    if (!safeHashEquals(user.sessionCsrfTokenHash, csrfToken)) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sessão inválida." });
    }
    return {
      data: {
        publicId: user.publicId,
        username: user.username,
        isAdmin: user.isAdmin,
        permissions: await this.policy.effectivePermissions(user),
        csrfToken,
        session: { expiresAt: user.sessionExpiresAt },
      },
    };
  }

  async bootstrapFirstAdmin(usernameInput: string, password: string): Promise<void> {
    const username = normalizeUsername(usernameInput);
    if (!isValidUsername(username)) {
      throw new Error("Username inválido; use 3 a 50 caracteres: letras minúsculas, números, ponto, hífen ou underline.");
    }
    if (password.length < 10 || password.length > 4096) {
      throw new Error("A senha deve ter entre 10 e 4096 caracteres.");
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const activeAdmins = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id
        FROM users FORCE INDEX (users_is_admin_is_active_idx)
        WHERE is_admin = 1 AND is_active = 1
        FOR UPDATE
      `;
      if (activeAdmins.length > 0) throw new Error("Já existe Administrador ativo; o bootstrap foi cancelado.");

      const existingUsername = await tx.user.findUnique({ where: { username }, select: { id: true } });
      if (existingUsername) throw new Error("Este username já existe; o bootstrap foi cancelado.");

      const user = await tx.user.create({
        data: { username, passwordHash, isAdmin: true, isActive: true },
        select: { id: true },
      });
      await tx.adminAuditLog.create({
        data: {
          eventCode: AUTH_AUDIT_EVENT.FIRST_ADMIN_BOOTSTRAPPED,
          occurredAt: now,
          targetUserId: user.id,
          attemptedUsername: username,
          detailsJson: { source: "controlled_bootstrap" },
        },
      });
    }, {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 15_000,
    });
  }

  private async recordKnownFailure(userId: number, username: string, request: Request): Promise<void> {
    const now = new Date();
    const metadata = requestAuditFields(request);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, isActive: true },
        data: { consecutiveFailedLoginCount: { increment: 1 } },
      });
      if (updated.count !== 1) {
        await tx.adminAuditLog.create({
          data: { eventCode: "LOGIN_REJECTED_INACTIVE_USER", occurredAt: now, targetUserId: userId, attemptedUsername: username, ...metadata },
        });
        return;
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { consecutiveFailedLoginCount: true } });
      await tx.adminAuditLog.create({
        data: {
          eventCode: AUTH_AUDIT_EVENT.LOGIN_FAILED,
          occurredAt: now,
          targetUserId: userId,
          attemptedUsername: username,
          ...metadata,
        },
      });
      if (user.consecutiveFailedLoginCount === FAILURE_THRESHOLD) {
        await tx.adminAuditLog.create({
          data: {
            eventCode: AUTH_AUDIT_EVENT.LOGIN_FAILURE_THRESHOLD_REACHED,
            occurredAt: now,
            targetUserId: userId,
            attemptedUsername: username,
            detailsJson: { consecutiveFailures: FAILURE_THRESHOLD },
            ...metadata,
          },
        });
      }
    });
  }

  private async recordUnknownFailure(username: string | null, request: Request): Promise<void> {
    const now = new Date();
    const metadata = requestAuditFields(request);
    if (!username) {
      await this.prisma.adminAuditLog.create({
        data: { eventCode: AUTH_AUDIT_EVENT.LOGIN_FAILED, occurredAt: now, ...metadata },
      });
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: number }>>`
            SELECT id
            FROM admin_audit_log FORCE INDEX (admin_audit_log_attempted_username_occurred_at_idx)
            WHERE attempted_username = ${username}
            FOR UPDATE
          `;
          const previousFailures = await tx.adminAuditLog.count({
            where: { attemptedUsername: username, eventCode: AUTH_AUDIT_EVENT.LOGIN_FAILED },
          });
          await tx.adminAuditLog.create({
            data: {
              eventCode: AUTH_AUDIT_EVENT.LOGIN_FAILED,
              occurredAt: now,
              attemptedUsername: username,
              detailsJson: { accountKnown: false },
              ...metadata,
            },
          });
          if (previousFailures + 1 === FAILURE_THRESHOLD) {
            await tx.adminAuditLog.create({
              data: {
                eventCode: AUTH_AUDIT_EVENT.LOGIN_FAILURE_THRESHOLD_REACHED,
                occurredAt: now,
                attemptedUsername: username,
                detailsJson: { consecutiveFailures: FAILURE_THRESHOLD, accountKnown: false },
                ...metadata,
              },
            });
          }
        }, {
          isolationLevel: "Serializable",
          maxWait: 10_000,
          timeout: 15_000,
        });
        return;
      } catch (error) {
        if (!isTransactionConflict(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }

  private async recordInactiveLogin(userId: number, username: string, request: Request): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        eventCode: "LOGIN_REJECTED_INACTIVE_USER",
        occurredAt: new Date(),
        targetUserId: userId,
        attemptedUsername: username,
        ...requestAuditFields(request),
      },
    });
  }
}

function isTransactionConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "P2034";
}

function requestAuditFields(request: Request) {
  const userAgentHeader = request.headers["user-agent"];
  const originHeader = request.headers.origin;
  return {
    ipAddress: request.socket.remoteAddress?.slice(0, 45) ?? null,
    origin: typeof originHeader === "string" ? originHeader.slice(0, 2048) : null,
    userAgent: (typeof userAgentHeader === "string" ? userAgentHeader : null)?.slice(0, 4096) ?? null,
  };
}
