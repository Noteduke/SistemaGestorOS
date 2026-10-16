import assert from "node:assert/strict";
import test from "node:test";
import { parseOperationalSituationPatch } from "../dist/modules/service-orders/dto/operational-situation-patch.dto.js";

test("operational situation patch accepts only a public status ID and optional budget withdrawal", () => {
  const publicId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseOperationalSituationPatch({ operationalStatusPublicId: publicId, withdrawBudget: true }), {
    operationalStatusPublicId: publicId, withdrawBudget: true,
  });
  for (const body of [
    null,
    {},
    { operationalStatusPublicId: "TRIAGEM" },
    { operationalStatusPublicId: "00000000-0000-0000-0000-000000000001" },
    { operationalStatusPublicId: publicId, macroStatus: "CLOSED" },
    { operationalStatusPublicId: publicId, note: "not part of the contract" },
  ]) {
    assert.throws(() => parseOperationalSituationPatch(body), (error) => error.response?.code === "INVALID_SITUATION");
  }
  assert.throws(() => parseOperationalSituationPatch({ operationalStatusPublicId: publicId, withdrawBudget: false }),
    (error) => error.response?.code === "INVALID_BUDGET_WITHDRAWAL");
});
