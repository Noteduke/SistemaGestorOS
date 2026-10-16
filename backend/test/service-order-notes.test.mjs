import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCreateServiceOrderNote } from "../dist/modules/service-orders/dto/service-order-note.dto.js";
import { parseListServiceOrderHistoryQuery } from "../dist/modules/service-orders/dto/list-service-order-history-query.dto.js";
import { decodeHistoryCursor, encodeHistoryCursor } from "../dist/modules/service-orders/domain/history-cursor.js";
import { ServiceOrderNotesService } from "../dist/modules/service-orders/service-order-notes.service.js";
import { ServiceOrderHistoryService } from "../dist/modules/service-orders/service-order-history.service.js";

const orderPublicId = "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
const otherOrderPublicId = "7a5ccbc1-a7cc-4a12-8f71-65b9f379d910";
const notePublicId = "1d02a98e-1d95-4f86-a5a3-dbd4f234a0cd";
const author = { id: 4, publicId: "8d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "author", isAdmin: false };
const other = { id: 5, publicId: "9d02a98e-1d95-4f86-a5a3-dbd4f234a0cd", username: "other", isAdmin: false };
const code = (error) => error.getResponse()?.code;

test("texto da observação é obrigatório, simples, uma linha e limitado a 255 caracteres", () => {
  assert.deepEqual(parseCreateServiceOrderNote({ text: " Cliente autorizou " }), { text: " Cliente autorizou " });
  assert.equal(Array.from(parseCreateServiceOrderNote({ text: "A".repeat(255) }).text).length, 255);
  for (const body of [{}, { text: "" }, { text: " \t " }, { text: "A".repeat(256) }, { text: "A\rB" }, { text: "A\nB" }, { text: 1 }, { text: "A", html: true }]) {
    assert.throws(() => parseCreateServiceOrderNote(body), (error) => code(error) === "INVALID_SERVICE_ORDER_NOTE");
  }
});

test("query de histórico e cursor rejeitam parâmetros inválidos, adulteração e uso em outra OS", () => {
  assert.deepEqual(parseListServiceOrderHistoryQuery({ pageSize: "100" }), { pageSize: 100 });
  for (const query of [{}, { pageSize: "0" }, { pageSize: "101" }, { pageSize: "1", page: "2" }, { pageSize: "1", cursor: "!" }]) {
    assert.throws(() => parseListServiceOrderHistoryQuery(query));
  }
  const position = { occurredAt: new Date("2026-10-14T12:00:00.000Z"), kind: "SYSTEM_EVENT", id: 7 };
  const cursor = encodeHistoryCursor(orderPublicId, position);
  assert.deepEqual(decodeHistoryCursor(cursor, orderPublicId), position);
  assert.throws(() => decodeHistoryCursor(cursor, otherOrderPublicId), (error) => code(error) === "INVALID_PAGINATION");
  assert.throws(() => decodeHistoryCursor(cursor.slice(0, -2) + "AA", orderPublicId), (error) => code(error) === "INVALID_PAGINATION");
});

function fakeStore({ auditFails = false, deleteFails = false } = {}) {
  const note = { id: 3, publicId: notePublicId, serviceOrderId: 2, authorUserId: author.id, author: { publicId: author.publicId, username: author.username }, text: "Conteúdo integral", createdAt: new Date("2026-10-14T10:00:00.000Z") };
  let existing = note;
  const audits = [];
  let pendingAudits = [];
  const grants = new Set();
  const tx = {
    serviceOrder: { async findFirst({ where }) { return where.publicId === orderPublicId ? { id: 2, numberValue: 128n } : null; } },
    async $queryRaw(_strings, ...values) { return existing && values[0] === existing.publicId && values[1] === existing.serviceOrderId ? [{ id: existing.id }] : []; },
    serviceOrderNote: {
      async findUniqueOrThrow() { if (!existing) throw Error("missing"); return existing; },
      async create({ data }) { existing = { ...note, ...data }; return existing; },
      async delete() { if (deleteFails) throw Error("delete failed"); existing = null; },
    },
    userPermission: { async findFirst({ where }) { return grants.has(`${where.userId}:${where.permission.code}`) ? { userId: where.userId } : null; } },
    adminAuditLog: { async create({ data }) { if (auditFails) throw Error("audit failed"); pendingAudits.push(data); } },
  };
  return { prisma: { async $transaction(callback) {
    const before = existing;
    pendingAudits = [];
    try {
      const result = await callback(tx);
      audits.push(...pendingAudits);
      return result;
    } catch (error) {
      existing = before;
      throw error;
    } finally {
      pendingAudits = [];
    }
  } }, grants, audits, getNote: () => existing };
}

test("criação exige service_orders.update, mas Admin tem bypass", async () => {
  const store = fakeStore();
  const service = new ServiceOrderNotesService(store.prisma);
  await assert.rejects(service.create(orderPublicId, { text: "Nova nota" }, author), (error) => code(error) === "PERMISSION_DENIED");
  store.grants.add(`${author.id}:service_orders.update`);
  assert.equal((await service.create(orderPublicId, { text: "Nova nota" }, author)).data.text, "Nova nota");
  const adminStore = fakeStore();
  assert.equal((await new ServiceOrderNotesService(adminStore.prisma).create(orderPublicId, { text: "Admin" }, { ...other, isAdmin: true })).data.text, "Admin");
});

test("autor exclui a própria nota com snapshot integral antes do hard delete", async () => {
  const store = fakeStore();
  const service = new ServiceOrderNotesService(store.prisma);
  assert.equal((await service.remove(orderPublicId, notePublicId, author)).data.deleted, true);
  assert.equal(store.getNote(), null);
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0].eventCode, "SERVICE_ORDER_NOTE_DELETED");
  assert.equal(store.audits[0].detailsJson.text, "Conteúdo integral");
  assert.equal(store.audits[0].detailsJson.notePublicId, notePublicId);
  assert.equal(store.audits[0].detailsJson.serviceOrderPublicId, orderPublicId);
  assert.equal(store.audits[0].detailsJson.authorUserPublicId, author.publicId);
  assert.equal(store.audits[0].detailsJson.deletedByUserPublicId, author.publicId);
  await assert.rejects(service.remove(orderPublicId, notePublicId, author), (error) => code(error) === "SERVICE_ORDER_NOTE_NOT_FOUND");
});

