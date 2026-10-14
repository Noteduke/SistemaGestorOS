import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";

export const EDIT_CONTROL_TTL_MS = 10 * 60 * 1000;
export const EDIT_CONTROL_HEARTBEAT_SECONDS = 60;
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 10_000 } as const;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EDIT_CAPABILITIES = ["service_orders.update", "service_orders.situation.update", "service_orders.assignment.manage", "service_orders.budget.update"];
type Tx = Prisma.TransactionClient;

function invalidPublicId(): BadRequestException { return new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." }); }
function missingToken(): BadRequestException { return new BadRequestException({ code: "SERVICE_ORDER_EDIT_CONTEXT_REQUIRED", message: "O contexto de edição desta OS é obrigatório." }); }
function notFound(): NotFoundException { return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." }); }
function tokenHash(token: string | undefined): string {
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(token)) throw missingToken();
  return createHash("sha256").update(token).digest("hex");
}

async function lockOrder(tx: Tx, publicId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_orders WHERE public_id = ${publicId} FOR UPDATE`;
  if (!rows[0]) throw notFound();
  const confirmed = await tx.serviceOrder.findFirst({ where: { id: rows[0].id, opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } }, select: { id: true } });
  if (!confirmed) throw notFound();
  return rows[0].id;
}

async function requireEditable(tx: Tx, actor: AuthenticatedUser): Promise<void> {
  if (actor.isAdmin) return;
  const grants = await tx.userPermission.findMany({ where: { userId: actor.id, permission: { code: { in: EDIT_CAPABILITIES } } }, select: { permission: { select: { code: true } } } });
  if (!grants.length) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para editar esta OS." });
}

async function lockRow(tx: Tx, serviceOrderId: number) {
  const rows = await tx.$queryRaw<Array<{
    id: number;
    holderUserId: number | null;
    contextTokenHash: string | null;
    leaseVersion: number;
    lastHeartbeatAt: Date;
    expiresAt: Date;
    holderPublicId: string | null;
    holderUsername: string | null;
  }>>`
    SELECT control.id,
      control.holder_user_id AS holderUserId,
      control.context_token_hash AS contextTokenHash,
      control.lease_version AS leaseVersion,
      control.last_heartbeat_at AS lastHeartbeatAt,
      control.expires_at AS expiresAt,
      holder.public_id AS holderPublicId,
      holder.username AS holderUsername
    FROM service_order_edit_controls AS control
    LEFT JOIN users AS holder ON holder.id = control.holder_user_id
    WHERE control.service_order_id = ${serviceOrderId}
    FOR UPDATE`;
  const current = rows[0];
  if (!current) return null;
  return {
    ...current,
    holder: current.holderPublicId && current.holderUsername
      ? { publicId: current.holderPublicId, username: current.holderUsername }
      : null,
  };
}

function controlConflict(control: { holder: { publicId: string; username: string } | null; expiresAt: Date }): ConflictException {
  return new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_HELD", message: `Esta OS está sendo editada por ${control.holder?.username ?? "outro usuário"}.`, details: { holder: control.holder, expiresAt: control.expiresAt } });
}

export async function assertEditControlInTransaction(tx: Tx, serviceOrderId: number, actor: AuthenticatedUser, token: string | undefined): Promise<void> {
  const hash = tokenHash(token);
  const control = await lockRow(tx, serviceOrderId);
  const now = new Date();
  if (!control || control.expiresAt <= now || control.holderUserId !== actor.id || control.contextTokenHash !== hash) {
    throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_LOST", message: "O controle desta OS foi transferido para outro contexto. A tela foi alterada para somente leitura.", details: control && control.expiresAt > now ? { holder: control.holder, expiresAt: control.expiresAt } : { holder: null, expiresAt: null } });
  }
}

@Injectable()
export class ServiceOrderEditControlService {
  constructor(private readonly prisma: PrismaService) {}

  async state(publicId: string, actor: AuthenticatedUser, token?: string) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = token ? tokenHash(token) : null;
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { publicId, opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } }, select: { id: true } });
      if (!order) throw notFound();
      const control = await tx.serviceOrderEditControl.findUnique({ where: { serviceOrderId: order.id }, include: { holder: { select: { publicId: true, username: true } } } });
      const active = control && control.holderUserId !== null && control.contextTokenHash !== null && control.expiresAt > new Date() ? control : null;
      const isHolder = Boolean(active && active.holderUserId === actor.id && hash && active.contextTokenHash === hash);
      return { data: { held: Boolean(active), holder: active?.holder ?? null, isSameUser: Boolean(active && active.holderUserId === actor.id), expiresAt: active?.expiresAt.toISOString() ?? null, isCurrentContext: isHolder, generation: control?.leaseVersion ?? 0, heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
    }, TX_OPTIONS);
  }

  async acquire(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      await requireEditable(tx, actor);
      const current = await lockRow(tx, serviceOrderId);
      const now = new Date();
      if (current && current.holderUserId !== null && current.contextTokenHash !== null && current.expiresAt > now) {
        if (current.holderUserId !== actor.id || current.contextTokenHash !== hash) throw controlConflict(current);
        const updated = await tx.serviceOrderEditControl.update({ where: { id: current.id }, data: { lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
        return { data: { acquired: true, expiresAt: updated.expiresAt.toISOString(), heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
      }
      const control = current
        ? await tx.serviceOrderEditControl.update({ where: { id: current.id }, data: { holderUserId: actor.id, contextTokenHash: hash, leaseVersion: { increment: 1 }, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } })
        : await tx.serviceOrderEditControl.create({ data: { serviceOrderId, holderUserId: actor.id, contextTokenHash: hash, leaseVersion: 1, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
      return { data: { acquired: true, expiresAt: control.expiresAt.toISOString(), generation: control.leaseVersion, heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
    }, TX_OPTIONS);
  }

  async heartbeat(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      await requireEditable(tx, actor);
      const control = await lockRow(tx, serviceOrderId);
      const now = new Date();
      if (!control || control.expiresAt <= now || control.holderUserId !== actor.id || control.contextTokenHash !== hash) {
        throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_LOST", message: "O controle de edição desta OS foi perdido para outro contexto." });
      }
      const updated = await tx.serviceOrderEditControl.update({ where: { id: control.id }, data: { lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
      return { data: { renewed: true, expiresAt: updated.expiresAt.toISOString() } };
    }, TX_OPTIONS);
  }

  async release(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      const control = await lockRow(tx, serviceOrderId);
      if (!control || control.holderUserId !== actor.id || control.contextTokenHash !== hash) return { data: { released: false } };
      await tx.serviceOrderEditControl.update({ where: { id: control.id }, data: { holderUserId: null, contextTokenHash: null, leaseVersion: { increment: 1 }, expiresAt: new Date() } });
      return { data: { released: true } };
    }, TX_OPTIONS);
  }

  async takeover(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      await requireEditable(tx, actor);
      const current = await lockRow(tx, serviceOrderId);
      const now = new Date();
      if (!current || current.holderUserId === null || current.contextTokenHash === null || current.expiresAt <= now) {
        throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_NOT_HELD", message: "Não há outro contexto ativo para transferir. A OS pode ser adquirida normalmente." });
      }
      if (current.holderUserId === actor.id && current.contextTokenHash === hash) {
        throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_ALREADY_OWNED", message: "Esta aba já possui o controle de edição da OS." });
      }
      const transferringOwnContext = current.holderUserId === actor.id;
      if (!transferringOwnContext && !actor.isAdmin) {
        const grant = await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.edit.takeover" } }, select: { userId: true } });
        if (!grant) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para assumir a edição desta OS." });
      }
      const next = current
        ? await tx.serviceOrderEditControl.update({ where: { id: current.id }, data: { holderUserId: actor.id, contextTokenHash: hash, leaseVersion: { increment: 1 }, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } })
        : await tx.serviceOrderEditControl.create({ data: { serviceOrderId, holderUserId: actor.id, contextTokenHash: hash, leaseVersion: 1, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
      if (!transferringOwnContext) {
        await tx.adminAuditLog.create({
          data: {
            eventCode: "SERVICE_ORDER_EDIT_TAKEOVER",
            occurredAt: now,
            actorUserId: actor.id,
            targetUserId: current.holderUserId,
            detailsJson: {
              action: "TRANSFER_SERVICE_ORDER_EDIT_CONTROL",
              serviceOrderPublicId: publicId,
              previousEditor: { publicId: current.holderPublicId, username: current.holderUsername, contextGeneration: current.leaseVersion },
              newEditor: { publicId: actor.publicId, username: actor.username, contextGeneration: next.leaseVersion },
            },
          },
        });
      }
      return { data: { acquired: true, expiresAt: next.expiresAt.toISOString(), generation: next.leaseVersion, heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
    }, TX_OPTIONS);
  }
}
