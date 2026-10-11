import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensureUnspecifiedBrand,
  UNSPECIFIED_BRAND_NAME,
  UNSPECIFIED_BRAND_PUBLIC_ID,
} from "../dist/scripts/ensure-unspecified-brand.js";

function catalog(initial = []) {
  const brands = [...initial];
  let creations = 0;
  return {
    brands,
    get creations() { return creations; },
    equipmentBrand: {
      async findUnique({ where }) {
        return brands.find((brand) => where.publicId !== undefined
          ? brand.publicId === where.publicId : brand.name === where.name) ?? null;
      },
      async create({ data }) {
        creations++;
        if (brands.some((brand) => brand.publicId === data.publicId || brand.name === data.name)) throw { code: "P2002" };
        brands.push(data);
        return data;
      },
    },
  };
}

test("cria uma única Marca controlada em execuções repetidas", async () => {
  const prisma = catalog();
  assert.equal(await ensureUnspecifiedBrand(prisma), "created");
  assert.equal(await ensureUnspecifiedBrand(prisma), "existing-managed");
  assert.equal(prisma.creations, 1);
  assert.deepEqual(prisma.brands, [{ publicId: UNSPECIFIED_BRAND_PUBLIC_ID, name: UNSPECIFIED_BRAND_NAME }]);
});

test("preserva Marca preexistente por nome e seu publicId", async () => {
  const existing = { publicId: "f036b65e-ff9f-4028-b65e-5850da5e1cf0", name: UNSPECIFIED_BRAND_NAME };
  const prisma = catalog([existing]);
  assert.equal(await ensureUnspecifiedBrand(prisma), "existing-by-name");
  assert.equal(prisma.creations, 0);
  assert.deepEqual(prisma.brands, [existing]);
});

test("não desfaz renomeação da Marca gerenciada e falha fechado", async () => {
  const prisma = catalog([{ publicId: UNSPECIFIED_BRAND_PUBLIC_ID, name: "MARCA RENOMEADA" }]);
  await assert.rejects(ensureUnspecifiedBrand(prisma), /renomeada/);
  assert.equal(prisma.creations, 0);
});

test("não aceita nome apenas equivalente pela collation como Marca controlada", async () => {
  const prisma = catalog([{ publicId: "f036b65e-ff9f-4028-b65e-5850da5e1cf0", name: "NAO INFORMADA" }]);
  prisma.equipmentBrand.findUnique = async ({ where }) => prisma.brands.find((brand) => where.publicId !== undefined
    ? brand.publicId === where.publicId : brand.name.normalize("NFD").replace(/\p{Diacritic}/gu, "") === where.name.normalize("NFD").replace(/\p{Diacritic}/gu, "")) ?? null;
  await assert.rejects(ensureUnspecifiedBrand(prisma), /nome equivalente/);
  assert.equal(prisma.creations, 0);
});