test("terceiro sem delete_any é negado; com delete_any ou Admin consegue", async () => {
  const denied = fakeStore();
  await assert.rejects(new ServiceOrderNotesService(denied.prisma).remove(orderPublicId, notePublicId, other), (error) => code(error) === "PERMISSION_DENIED");
  assert.ok(denied.getNote());
  const granted = fakeStore();
  granted.grants.add(`${other.id}:service_orders.notes.delete_any`);
  await new ServiceOrderNotesService(granted.prisma).remove(orderPublicId, notePublicId, other);
  assert.equal(granted.getNote(), null);
  const adminStore = fakeStore();
  await new ServiceOrderNotesService(adminStore.prisma).remove(orderPublicId, notePublicId, { ...other, isAdmin: true });
  assert.equal(adminStore.getNote(), null);
});

test("vínculo OS + notePublicId evita IDOR e falhas da auditoria ou exclusão revertem a transação", async () => {
  const store = fakeStore();
  await assert.rejects(new ServiceOrderNotesService(store.prisma).remove(otherOrderPublicId, notePublicId, author), (error) => code(error) === "SERVICE_ORDER_NOT_FOUND");
  assert.ok(store.getNote());
  const auditFailure = fakeStore({ auditFails: true });
  await assert.rejects(new ServiceOrderNotesService(auditFailure.prisma).remove(orderPublicId, notePublicId, author), /audit failed/);
  assert.ok(auditFailure.getNote());
  assert.equal(auditFailure.audits.length, 0);
  const deleteFailure = fakeStore({ deleteFails: true });
  await assert.rejects(new ServiceOrderNotesService(deleteFailure.prisma).remove(orderPublicId, notePublicId, author), /delete failed/);
  assert.ok(deleteFailure.getNote());
  assert.equal(deleteFailure.audits.length, 0);
});

