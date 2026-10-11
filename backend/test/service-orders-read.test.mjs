import assert from "node:assert/strict";
import test from "node:test";
import { parseListServiceOrdersQuery } from "../dist/modules/service-orders/dto/list-service-orders-query.dto.js";

test("service order pagination requires safe positive page and pageSize", () => {
  assert.deepEqual(parseListServiceOrdersQuery({ page: "1", pageSize: "100" }), { page: 1, pageSize: 100 });
  for (const query of [
    {}, { page: "1" }, { page: "0", pageSize: "10" }, { page: "1", pageSize: "101" },
    { page: "1.5", pageSize: "10" }, { page: "9007199254740992", pageSize: "10" },
    { page: "9007199254740991", pageSize: "2" }, { page: ["1"], pageSize: "10" },
  ]) {
    assert.throws(() => parseListServiceOrdersQuery(query), (error) => error.response?.code === "INVALID_PAGINATION");
  }
  assert.throws(
    () => parseListServiceOrdersQuery({ page: "1", pageSize: "10", status: "CONFIRMED" }),
    (error) => error.response?.code === "UNSUPPORTED_QUERY",
  );
});
