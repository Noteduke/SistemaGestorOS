import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";

export const EDIT_CONTROL_TTL_MS = 10 * 60 * 1000;
export const EDIT_CONTROL_HEARTBEAT_SECONDS = 60;
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 10_000 } as const;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EDIT_CAPABILITIES = ["service_orders.update", "service_orders.situation.update", "service_orders.assignment.manage", "service_orders.budget.update", "os.close", "os.cancel"];
type Tx = Prisma.TransactionClient;

function invalidPublicId(): BadRequestException { return new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." }); }
function missingToken(): BadRequestException { return new BadRequestException({ code: "SERVICE_ORDER_EDIT_CONTEXT_REQUIRED", message: "O contexto de edição desta OS é obrigatório." }); }
function notFound(): NotFoundException { return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." }); }
function tokenHash(token: string | undefined): string {
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(token)) throw missingToken();
  return createHash("sha256").update(token).digest("hex");
}

async function lockOrder(tx: Tx, publicId: string, allowNonOpen = false): Promise<number> {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_orders WHERE public_id = ${publicId} FOR UPDATE`;
  if (!rows[0]) throw notFound();
  const confirmed = await tx.serviceOrder.findFirst({ where: { id: rows[0].id, opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } }, select: { id: true } });
  if (!confirmed) throw notFound();
  const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: confirmed.id }, select: { macroStatus: true } });
  if (!allowNonOpen && order.macroStatus !== "OPEN") throw orderNotOpen();
  return rows[0].id;
}

function orderNotOpen(): ConflictException {
  return new ConflictException({ code: "SERVICE_ORDER_NOT_OPEN", message: "Esta OS não está aberta e permanece somente para leitura." });
}

async function assertActiveSession(tx: Tx, actor: AuthenticatedUser): Promise<void> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM user_sessions
    WHERE id = ${actor.sessionId} AND user_id = ${actor.id}
      AND revoked_at IS NULL AND expires_at > ${new Date()}
    FOR UPDATE`;
  if (!rows[0]) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sessão inválida." });
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
    holderSessionId: number | null;
    contextTokenHash: string | null;
    leaseVersion: number;
    lastHeartbeatAt: Date;
    expiresAt: Date;
    holderPublicId: string | null;
    holderUsername: string | null;
  }>>`
    SELECT control.id,
      control.holder_user_id AS holderUserId,
      control.holder_session_id AS holderSessionId,
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
  await assertActiveSession(tx, actor);
  const order = await tx.serviceOrder.findUnique({ where: { id: serviceOrderId }, select: { macroStatus: true } });
  if (!order || order.macroStatus !== "OPEN") throw orderNotOpen();
  const control = await lockRow(tx, serviceOrderId);
  const now = new Date();
  if (!control || control.expiresAt <= now || control.holderUserId !== actor.id || control.holderSessionId !== actor.sessionId || control.contextTokenHash !== hash) {
    throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_LOST", message: "O controle desta OS foi transferido para outro contexto. A tela foi alterada para somente leitura.", details: control && control.expiresAt > now ? { holder: control.holder, expiresAt: control.expiresAt } : { holder: null, expiresAt: null } });
  }
}

export function assertServiceOrderRevision(currentUpdatedAt: Date, expectedRevision?: string): void {
  if (!expectedRevision) {
    throw new BadRequestException({ code: "SERVICE_ORDER_REVISION_REQUIRED", message: "A revisão atual da OS é obrigatória para salvar." });
  }
  const revision = new Date(expectedRevision);
  if (!Number.isFinite(revision.getTime())) {
    throw new BadRequestException({ code: "INVALID_SERVICE_ORDER_REVISION", message: "A revisão informada da OS é inválida." });
  }
  if (revision.getTime() !== currentUpdatedAt.getTime()) {
    throw new ConflictException({ code: "SERVICE_ORDER_DATA_CONFLICT", message: "Os dados desta OS foram modificados depois da revisão lida. Consulte os dados atuais e reaplique manualmente as alterações antes de salvar.", details: { currentUpdatedAt: currentUpdatedAt.toISOString() } });
  }
}

export async function advanceServiceOrderRevision(tx: Tx, serviceOrderId: number, currentUpdatedAt: Date, data: Prisma.ServiceOrderUpdateInput = {}): Promise<Date> {
  const next = new Date(Math.max(Date.now(), currentUpdatedAt.getTime() + 1));
  await tx.serviceOrder.update({ where: { id: serviceOrderId }, data: { ...data, updatedAt: next } });
  return next;
}

@Injectable()
export class ServiceOrderEditControlService {
  constructor(private readonly prisma: PrismaService) {}

  async state(publicId: string, actor: AuthenticatedUser, token?: string) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = token ? tokenHash(token) : null;
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { publicId, opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } }, select: { id: true, macroStatus: true } });
      if (!order) throw notFound();
      const control = await tx.serviceOrderEditControl.findUnique({ where: { serviceOrderId: order.id }, include: { holder: { select: { publicId: true, username: true } } } });
      const now = new Date();
      const editable = order.macroStatus === "OPEN";
      const active = editable && control && control.holderUserId !== null && control.contextTokenHash !== null && control.expiresAt > now ? control : null;
      const isHolder = Boolean(active && active.holderUserId === actor.id && active.holderSessionId === actor.sessionId && hash && active.contextTokenHash === hash);
      const currentContextExpired = Boolean(editable && control && control.holderUserId === actor.id && control.holderSessionId === actor.sessionId && hash && control.contextTokenHash === hash && control.expiresAt <= now);
      return { data: { orderEditable: editable, held: Boolean(active), holder: active?.holder ?? null, isSameUser: Boolean(active && active.holderUserId === actor.id), expiresAt: active?.expiresAt.toISOString() ?? null, isCurrentContext: isHolder, currentContextExpired, generation: control?.leaseVersion ?? 0, heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
    }, TX_OPTIONS);
  }

  async acquire(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      await assertActiveSession(tx, actor);
      await requireEditable(tx, actor);
      const current = await lockRow(tx, serviceOrderId);
      const now = new Date();
      if (current && current.holderUserId !== null && current.contextTokenHash !== null && current.expiresAt > now) {
        if (current.holderUserId !== actor.id || current.holderSessionId !== actor.sessionId || current.contextTokenHash !== hash) throw controlConflict(current);
        const updated = await tx.serviceOrderEditControl.update({ where: { id: current.id }, data: { lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
        return { data: { acquired: true, expiresAt: updated.expiresAt.toISOString(), heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
      }
      if (current && current.holderUserId === actor.id && current.holderSessionId === actor.sessionId && current.contextTokenHash === hash && current.expiresAt <= now) {
        throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTEXT_EXPIRED", message: "Este contexto de edição expirou. Inicie um novo controle de edição." });
      }
      const control = current
        ? await tx.serviceOrderEditControl.update({ where: { id: current.id }, data: { holderUserId: actor.id, holderSessionId: actor.sessionId, contextTokenHash: hash, leaseVersion: { increment: 1 }, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } })
        : await tx.serviceOrderEditControl.create({ data: { serviceOrderId, holderUserId: actor.id, holderSessionId: actor.sessionId, contextTokenHash: hash, leaseVersion: 1, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
      return { data: { acquired: true, expiresAt: control.expiresAt.toISOString(), generation: control.leaseVersion, heartbeatIntervalSeconds: EDIT_CONTROL_HEARTBEAT_SECONDS } };
    }, TX_OPTIONS);
  }

  async heartbeat(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      await assertActiveSession(tx, actor);
      await requireEditable(tx, actor);
      const control = await lockRow(tx, serviceOrderId);
      const now = new Date();
      if (!control || control.expiresAt <= now || control.holderUserId !== actor.id || control.holderSessionId !== actor.sessionId || control.contextTokenHash !== hash) {
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
      const serviceOrderId = await lockOrder(tx, publicId, true);
      const control = await lockRow(tx, serviceOrderId);
      if (!control || control.holderUserId !== actor.id || control.holderSessionId !== actor.sessionId || control.contextTokenHash !== hash) return { data: { released: false } };
      await tx.serviceOrderEditControl.update({ where: { id: control.id }, data: { holderUserId: null, holderSessionId: null, contextTokenHash: null, leaseVersion: { increment: 1 }, expiresAt: new Date() } });
      return { data: { released: true } };
    }, TX_OPTIONS);
  }

  async takeover(publicId: string, token: string | undefined, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalidPublicId();
    const hash = tokenHash(token);
    return this.prisma.$transaction(async (tx) => {
      const serviceOrderId = await lockOrder(tx, publicId);
      await assertActiveSession(tx, actor);
      await requireEditable(tx, actor);
      const current = await lockRow(tx, serviceOrderId);
      const now = new Date();
      if (!current || current.holderUserId === null || current.contextTokenHash === null || current.expiresAt <= now) {
        throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_NOT_HELD", message: "Não há outro contexto ativo para transferir. A OS pode ser adquirida normalmente." });
      }
      if (current.holderUserId === actor.id && current.holderSessionId === actor.sessionId && current.contextTokenHash === hash) {
        throw new ConflictException({ code: "SERVICE_ORDER_EDIT_CONTROL_ALREADY_OWNED", message: "Esta aba já possui o controle de edição da OS." });
      }
      const transferringOwnContext = current.holderUserId === actor.id;
      if (!transferringOwnContext && !actor.isAdmin) {
        const grant = await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.edit.takeover" } }, select: { userId: true } });
        if (!grant) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para assumir a edição desta OS." });
      }
      const next = current
        ? await tx.serviceOrderEditControl.update({ where: { id: current.id }, data: { holderUserId: actor.id, holderSessionId: actor.sessionId, contextTokenHash: hash, leaseVersion: { increment: 1 }, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } })
        : await tx.serviceOrderEditControl.create({ data: { serviceOrderId, holderUserId: actor.id, holderSessionId: actor.sessionId, contextTokenHash: hash, leaseVersion: 1, lastHeartbeatAt: now, expiresAt: new Date(now.getTime() + EDIT_CONTROL_TTL_MS) } });
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
