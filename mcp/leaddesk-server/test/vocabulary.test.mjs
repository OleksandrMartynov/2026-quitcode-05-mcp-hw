// The server speaks the app's vocabulary: LEAD_STATUSES from lib/types.ts and the id format of
// leadId() in lib/db.ts. If the app changes either, these tests fail instead of the server drifting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LEAD_ID, LEAD_STATUSES } from "../src/store.mjs";

const appFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

test("statuses are exactly LEAD_STATUSES of lib/types.ts, in the same order", async () => {
  const declaration = (await appFile("lib/types.ts")).match(/export const LEAD_STATUSES = \[([^\]]*)\] as const/);
  assert.ok(declaration, "LEAD_STATUSES not found in lib/types.ts");
  assert.deepEqual(LEAD_STATUSES, [...declaration[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
});

test("the id pattern accepts what leadId() in lib/db.ts produces and nothing else", async () => {
  assert.match(await appFile("lib/db.ts"), /return `lead_\$\{String\(n\)\.padStart\(4, "0"\)\}`;/);
  for (const n of [1, 42, 9999]) assert.match(`lead_${String(n).padStart(4, "0")}`, LEAD_ID);
  for (const id of ["ld_1001", "lead_1", "lead_00001", "LEAD_0001", "lead_000a", " lead_0001"]) assert.doesNotMatch(id, LEAD_ID);
});
