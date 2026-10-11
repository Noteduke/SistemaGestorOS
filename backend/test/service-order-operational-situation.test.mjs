import assert from "node:assert/strict";
import test from "node:test";
import { parseOperationalSituationPatch } from "../dist/modules/service-orders/dto/operational-situation-patch.dto.js";

test("operational situation patch accepts only one of the Prisma enum values", () => {
  assert.deepEqual(parseOperationalSituationPatch({ operationalSituation: "AWAITING_EVALUATION_BUDGET" }), {
    operationalSituation: "AWAITING_EVALUATION_BUDGET",
  });
  for (const body of [
    null,
    {},
    { operationalSituation: "TRIAGEM" },
    { operationalSituation: "CLOSED" },
    { operationalSituation: "TRIAGE", macroStatus: "CLOSED" },
    { operationalSituation: "TRIAGE", note: "not part of the contract" },
  ]) {
    assert.throws(() => parseOperationalSituationPatch(body), (error) => error.response?.code === "INVALID_SITUATION");
  }
});
