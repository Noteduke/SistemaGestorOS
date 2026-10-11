import assert from "node:assert/strict";
import test from "node:test";
import { parseListAssignableUsersQuery } from "../dist/modules/users/dto/list-assignable-users-query.dto.js";

test("assignable user listing requires bounded safe pagination", () => {
  assert.deepEqual(parseListAssignableUsersQuery({ page: "2", pageSize: "20" }), { page: 2, pageSize: 20 });
  for (const query of [
    {}, { page: "1" }, { page: "0", pageSize: "10" }, { page: "1", pageSize: "101" },
    { page: "1.5", pageSize: "10" }, { page: "9007199254740992", pageSize: "10" },
    { page: "9007199254740991", pageSize: "2" }, { page: ["1"], pageSize: "10" },
  ]) {
    assert.throws(() => parseListAssignableUsersQuery(query), (error) => error.response?.code === "INVALID_PAGINATION");
  }
});

test("assignable user search is trimmed, lowercased, bounded, and rejects unsupported filters", () => {
  assert.deepEqual(parseListAssignableUsersQuery({ page: "1", pageSize: "10", search: "  ALICE  " }), {
    page: 1,
    pageSize: 10,
    search: "alice",
  });
  assert.deepEqual(parseListAssignableUsersQuery({ page: "1", pageSize: "10", search: "   " }), { page: 1, pageSize: 10 });
  assert.throws(
    () => parseListAssignableUsersQuery({ page: "1", pageSize: "10", search: "x".repeat(51) }),
    (error) => error.response?.code === "INVALID_SEARCH",
  );
  assert.throws(
    () => parseListAssignableUsersQuery({ page: "1", pageSize: "10", isAdmin: "true" }),
    (error) => error.response?.code === "UNSUPPORTED_QUERY",
  );
});
