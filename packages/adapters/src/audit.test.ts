import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { AuditService } from "@mailconnect/domain";
import { SqliteDatabase } from "./sqlite.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "mailconnect-audit-"));
  const db = new SqliteDatabase(join(dir, "test.sqlite"), randomBytes(32));
  let n = 0;
  const audit = new AuditService(db.audit, { newId: () => crypto.randomUUID() }, { now: () => new Date(Date.UTC(2026, 9, 29, 12, 0, n++)).toISOString() });
  return { db, audit };
}

const admin = { id: "u1", email: "a@x.de", username: null, role: "admin" } as const;
const other = { id: "u2", email: "b@x.de", username: null, role: "user" } as const;

test("several agents behind one token stay distinguishable", () => {
  const { audit } = setup();
  for (const agent of ["Nora", "Nora", "Vertrieb"]) {
    audit.record({ userId: "u1", source: "mcp", category: "read", action: "search_messages", status: "ok", tokenId: "t1", tokenName: "Grok", agentName: agent });
  }
  audit.record({ userId: "u1", source: "mcp", category: "send", action: "send_email", status: "ok", tokenId: "t1", tokenName: "Grok", agentName: "Vertrieb", input: { to: ["k@x.de"], subject: "Hi", password: "x" } });
  const agents = audit.agents(admin);
  assert.equal(agents.length, 2);
  const vertrieb = agents.find((item) => item.agentName === "Vertrieb");
  assert.equal(vertrieb?.calls, 2);
  assert.equal(vertrieb?.sends, 1);
  assert.deepEqual(vertrieb?.tools, ["search_messages", "send_email"]);
  assert.equal(audit.list(admin, { agent: "Nora" }).total, 2);
  const sent = audit.list(admin, { category: "send" }).events[0];
  assert.deepEqual(sent?.input, { to: ["k@x.de"], subject: "Hi", password: "[redacted]" });
  assert.equal(audit.list(admin, { q: "k@x.de" }).total, 1);
});

test("users only see their own events, admins also unowned ones", () => {
  const { audit } = setup();
  audit.record({ userId: "u1", source: "web", category: "read", action: "a", status: "ok" });
  audit.record({ userId: "u2", source: "web", category: "read", action: "b", status: "ok" });
  audit.record({ userId: null, source: "mcp", category: "auth", action: "mcp.auth", status: "denied" });
  assert.equal(audit.list(other, {}).total, 1);
  assert.equal(audit.list(admin, {}).total, 2);
});

test("hash chain detects tampering", () => {
  const { db, audit } = setup();
  for (let i = 0; i < 4; i += 1) audit.record({ userId: "u1", source: "web", category: "read", action: `x${i}`, status: "ok" });
  assert.deepEqual(audit.verify(admin), { ok: true, checked: 4, brokenAtSeq: null });
  db.db.prepare("UPDATE audit_events SET action = 'manipuliert' WHERE seq = 2").run();
  assert.deepEqual(audit.verify(admin), { ok: false, checked: 1, brokenAtSeq: 2 });
  assert.throws(() => audit.verify(other));
});
