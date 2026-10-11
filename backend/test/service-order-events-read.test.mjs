import assert from "node:assert/strict";
import test from "node:test";
import { parseListServiceOrderEventsQuery } from "../dist/modules/service-orders/dto/list-service-order-events-query.dto.js";
import { sanitizeServiceOrderEventPayload } from "../dist/modules/service-orders/service-order-events-read.service.js";

test("service order events pagination follows the existing required, bounded contract", () => {
  assert.deepEqual(parseListServiceOrderEventsQuery({ page: "2", pageSize: "20" }), { page: 2, pageSize: 20 });
  for (const query of [
    {},
    { page: "0", pageSize: "20" },
    { page: "1.5", pageSize: "20" },
    { page: "1", pageSize: "101" },
    { page: "9007199254740991", pageSize: "100" },
    { page: "1", pageSize: "20", sort: "asc" },
  ]) {
    assert.throws(() => parseListServiceOrderEventsQuery(query));
  }
});

test("event payload projection exposes allowlisted public fields and drops internal or unknown keys", () => {
  const publicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.deepEqual(sanitizeServiceOrderEventPayload("ATRIBUICOES_ALTERADAS", {
    previousUserPublicIds: [publicId],
    newUserPublicIds: [],
    addedUserPublicIds: ["123"],
    serviceOrderId: 123,
    actorUserId: 456,
    passwordHash: "must not escape",
    arbitrary: "must not escape",
  }), {
    previousUserPublicIds: [publicId],
    newUserPublicIds: [],
  });
  assert.equal(sanitizeServiceOrderEventPayload("UNRECOGNIZED_EVENT", { internalId: 3 }), null);
  assert.equal(sanitizeServiceOrderEventPayload("ABERTURA_CONFIRMADA", null), null);
});
