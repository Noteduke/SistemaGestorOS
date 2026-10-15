import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ServiceOrderBudgetItem } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { normalizeServiceName } from "../services/domain/service-name.js";
import type { CreateManualLaborInput, CreateManualPartInput, CreateRegisteredLaborInput, CreateStockPartInput, UpdateBudgetItemInput } from "./dto/budget-item.dto.js";
import { acquireCatalogNameLock } from "../../infrastructure/prisma/catalog-name-lock.js";
import { advanceServiceOrderRevision, assertEditControlInTransaction, assertServiceOrderRevision } from "./service-order-edit-control.service.js";
import { ServiceOrderStockApplicationsService } from "./service-order-stock-applications.service.js";
import type { RemoveBudgetItemInput } from "./dto/service-order-stock-application.dto.js";

type Tx = Prisma.TransactionClient;
const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 15_000 } as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const confirmedWhere = { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } } as const satisfies Prisma.ServiceOrderWhereInput;
const moneyMax = new Prisma.Decimal("999999.99");

function orderNotFound(): NotFoundException { return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." }); }
function itemNotFound(): NotFoundException { return new NotFoundException({ code: "BUDGET_ITEM_NOT_FOUND", message: "Item não encontrado nesta OS." }); }
function orderNotOpen(): ConflictException { return new ConflictException({ code: "SERVICE_ORDER_NOT_OPEN", message: "O orçamento só pode ser alterado enquanto a OS estiver aberta." }); }
function assertId(value: string): void { if (!uuidPattern.test(value)) throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." }); }
function decimal(value: string): Prisma.Decimal { return new Prisma.Decimal(value); }
function serializeDecimal(value: Prisma.Decimal): string { return value.toFixed(2); }

async function assertPermission(tx: Tx, actor: AuthenticatedUser, code: string): Promise<void> {
  if (actor.isAdmin) return;
  const grant = await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code } }, select: { userId: true } });
  if (!grant) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
}

