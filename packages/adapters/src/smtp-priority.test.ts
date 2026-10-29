import assert from "node:assert/strict";
import test from "node:test";
import { mailPriorityHeaders } from "@mailconnect/domain";

test("high priority puts X-Priority and Importance into the raw message", async () => {
  const imported = await import("nodemailer/lib/mail-composer/index.js") as {
    default: new (mail: object) => { compile: () => { build: () => Promise<Buffer> } };
  };
  const raw = (await new imported.default({
    from: "ada@example.com",
    to: "ben@example.com",
    subject: "Dringend",
    text: "Bitte prüfen",
    headers: mailPriorityHeaders("high"),
  }).compile().build()).toString("utf8");
  assert.match(raw, /^X-Priority:\s*1 \(Highest\)\s*$/im);
  assert.match(raw, /^Importance:\s*High\s*$/im);
  assert.match(raw, /^X-MSMail-Priority:\s*High\s*$/im);
});
