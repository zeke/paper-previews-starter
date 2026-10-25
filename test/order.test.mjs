import { test } from "node:test";
import assert from "node:assert/strict";
import { creationTimestamp, orderDesigns } from "../src/order.mjs";

const board = (id, name, createdSequence, extra = {}) => ({
  id,
  name,
  fileId: "selected",
  pageId: "page",
  createdSequence,
  sourceCreatedAt: null,
  ...extra,
});

test("newest design groups stay paired with public before admin", () => {
  const rows = [
    board("old-public", "D1A · Earlier · Public", 1),
    board("new-public", "D2A · Later · Public", 2),
    board("old-admin", "D1B · Earlier · Admin", 3),
    board("new-admin", "D2B · Later · Admin", 4),
  ];
  const result = orderDesigns(rows);
  assert.equal(result.basis, "first-discovery-sequence");
  assert.deepEqual(
    result.boards.map((b) => b.id),
    ["new-public", "new-admin", "old-public", "old-admin"],
  );
  assert.deepEqual(
    rows.map((b) => b.id),
    ["old-public", "new-public", "old-admin", "new-admin"],
  );
});

test("real creation metadata wins when complete; capture and edit times never rank designs", () => {
  const older = board("older", "Older", 10, {
    sourceCreatedAt: creationTimestamp("2025-01-01T00:00:00Z"),
    updatedAt: "2099-01-01T00:00:00Z",
  });
  const newer = board("newer", "Newer", 1, {
    sourceCreatedAt: creationTimestamp("2026-01-01T00:00:00Z"),
    updatedAt: "2020-01-01T00:00:00Z",
  });
  assert.deepEqual(
    orderDesigns([older, newer]).boards.map((b) => b.id),
    ["newer", "older"],
  );
  assert.equal(orderDesigns([older, newer]).basis, "creation-metadata");
  assert.equal(creationTimestamp("not a timestamp"), null);
  assert.equal(creationTimestamp(null), null);
});

test("ties are deterministic and mixed creation metadata uses one consistent fallback", () => {
  const rows = [
    board("c", "C", 4, { sourceCreatedAt: 100 }),
    board("a", "A", 4),
    board("b", "B", 4, { sourceCreatedAt: 500 }),
  ];
  assert.deepEqual(
    orderDesigns(rows).boards.map((b) => b.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    orderDesigns([...rows].reverse()).boards.map((b) => b.id),
    ["a", "b", "c"],
  );
  assert.equal(orderDesigns(rows).basis, "first-discovery-sequence");
});
