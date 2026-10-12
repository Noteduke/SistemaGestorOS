import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const buildDirectory = process.env.BACKEND_TEST_BUILD_DIR
  ? resolve(process.env.BACKEND_TEST_BUILD_DIR)
  : fileURLToPath(new URL("../dist/", import.meta.url));
const fromBuild = (path) => import(pathToFileURL(join(buildDirectory, path)).href);
const [
  { PeopleController },
  { PeopleService },
  { EquipmentController, EquipmentTypesController, EquipmentBrandsController },
  { EquipmentLookupService },
  { parseOpeningLookupQuery },
  { AuthPolicyService },
  { PermissionGuard },
  { SessionAuthGuard },
  { REQUIRED_PERMISSIONS_KEY },
] = await Promise.all([
  fromBuild("modules/people/people.controller.js"),
  fromBuild("modules/people/people.service.js"),
  fromBuild("modules/equipment/equipment.controller.js"),
  fromBuild("modules/equipment/equipment-lookup.service.js"),
  fromBuild("modules/shared/dto/opening-lookup-query.dto.js"),
  fromBuild("modules/auth/auth-policy.service.js"),
  fromBuild("modules/auth/guards/permission.guard.js"),
  fromBuild("modules/auth/guards/session-auth.guard.js"),
  fromBuild("modules/auth/decorators/auth-metadata.js"),
]);

const query = { page: 1, pageSize: 20 };

test("opening lookup query enforces safe required pagination and bounded search", () => {
  assert.deepEqual(parseOpeningLookupQuery({ page: "2", pageSize: "50", search: "  impressora  " }), {
    page: 2,
    pageSize: 50,
    search: "impressora",
  });
  for (const invalid of [
    {}, { page: "1" }, { page: "0", pageSize: "20" }, { page: "1", pageSize: "101" },
    { page: "9007199254740991", pageSize: "2" }, { page: ["1"], pageSize: "20" },
  ]) {
    assert.throws(() => parseOpeningLookupQuery(invalid), (error) => error.response?.code === "INVALID_PAGINATION");
  }
  assert.throws(() => parseOpeningLookupQuery({ page: "1", pageSize: "20", search: "x".repeat(101) }),
    (error) => error.response?.code === "INVALID_SEARCH");
  assert.throws(() => parseOpeningLookupQuery({ page: "1", pageSize: "20", isActive: "true" }),
    (error) => error.response?.code === "UNSUPPORTED_QUERY");
});

test("opening customer lookup filters active CUSTOMER people, searches contact fields, and masks documents", async () => {
  let calls;
  const prisma = {
    $transaction: (queries) => Promise.all(queries),
    person: {
      findMany: async (args) => { calls = args; return [{ id: 73, publicId: "person-public", personType: "PF", name: "MARIA SILVA", document: "12345678901" }]; },
      count: async () => 1,
    },
  };
  const result = await new PeopleService(prisma).listOpeningCustomers({ ...query, search: "(11) 99999-0000" });

  assert.equal(calls.where.isActive, true);
  assert.deepEqual(calls.where.roles, { some: { role: "CUSTOMER" } });
  assert.ok(calls.where.OR.some((filter) => filter.phones?.some?.number?.contains === "11999990000"));
  assert.deepEqual(result.data, [{ publicId: "person-public", personType: "PF", name: "MARIA SILVA", documentHint: "***.***.***-01" }]);
  assert.equal("id" in result.data[0], false);
  assert.equal("document" in result.data[0], false);
  assert.deepEqual(result.pagination, { page: 1, pageSize: 20, total: 1, totalPages: 1 });
});

test("equipment opening search includes active equipment across owners and returns only public selection data", async () => {
  let calls;
  const prisma = {
    $transaction: (queries) => Promise.all(queries),
    equipment: {
      findMany: async (args) => {
        calls = args;
        return [{
          id: 91, publicId: "equipment-public", model: "LATITUDE 5440", serialNumber: null,
          type: { id: 1, publicId: "type-public", name: "NOTEBOOK" },
          brand: { id: 2, publicId: "brand-public", name: "DELL" },
          owner: { id: 3, publicId: "owner-public", name: "CLIENTE TITULAR" },
        }];
      },
      count: async () => 1,
    },
  };
  const result = await new EquipmentLookupService(prisma).searchForOpening({ ...query, search: "Dell" });

  assert.equal(calls.where.isActive, true);
  assert.ok(calls.where.OR.some((filter) => filter.owner?.name?.contains === "DELL"));
  assert.equal(calls.where.owner, undefined);
  assert.deepEqual(result.data, [{
    publicId: "equipment-public",
    type: { publicId: "type-public", name: "NOTEBOOK" },
    brand: { publicId: "brand-public", name: "DELL" },
    model: "LATITUDE 5440",
    serialNumber: null,
    serialIdentificationStatus: "NOT_IDENTIFIED",
    owner: { publicId: "owner-public", name: "CLIENTE TITULAR" },
  }]);
  assert.equal(JSON.stringify(result).includes('"id"'), false);
});

test("equipment type and brand lookups return catalog rows without an active filter or internal IDs", async () => {
  const prisma = {
    $transaction: (queries) => Promise.all(queries),
    equipmentType: {
      findMany: async () => [{ id: 1, publicId: "type-public", name: "NOTEBOOK" }],
      count: async () => 1,
    },
    equipmentBrand: {
      findMany: async () => [{ id: 2, publicId: "brand-public", name: "NÃO INFORMADA" }],
      count: async () => 1,
    },
  };
  const service = new EquipmentLookupService(prisma);
  const types = await service.listTypes(query);
  const brands = await service.listBrands(query);

  assert.deepEqual(types.data, [{ publicId: "type-public", name: "NOTEBOOK" }]);
  assert.deepEqual(brands.data, [{ publicId: "brand-public", name: "NÃO INFORMADA" }]);
  assert.equal(JSON.stringify([types, brands]).includes('"id"'), false);
});

test("opening lookup controllers require service_orders.opening.create", () => {
  for (const [controller, method] of [
    [PeopleController, "listOpeningCustomers"],
    [EquipmentController, "searchForOpening"],
    [EquipmentTypesController, "listTypes"],
    [EquipmentBrandsController, "listBrands"],
  ]) {
    assert.deepEqual(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller.prototype[method]), ["service_orders.opening.create"]);
  }
});

test("session guard returns 401 without a session cookie", async () => {
  const reflector = { getAllAndOverride: () => false };
  const guard = new SessionAuthGuard({}, { get: () => undefined }, reflector);
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }), getResponse: () => ({}) }),
  };
  await assert.rejects(guard.canActivate(context), (error) => error.getStatus() === 401);
});

test("opening lookup permission denies ungranted users and permits Admin without a grant query", async () => {
  let grantQueries = 0;
  const policy = new AuthPolicyService({
    userPermission: { findMany: async () => { grantQueries += 1; return []; } },
    permission: { findMany: async () => [] },
  });
  const reflector = {
    getAllAndOverride: (key) => key === REQUIRED_PERMISSIONS_KEY ? ["service_orders.opening.create"] : false,
  };
  const guard = new PermissionGuard(reflector, policy);
  const contextFor = (auth) => ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  });

  await assert.rejects(guard.canActivate(contextFor({ id: 8, isAdmin: false })), (error) => error.getStatus() === 403);
  assert.equal(await guard.canActivate(contextFor({ id: 9, isAdmin: true })), true);
  assert.equal(grantQueries, 1);
});
