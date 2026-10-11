import type { PrismaService } from "../infrastructure/prisma/prisma.service.js";

export const UNSPECIFIED_BRAND_NAME = "NÃO INFORMADA";
// Stable identity for a brand created by this command. A later rename must not be undone by another run.
export const UNSPECIFIED_BRAND_PUBLIC_ID = "d0ac1a1e-347a-4aba-9541-74f87e67ac16";

export type EnsureUnspecifiedBrandResult = "created" | "existing-managed" | "existing-by-name";

export async function ensureUnspecifiedBrand(prisma: Pick<PrismaService, "equipmentBrand">): Promise<EnsureUnspecifiedBrandResult> {
  const byPublicId = await prisma.equipmentBrand.findUnique({ where: { publicId: UNSPECIFIED_BRAND_PUBLIC_ID } });
  if (byPublicId) {
    if (byPublicId.name !== UNSPECIFIED_BRAND_NAME) {
      throw new Error("A Marca controlada foi renomeada; revise o catálogo manualmente antes de confirmar OS.");
    }
    return "existing-managed";
  }

  // An existing manually entered brand must retain its public ID, including references from opening drafts.
  const byName = await prisma.equipmentBrand.findUnique({ where: { name: UNSPECIFIED_BRAND_NAME } });
  if (byName) {
    assertCanonicalName(byName.name);
    return "existing-by-name";
  }

  try {
    await prisma.equipmentBrand.create({ data: { publicId: UNSPECIFIED_BRAND_PUBLIC_ID, name: UNSPECIFIED_BRAND_NAME } });
    return "created";
  } catch (error) {
    if (!hasPrismaCode(error, "P2002")) throw error;
    // Concurrent idempotent runs can race on either unique key. Recheck before treating it as success.
    const concurrentByPublicId = await prisma.equipmentBrand.findUnique({ where: { publicId: UNSPECIFIED_BRAND_PUBLIC_ID } });
    if (concurrentByPublicId) {
      if (concurrentByPublicId.name !== UNSPECIFIED_BRAND_NAME) throw error;
      return "existing-managed";
    }
    const concurrentByName = await prisma.equipmentBrand.findUnique({ where: { name: UNSPECIFIED_BRAND_NAME } });
    if (concurrentByName) {
      assertCanonicalName(concurrentByName.name);
      return "existing-by-name";
    }
    throw error;
  }
}

function assertCanonicalName(name: string): void {
  if (name !== UNSPECIFIED_BRAND_NAME) {
    throw new Error("Uma Marca com nome equivalente impede a criação da opção controlada; revise o catálogo manualmente.");
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
