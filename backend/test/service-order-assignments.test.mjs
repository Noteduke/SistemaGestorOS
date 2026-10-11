import assert from "node:assert/strict";
import test from "node:test";
import { parseAssignmentsPut } from "../dist/modules/service-orders/dto/assignments-put.dto.js";

const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("assignments PUT requires a distinct array of publicIds and accepts an empty array", () => {
  assert.deepEqual(parseAssignmentsPut({ userPublicIds: [first, second.toUpperCase()] }), {
    userPublicIds: [first, second],
  });
  assert.deepEqual(parseAssignmentsPut({ userPublicIds: [] }), { userPublicIds: [] });
  for (const body of [
    null,
    {},
    { userPublicIds: null },
    { userPublicIds: [first, first] },
    { userPublicIds: [first, first.toUpperCase()] },
    { userPublicIds: ["not-a-public-id"] },
    { userPublicIds: [1] },
    { userPublicIds: [], note: "not part of the contract" },
  ]) {
    assert.throws(() => parseAssignmentsPut(body), (error) => error.response?.code === "VALIDATION_ERROR");
  }
});