test("histórico mescla fontes sem pular/repetir em empate e filtra payload", async () => {
  const instant = new Date("2026-10-14T12:00:00.000Z");
  const earlier = new Date("2026-10-14T11:00:00.000Z");
  const actor = { publicId: author.publicId, username: author.username };
  const events = [
    { id: 7, serviceOrderId: 2, openingId: null, occurredAt: instant, eventType: "SITUACAO_OPERACIONAL_ALTERADA", numberValue: 128n, actor, payload: { previousOperationalStatus: "TRIAGEM", secret: "hidden" } },
    { id: 6, serviceOrderId: null, openingId: 3, occurredAt: instant, eventType: "OTHER", numberValue: 128n, actor, payload: { secret: "hidden" } },
    { id: 5, serviceOrderId: 2, openingId: null, occurredAt: earlier, eventType: "OTHER", numberValue: 128n, actor, payload: null },
  ];
  const notes = [
    { id: 4, serviceOrderId: 2, publicId: notePublicId, createdAt: instant, text: "Primeira", authorUserId: author.id, author: actor },
    { id: 3, serviceOrderId: 2, publicId: otherOrderPublicId, createdAt: earlier, text: "Segunda", authorUserId: other.id, author: { publicId: other.publicId, username: other.username } },
  ];
  function match(filter, row) {
    if (!filter) return true;
    if (filter.AND && !filter.AND.every((condition) => match(condition, row))) return false;
    if (filter.OR && !filter.OR.some((condition) => match(condition, row))) return false;
    for (const field of ["serviceOrderId", "openingId", "id", "occurredAt", "createdAt"]) {
      if (filter[field] === undefined) continue;
      const expected = filter[field];
      if (expected && typeof expected === "object" && !(expected instanceof Date)) {
        if (expected.lt !== undefined && !(row[field] < expected.lt)) return false;
        if (expected.lte !== undefined && !(row[field] <= expected.lte)) return false;
      } else if (row[field]?.valueOf() !== expected?.valueOf()) return false;
    }
    return true;
  }
  const tx = {
    serviceOrder: { async findFirst() { return { id: 2, openingId: 3 }; } },
    serviceOrderEvent: { async findMany({ where, take }) { return events.filter((row) => match(where, row)).sort((a, b) => b.occurredAt - a.occurredAt || b.id - a.id).slice(0, take); } },
    serviceOrderNote: { async findMany({ where, take }) { return notes.filter((row) => match(where, row)).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id).slice(0, take); } },
    userPermission: { async findFirst() { return null; } },
  };
  const service = new ServiceOrderHistoryService({ async $transaction(callback) { return callback(tx); } });
  const seen = [];
  let cursor;
  do {
    const result = await service.list(orderPublicId, { pageSize: 1, cursor }, author);
    assert.ok(result.data.length <= 1);
    seen.push(...result.data);
    cursor = result.nextCursor ?? undefined;
    if (!result.hasMore) break;
  } while (seen.length < 10);
  assert.equal(seen.length, 5);
  assert.deepEqual(seen.map((item) => item.kind), ["SYSTEM_EVENT", "SYSTEM_EVENT", "MANUAL_NOTE", "SYSTEM_EVENT", "MANUAL_NOTE"]);
  assert.deepEqual(seen[0].payload, { previousOperationalStatus: "TRIAGEM" });
  assert.equal(seen[1].payload, null);
  assert.equal(seen[2].canDelete, true);
  assert.equal(seen[4].canDelete, false);
  assert.ok(seen.every((item) => !Object.hasOwn(item, "id") && !Object.hasOwn(item, "detailsJson")));
});
