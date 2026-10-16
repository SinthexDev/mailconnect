import assert from "node:assert/strict";
import test from "node:test";
import { messageText } from "./html-text.js";

const button = `
<p>Bitte setze dein Passwort neu.</p>
<a href="https://example.com/reset?token=abc&amp;lang=de">Passwort zurücksetzen</a>
<a href="javascript:void(0)">nicht folgen</a>
`;

test("a button link survives when the mail is html only", () => {
  const message = messageText("", button);
  assert.equal(message.links.length, 1);
  assert.equal(message.links[0]?.href, "https://example.com/reset?token=abc&lang=de");
  assert.equal(message.links[0]?.text, "Passwort zurücksetzen");
  assert.match(message.text, /Passwort zurücksetzen \(https:\/\/example\.com\/reset\?token=abc&lang=de\)/);
});

test("a plain part without the url still receives the button target", () => {
  const message = messageText("Bitte den Button in der Mail benutzen.", button);
  assert.match(message.text, /Bitte den Button in der Mail benutzen\./);
  assert.match(message.text, /Passwort zurücksetzen: https:\/\/example\.com\/reset\?token=abc&lang=de/);
});

test("a url that is already in the text is not repeated", () => {
  const href = "https://example.com/reset?token=abc&lang=de";
  const message = messageText(`Link: ${href}`, button.replace("&amp;", "&"));
  assert.equal(message.text, `Link: ${href}`);
});