async function canReadCosts(tx: Tx, actor: AuthenticatedUser): Promise<boolean> {
  if (actor.isAdmin) return true;
  return Boolean(await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.budget.costs.read" } }, select: { userId: true } }));
}

async function lockedOrder(tx: Tx, publicId: string) {
  const lock = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_orders WHERE public_id = ${publicId} FOR UPDATE`;
  if (!lock[0]) throw orderNotFound();
  const order = await tx.serviceOrder.findFirst({ where: { id: lock[0].id, ...confirmedWhere }, select: { id: true, publicId: true, numberValue: true, macroStatus: true, updatedAt: true } });
  if (!order) throw orderNotFound();
  if (order.macroStatus !== "OPEN") throw orderNotOpen();
  return order;
}

function total(items: Array<Pick<ServiceOrderBudgetItem, "quantity" | "unitPrice">>): Prisma.Decimal {
  return items.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));
}

function itemView(item: ServiceOrderBudgetItem, includeCosts: boolean, servicePublicId: string | null = null, productPublicId: string | null = null, stockApplication?: { appliedQuantity: number; applications: Array<Record<string, unknown>> }) {
  const lineTotal = item.unitPrice.mul(item.quantity);
  return {
    publicId: item.publicId, itemType: item.itemType, origin: item.origin, servicePublicId, productPublicId,
    description: item.description, quantity: item.quantity, unitPrice: serializeDecimal(item.unitPrice),
    total: serializeDecimal(lineTotal), version: item.version, createdAt: item.createdAt,
    ...(item.itemType === "STOCK_PART" ? { appliedQuantity: stockApplication?.appliedQuantity ?? 0, applications: stockApplication?.applications ?? [] } : {}),
    ...(includeCosts ? { unitCost: item.unitCost === null ? null : serializeDecimal(item.unitCost), totalCost: item.unitCost === null ? null : serializeDecimal(item.unitCost.mul(item.quantity)) } : {}),
  };
}

function mapWriteError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (isCode(error, "P2002")) throw new ConflictException({ code: "BUDGET_ITEM_DUPLICATE", message: "Já existe um item equivalente ativo nesta OS." });
  if (isCode(error, "P2003")) throw new ConflictException({ code: "BUDGET_ITEM_RESTRICTED", message: "A associação histórica impede esta exclusão." });
  if (isCode(error, "P2034") || isCode(error, "P2028") || isLockConflict(error) || error instanceof Error && error.message === "BUDGET_NAME_LOCK_TIMEOUT") {
    throw new ConflictException({ code: "BUDGET_CONCURRENCY_CONFLICT", message: "Outra operação alterou esta composição. Recarregue e tente novamente." });
  }
  throw error;
}
function isCode(error: unknown, code: string): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === code; }
function isLockConflict(error: unknown): boolean {
  if (!isCode(error, "P2010") || typeof error !== "object" || !error || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}

@Injectable()
export class ServiceOrderBudgetItemsService {
  constructor(private readonly prisma: PrismaService, private readonly stockApplications: ServiceOrderStockApplicationsService) {}

  async list(orderPublicId: string, actor: AuthenticatedUser) {
    assertId(orderPublicId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { ...confirmedWhere, publicId: orderPublicId }, select: { id: true } });
      if (!order) throw orderNotFound();
      const includeCosts = await canReadCosts(tx, actor);
      const items = await tx.serviceOrderBudgetItem.findMany({
        where: { serviceOrderId: order.id, removedAt: null }, orderBy: { id: "asc" },
        include: { serviceCatalog: { select: { publicId: true } }, product: { select: { publicId: true } } },
      });
      const stockSummaries = await this.stockApplications.listForItems(tx, order.id, items, actor);
      const data = items.map((item) => itemView(item, includeCosts, item.serviceCatalog?.publicId ?? null, item.product?.publicId ?? null, stockSummaries.get(item.id)));
      return { data, total: serializeDecimal(total(items)), canReadCosts: includeCosts };
    }, txOptions);
  }

  async availableServices(actor: AuthenticatedUser) {
    await this.prisma.$transaction((tx) => assertPermission(tx, actor, "service_orders.budget.update"), txOptions);
    const data = await this.prisma.serviceCatalog.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { publicId: true, name: true, defaultPrice: true } });
    return { data: data.map((service) => ({ publicId: service.publicId, name: service.name, defaultPrice: serializeDecimal(service.defaultPrice) })) };
  }

  async createRegistered(orderPublicId: string, input: CreateRegisteredLaborInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    assertId(orderPublicId); assertId(input.servicePublicId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockedOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertPermission(tx, actor, "service_orders.budget.update");
        const serviceLocks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_catalog WHERE public_id = ${input.servicePublicId} FOR UPDATE`;
        if (!serviceLocks[0]) throw new NotFoundException({ code: "SERVICE_NOT_FOUND", message: "Serviço não encontrado." });
        const service = await tx.serviceCatalog.findUniqueOrThrow({ where: { id: serviceLocks[0].id } });
        if (!service.isActive) throw new ConflictException({ code: "SERVICE_INACTIVE", message: "Reative o serviço para incluí-lo nesta OS." });
        const existing = await tx.serviceOrderBudgetItem.findFirst({ where: { serviceOrderId: order.id, serviceCatalogId: service.id, removedAt: null }, select: { publicId: true } });
        if (existing) throw duplicate(existing.publicId, "serviço cadastrado");
        const beforeRows = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { quantity: true, unitPrice: true } });
        const price = input.unitPrice === undefined ? service.defaultPrice : decimal(input.unitPrice);
        const item = await tx.serviceOrderBudgetItem.create({ data: {
          serviceOrderId: order.id, itemType: "SERVICE_LABOR", origin: "REGISTERED", serviceCatalogId: service.id,
          description: service.name, quantity: input.quantity, unitPrice: price, createdByUserId: actor.id, updatedByUserId: actor.id,
        } });
        const items = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { quantity: true, unitPrice: true } });
        await createEvent(tx, order.id, order.numberValue, actor.id, "ITEM_ORCAMENTO_CRIADO", item, [{ field: "item", before: null, after: snapshot(item) }], total(beforeRows), total(items));
        const serviceOrderUpdatedAt = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: itemView(item, await canReadCosts(tx, actor)), serviceOrderRevision: serviceOrderUpdatedAt.toISOString() };
      }, txOptions);
    } catch (error) { return mapWriteError(error); }
  }

  async createStockPart(orderPublicId: string, input: CreateStockPartInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    assertId(orderPublicId); assertId(input.productPublicId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockedOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertPermission(tx, actor, "service_orders.budget.update");
        const locks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE public_id = ${input.productPublicId} FOR UPDATE`;
        if (!locks[0]) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado." });
        const product = await tx.product.findUniqueOrThrow({ where: { id: locks[0].id } });
        if (!product.isActive) throw new ConflictException({ code: "PRODUCT_INACTIVE", message: "Ative o produto para incluí-lo nesta OS." });
        const existing = await tx.serviceOrderBudgetItem.findFirst({ where: { serviceOrderId: order.id, productId: product.id, removedAt: null }, select: { publicId: true } });
        if (existing) throw duplicate(existing.publicId, "peça do estoque");
        const unitPrice = input.unitPrice === undefined ? product.salePrice : decimal(input.unitPrice);
        if (unitPrice === null) throw new BadRequestException({ code: "PRODUCT_PRICE_REQUIRED", message: "Informe o valor unitário para incluir este produto no orçamento." });
        const beforeRows = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { quantity: true, unitPrice: true } });
        const item = await tx.serviceOrderBudgetItem.create({ data: {
          serviceOrderId: order.id, itemType: "STOCK_PART", origin: "PRODUCT_CATALOG", productId: product.id,
          description: product.description, normalizedDescription: null, quantity: input.quantity, unitPrice, unitCost: null,
          createdByUserId: actor.id, updatedByUserId: actor.id,
        } });
        const items = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { quantity: true, unitPrice: true } });
        await createEvent(tx, order.id, order.numberValue, actor.id, "ITEM_ORCAMENTO_CRIADO", item,
          [{ field: "item", before: null, after: snapshot(item, product.publicId) }], total(beforeRows), total(items), product.publicId);
        const serviceOrderUpdatedAt = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: itemView(item, await canReadCosts(tx, actor), null, product.publicId), serviceOrderRevision: serviceOrderUpdatedAt.toISOString() };
      }, txOptions);
    } catch (error) { return mapWriteError(error); }
  }

  async createManualLabor(orderPublicId: string, input: CreateManualLaborInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    return this.createManual(orderPublicId, input, actor, "SERVICE_LABOR", editToken, expectedRevision);
  }

  async createManualPart(orderPublicId: string, input: CreateManualPartInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    return this.createManual(orderPublicId, input, actor, "MANUAL_PART", editToken, expectedRevision);
  }

  private async createManual(orderPublicId: string, input: CreateManualLaborInput | CreateManualPartInput, actor: AuthenticatedUser, itemType: "SERVICE_LABOR" | "MANUAL_PART", editToken?: string, expectedRevision?: string) {
    assertId(orderPublicId);
    const description = input.description.trim().replace(/\s+/gu, " ");
    const normalizedDescription = normalizeServiceName(description);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockedOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertPermission(tx, actor, "service_orders.budget.update");
        if (itemType === "MANUAL_PART" && "unitCost" in input && input.unitCost != null) {
          await assertPermission(tx, actor, "service_orders.budget.costs.read");
          await assertPermission(tx, actor, "service_orders.budget.costs.update");
        }
        {
        if (itemType === "SERVICE_LABOR") {
          await acquireCatalogNameLock(tx, normalizedDescription);
          const service = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_catalog WHERE normalized_name = ${normalizedDescription} FOR UPDATE`;
          if (service.length) throw new ConflictException({ code: "MANUAL_LABOR_MATCHES_CATALOG", message: "Use o serviço cadastrado correspondente, inclusive se estiver desativado." });
        }
        const existing = itemType === "SERVICE_LABOR" ? await tx.serviceOrderBudgetItem.findFirst({ where: { serviceOrderId: order.id, itemType, origin: "MANUAL", normalizedDescription, removedAt: null }, select: { publicId: true } }) : null;
        if (existing) throw duplicate(existing.publicId, "mão de obra avulsa");
        const item = await tx.serviceOrderBudgetItem.create({ data: {
          serviceOrderId: order.id, itemType, origin: "MANUAL", description, normalizedDescription, quantity: input.quantity,
          unitPrice: decimal(input.unitPrice), unitCost: itemType === "MANUAL_PART" && "unitCost" in input && input.unitCost != null ? decimal(input.unitCost) : null,
          createdByUserId: actor.id, updatedByUserId: actor.id,
        } });
        const items = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { quantity: true, unitPrice: true } });
        const before = total(items).sub(item.unitPrice.mul(item.quantity));
        await createEvent(tx, order.id, order.numberValue, actor.id, "ITEM_ORCAMENTO_CRIADO", item, [{ field: "item", before: null, after: snapshot(item) }], before, total(items));
        const serviceOrderUpdatedAt = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: itemView(item, await canReadCosts(tx, actor)), serviceOrderRevision: serviceOrderUpdatedAt.toISOString() };
        }
      }, txOptions);
    } catch (error) { return mapWriteError(error); }
  }

  async update(orderPublicId: string, itemPublicId: string, input: UpdateBudgetItemInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    assertId(orderPublicId); assertId(itemPublicId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockedOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertPermission(tx, actor, "service_orders.budget.update");
        const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_order_budget_items WHERE public_id = ${itemPublicId} AND service_order_id = ${order.id} FOR UPDATE`;
        if (!locked[0]) throw itemNotFound();
        const current = await tx.serviceOrderBudgetItem.findUniqueOrThrow({ where: { id: locked[0].id } });
        if (current.removedAt) throw itemNotFound();
        if (current.version !== input.expectedVersion) throw new ConflictException({ code: "BUDGET_ITEM_VERSION_CONFLICT", message: "O item mudou desde que foi aberto. Recarregue a composição." });
        const includeCosts = await canReadCosts(tx, actor);
        const costRequested = Object.hasOwn(input, "unitCost");
        if (costRequested && current.itemType !== "MANUAL_PART") throw new BadRequestException({ code: "BUDGET_ITEM_COST_NOT_SUPPORTED", message: "Este tipo de item não admite custo nesta etapa." });
        if (costRequested) {
          await assertPermission(tx, actor, "service_orders.budget.costs.read");
          await assertPermission(tx, actor, "service_orders.budget.costs.update");
        }
        let description = input.description ?? current.description;
        let normalizedDescription = current.normalizedDescription;
        {
        if (input.description !== undefined) {
          if (current.origin !== "MANUAL") throw new BadRequestException({ code: "REGISTERED_DESCRIPTION_IMMUTABLE", message: "A descrição de serviço cadastrado é imutável na OS." });
          description = input.description.trim().replace(/\s+/gu, " ");
          normalizedDescription = normalizeServiceName(description);
          if (current.itemType === "SERVICE_LABOR") {
            await acquireCatalogNameLock(tx, normalizedDescription);
            if ((await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_catalog WHERE normalized_name = ${normalizedDescription} FOR UPDATE`).length) {
              throw new ConflictException({ code: "MANUAL_LABOR_MATCHES_CATALOG", message: "Use o serviço cadastrado correspondente." });
            }
          }
        }
        const duplicate = current.itemType === "SERVICE_LABOR" ? await tx.serviceOrderBudgetItem.findFirst({ where: {
          serviceOrderId: order.id, id: { not: current.id }, itemType: current.itemType, origin: "MANUAL", normalizedDescription,
          removedAt: null,
        }, select: { publicId: true } }) : null;
        if (current.origin === "MANUAL" && duplicate) throw duplicateItem(duplicate.publicId);
        const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
        if (input.quantity !== undefined && input.quantity !== current.quantity) changes.push({ field: "quantity", before: current.quantity, after: input.quantity });
        if (input.unitPrice !== undefined && !current.unitPrice.equals(input.unitPrice)) changes.push({ field: "unitPrice", before: serializeDecimal(current.unitPrice), after: input.unitPrice });
        if (input.description !== undefined && input.description !== current.description) changes.push({ field: "description", before: current.description, after: description });
        if (costRequested && includeCosts) {
          const next = input.unitCost == null ? null : decimal(input.unitCost);
          const before = current.unitCost === null ? null : serializeDecimal(current.unitCost);
          const after = next === null ? null : serializeDecimal(next);
          if (before !== after) changes.push({ field: "unitCost", before, after });
        }
        const linkedProduct = current.productId === null ? null : await tx.product.findUnique({ where: { id: current.productId }, select: { publicId: true } });
        if (!changes.length) return { data: itemView(current, includeCosts, null, linkedProduct?.publicId ?? null), serviceOrderRevision: order.updatedAt.toISOString() };
        const updateData: Prisma.ServiceOrderBudgetItemUpdateInput = {
          ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
          ...(input.unitPrice !== undefined ? { unitPrice: decimal(input.unitPrice) } : {}),
          ...(input.description !== undefined && current.origin === "MANUAL" ? { description, normalizedDescription } : {}),
          ...(costRequested && includeCosts ? { unitCost: input.unitCost == null ? null : decimal(input.unitCost) } : {}),
          updatedBy: { connect: { id: actor.id } }, version: { increment: 1 },
        };
        const updated = await tx.serviceOrderBudgetItem.update({ where: { id: current.id }, data: updateData });
        const items = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { quantity: true, unitPrice: true } });
        const nextTotal = total(items);
        const previousTotal = nextTotal.sub(updated.unitPrice.mul(updated.quantity)).add(current.unitPrice.mul(current.quantity));
        await createEvent(tx, order.id, order.numberValue, actor.id, "ITEM_ORCAMENTO_ALTERADO", updated, changes as Array<{ field: string; before: Prisma.InputJsonValue | null; after: Prisma.InputJsonValue | null }>, previousTotal, nextTotal, linkedProduct?.publicId ?? null);
        const serviceOrderUpdatedAt = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: itemView(updated, includeCosts, null, linkedProduct?.publicId ?? null), serviceOrderRevision: serviceOrderUpdatedAt.toISOString() };
        }
      }, txOptions);
    } catch (error) { return mapWriteError(error); }
  }

  async remove(orderPublicId: string, itemPublicId: string, input: RemoveBudgetItemInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    assertId(orderPublicId); assertId(itemPublicId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockedOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertPermission(tx, actor, "service_orders.budget.update");
        const locks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_order_budget_items WHERE public_id = ${itemPublicId} AND service_order_id = ${order.id} FOR UPDATE`;
        if (!locks[0]) throw itemNotFound();
        const item = await tx.serviceOrderBudgetItem.findUniqueOrThrow({ where: { id: locks[0].id }, include: { product: { select: { publicId: true } } } });
        if (item.removedAt) throw itemNotFound();
        const application = item.itemType === "STOCK_PART"
          ? (await this.stockApplications.listForItems(tx, order.id, [item], actor)).get(item.id)
          : undefined;
        const appliedQuantity = application?.appliedQuantity ?? 0;
        if (appliedQuantity > 0 && !input.confirmed) {
          throw new ConflictException({ code: "STOCK_APPLICATION_CONFIRMATION_REQUIRED", message: "A remoção desfará as aplicações ainda ativas. Confirme a operação e informe quantas unidades estão defeituosas.", details: { appliedQuantity } });
        }
        if (input.defectiveQuantity > appliedQuantity) {
          throw new BadRequestException({ code: "INVALID_DEFECTIVE_QUANTITY", message: "A quantidade defeituosa não pode exceder a quantidade aplicada ainda ativa." });
        }
        const stockReversal = appliedQuantity > 0
          ? await this.stockApplications.reverseInTransaction(tx, order, item, actor, appliedQuantity, input.defectiveQuantity, false)
          : null;
        const beforeRows = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, select: { id: true, quantity: true, unitPrice: true } });
        const beforeTotal = total(beforeRows);
        const now = new Date();
        const removed = await tx.serviceOrderBudgetItem.update({ where: { id: item.id }, data: { removedAt: now, removedByUserId: actor.id, updatedByUserId: actor.id, version: { increment: 1 } } });
        const afterRows = beforeRows.filter((row) => row.id !== item.id);
        const afterTotal = total(afterRows);
        await createEvent(tx, order.id, order.numberValue, actor.id, "ITEM_ORCAMENTO_REMOVIDO", removed,
          [{ field: "item", before: { ...snapshot(item, item.product?.publicId), ...(stockReversal ? { stockApplicationsReversed: stockReversal.reversals } : {}) } as Prisma.InputJsonValue, after: null }],
          beforeTotal, afterTotal, item.product?.publicId ?? null);
        const serviceOrderUpdatedAt = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: { removed: true, publicId: item.publicId, total: serializeDecimal(afterTotal) }, serviceOrderRevision: serviceOrderUpdatedAt.toISOString() };
      }, txOptions);
    } catch (error) { return mapWriteError(error); }
  }

  async withdrawAllInTransaction(tx: Tx, order: { id: number; publicId: string; numberValue: bigint }, actor: AuthenticatedUser) {
    const items = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, removedAt: null }, orderBy: { id: "asc" }, include: { product: { select: { publicId: true } } } });
    if (!items.length) return null;
    const reversals = new Map<number, Array<Record<string, unknown>>>();
    for (const item of items) {
      if (item.itemType !== "STOCK_PART") continue;
      const reversal = await this.stockApplications.reverseAllInTransaction(tx, order, item, actor);
      if (reversal) reversals.set(item.id, reversal.reversals);
    }
    const snapshotItems = items.map((item) => ({ ...snapshot(item, item.product?.publicId), ...(reversals.has(item.id) ? { stockApplicationsReversed: reversals.get(item.id) } : {}) }));
    const totalBefore = total(items);
    const now = new Date();
    await tx.serviceOrderBudgetItem.updateMany({ where: { id: { in: items.map(({ id }) => id) }, removedAt: null }, data: { removedAt: now, removedByUserId: actor.id, updatedByUserId: actor.id, version: { increment: 1 } } });
    await tx.serviceOrderEvent.create({ data: {
      serviceOrderId: order.id, actorUserId: actor.id, eventType: "ORCAMENTO_RETIRADO", numberValue: order.numberValue, occurredAt: now,
      payload: { items: snapshotItems, total: serializeDecimal(totalBefore), itemCount: items.length } as Prisma.InputJsonValue,
    } });
    return { itemCount: items.length, total: serializeDecimal(totalBefore) };
  }
}

function duplicate(publicId: string, label: string): ConflictException {
  return new ConflictException({ code: "BUDGET_ITEM_DUPLICATE", message: `Este ${label} já existe na composição da OS.`, details: { existingItemPublicId: publicId } });
}
function duplicateItem(publicId: string): ConflictException {
  return new ConflictException({ code: "BUDGET_ITEM_DUPLICATE", message: "Já existe uma descrição equivalente ativa nesta categoria.", details: { existingItemPublicId: publicId } });
}
function snapshot(item: ServiceOrderBudgetItem, productPublicId?: string | null) {
  return {
    publicId: item.publicId, itemType: item.itemType, origin: item.origin, description: item.description,
    ...(productPublicId ? { productPublicId } : {}),
    quantity: item.quantity, unitPrice: serializeDecimal(item.unitPrice), total: serializeDecimal(item.unitPrice.mul(item.quantity)),
    ...(item.unitCost === null ? {} : { unitCost: serializeDecimal(item.unitCost), totalCost: serializeDecimal(item.unitCost.mul(item.quantity)) }),
  };
}
async function createEvent(tx: Tx, orderId: number, numberValue: bigint, actorId: number, eventType: string, item: ServiceOrderBudgetItem,
  changes: Array<{ field: string; before: Prisma.InputJsonValue | null; after: Prisma.InputJsonValue | null }>, totalBefore: Prisma.Decimal, totalAfter: Prisma.Decimal, productPublicId?: string | null): Promise<void> {
  await tx.serviceOrderEvent.create({ data: {
    serviceOrderId: orderId, actorUserId: actorId, eventType, numberValue, payload: {
      itemPublicId: item.publicId, itemType: item.itemType, origin: item.origin, description: item.description,
      ...(productPublicId ? { productPublicId } : {}),
      quantity: item.quantity, unitPrice: serializeDecimal(item.unitPrice), total: serializeDecimal(item.unitPrice.mul(item.quantity)),
      changes, totalBefore: serializeDecimal(totalBefore), totalAfter: serializeDecimal(totalAfter),
      ...(item.unitCost === null ? {} : { unitCost: serializeDecimal(item.unitCost), totalCost: serializeDecimal(item.unitCost.mul(item.quantity)) }),
    },
  } });
}
