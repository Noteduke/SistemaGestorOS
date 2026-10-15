import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Product } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuthPolicyService } from "../auth/auth-policy.service.js";
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from "./dto/product.dto.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";

type Tx = Prisma.TransactionClient;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

function assertPublicId(publicId: string): void {
  if (!PUBLIC_ID.test(publicId)) throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
}

function view(product: Product, canReadCost: boolean) {
  const result = {
    publicId: product.publicId,
    internalCode: product.internalCode,
    description: product.description,
    category: product.category,
    salePrice: product.salePrice?.toFixed(2) ?? null,
    isActive: product.isActive,
    version: product.version,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
  if (!canReadCost) return result;
  const acquisitionCost = product.acquisitionCost?.toFixed(2) ?? null;
  return {
    ...result,
    acquisitionCost,
    grossProfitEstimate: product.salePrice !== null && product.acquisitionCost !== null
      ? product.salePrice.sub(product.acquisitionCost).toFixed(2)
      : null,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado." });
}

function staleVersion(): ConflictException {
  return new ConflictException({ code: "PRODUCT_VERSION_CONFLICT", message: "O produto foi alterado por outra operação. Recarregue os dados." });
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function mapWriteError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (hasCode(error, "P2002")) {
    throw new ConflictException({ code: "DUPLICATE_PRODUCT_CODE", message: "Já existe um produto com esse código interno." });
  }
  if (hasCode(error, "P2034") || hasCode(error, "P2028")) {
    throw new ConflictException({ code: "PRODUCT_CONCURRENCY_CONFLICT", message: "Conflito concorrente. Recarregue os dados e tente novamente." });
  }
  throw error;
}

async function lockProduct(tx: Tx, publicId: string): Promise<Product> {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE public_id = ${publicId} FOR UPDATE`;
  if (!rows[0]) throw notFound();
  const product = await tx.product.findUnique({ where: { id: rows[0].id } });
  if (!product) throw notFound();
  return product;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly policy: AuthPolicyService) {}

  private async canReadCosts(actor: AuthenticatedUser): Promise<boolean> {
    return this.policy.hasPermission(actor, "products.cost.read");
  }

  private async assertCanUpdateCost(actor: AuthenticatedUser, input: UpdateProductInput | CreateProductInput): Promise<void> {
    if (input.acquisitionCost !== undefined) await this.policy.assertAllowed(actor, ["products.cost.update"]);
  }

  async list(query: ProductListQuery, actor: AuthenticatedUser) {
    const canReadCosts = await this.canReadCosts(actor);
    const where: Prisma.ProductWhereInput = {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.status === "inactive" ? { isActive: false } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { OR: [
        { internalCode: { contains: query.search } },
        { description: { contains: query.search } },
      ] } : {}),
    };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ description: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data: products.map((product) => view(product, canReadCosts)),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async get(publicId: string, actor: AuthenticatedUser) {
    assertPublicId(publicId);
    const canReadCosts = await this.canReadCosts(actor);
    const product = await this.prisma.product.findUnique({ where: { publicId } });
    if (!product) throw notFound();
    return { data: view(product, canReadCosts) };
  }

  async create(input: CreateProductInput, actor: AuthenticatedUser) {
    await this.assertCanUpdateCost(actor, input);
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            internalCode: input.internalCode,
            description: input.description,
            category: input.category,
            salePrice: input.salePrice === null ? null : new Prisma.Decimal(input.salePrice),
            acquisitionCost: input.acquisitionCost == null ? null : new Prisma.Decimal(input.acquisitionCost),
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
          },
        });
        await tx.adminAuditLog.create({
          data: {
            eventCode: "PRODUCT_CREATED",
            actorUserId: actor.id,
            detailsJson: {
              productPublicId: created.publicId,
              after: { internalCode: created.internalCode, description: created.description, category: created.category, salePrice: created.salePrice?.toFixed(2) ?? null, acquisitionCost: created.acquisitionCost?.toFixed(2) ?? null, isActive: created.isActive },
            },
          },
        });
        return created;
      }, TX_OPTIONS);
      return { data: view(product, await this.canReadCosts(actor)) };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async update(publicId: string, input: UpdateProductInput, actor: AuthenticatedUser) {
    await this.assertCanUpdateCost(actor, input);
    assertPublicId(publicId);
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const current = await lockProduct(tx, publicId);
        if (current.version !== input.expectedVersion) throw staleVersion();

        const before: Record<string, Prisma.InputJsonValue | null> = {};
        const after: Record<string, Prisma.InputJsonValue | null> = {};
        const data: Prisma.ProductUpdateInput = { updatedBy: { connect: { id: actor.id } } };
        const addChange = (field: string, oldValue: Prisma.InputJsonValue | null, newValue: Prisma.InputJsonValue | null, assign: () => void) => {
          if (oldValue === newValue) return;
          before[field] = oldValue;
          after[field] = newValue;
          assign();
        };

        if (input.internalCode !== undefined) addChange("internalCode", current.internalCode, input.internalCode, () => { data.internalCode = input.internalCode; });
        if (input.description !== undefined) addChange("description", current.description, input.description, () => { data.description = input.description; });
        if (input.category !== undefined) addChange("category", current.category, input.category, () => { data.category = input.category; });
        if (input.isActive !== undefined) addChange("isActive", current.isActive, input.isActive, () => { data.isActive = input.isActive; });
        if (input.salePrice !== undefined) {
          const value = input.salePrice;
          addChange("salePrice", current.salePrice?.toFixed(2) ?? null, value, () => { data.salePrice = value === null ? null : new Prisma.Decimal(value); });
        }
        if (input.acquisitionCost !== undefined) {
          const value = input.acquisitionCost;
          addChange("acquisitionCost", current.acquisitionCost?.toFixed(2) ?? null, value, () => { data.acquisitionCost = value === null ? null : new Prisma.Decimal(value); });
        }
        if (!Object.keys(after).length) return current;

        const updated = await tx.product.update({
          where: { id: current.id },
          data: { ...data, version: { increment: 1 } },
        });
        await tx.adminAuditLog.create({
          data: {
            eventCode: "PRODUCT_UPDATED",
            actorUserId: actor.id,
            detailsJson: { productPublicId: current.publicId, before, after },
          },
        });
        return updated;
      }, TX_OPTIONS);
      return { data: view(product, await this.canReadCosts(actor)) };
    } catch (error) {
      return mapWriteError(error);
    }
  }
}
