import assert from "node:assert/strict";
import { test } from "node:test";
import { toOpeningResponse } from "../dist/modules/service-orders/domain/opening-response.js";

const baseOpening = {
  publicId: "75811f19-8b30-45ad-84a5-7ac1bf22e768",
  attemptedNumberValue: 132n,
  status: "IN_PROGRESS",
  createdAt: new Date("2026-10-13T12:00:00.000Z"),
  updatedAt: new Date("2026-10-13T12:00:00.000Z"),
};

test("resposta de abertura expõe resumo público e documento mascarado do cliente", () => {
  const response = toOpeningResponse({
    ...baseOpening,
    customer: { id: 9182, publicId: "customer-public-id", name: "Cliente de Teste", document: "12345678901", email: "private@example.test" },
  }, "initiator-public-id");

  assert.deepEqual(response.customer, {
    publicId: "customer-public-id",
    name: "Cliente de Teste",
    documentHint: "***.***.***-01",
  });
  assert.equal(response.customerPublicId, "customer-public-id");
  assert.equal(JSON.stringify(response).includes("12345678901"), false);
  assert.equal(JSON.stringify(response).includes("private@example.test"), false);
  assert.equal(Object.hasOwn(response.customer, "id"), false);
  assert.equal(Object.hasOwn(response.customer, "document"), false);
});

test("resposta de abertura sem cliente retorna customer e customerPublicId nulos", () => {
  const response = toOpeningResponse(baseOpening, "initiator-public-id");

  assert.equal(response.customer, null);
  assert.equal(response.customerPublicId, null);
});
