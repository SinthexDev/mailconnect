import { lookup } from "node:dns/promises";
import { isPublicAddress, webhookFolderIncluded, webhookRequestHeaders, type MailboxWebhook, type WebhookEvent } from "@mailconnect/domain";

const MAX_MESSAGES = 50;

export async function deliverWebhooks(event: WebhookEvent): Promise<void> {
  await Promise.all(event.hooks.map((hook) => {
    const matched = event.messages.filter((message) => webhookFolderIncluded(message.folder, hook.excludedFolders ?? []));
    const messages = matched.slice(0, MAX_MESSAGES);
    if (messages.length === 0) return Promise.resolve();
    const body = JSON.stringify({
      event: "mail.arrived",
      mailboxId: event.mailboxId,
      displayName: event.displayName,
      email: event.email,
      count: messages.length,
      truncated: event.count > event.messages.length || matched.length > messages.length,
      messages,
    });
    return postWebhook(hook, body);
  }));
}

async function postWebhook(hook: MailboxWebhook, body: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(hook.url);
  } catch {
    return;
  }
  const host = parsed.hostname;
  const request = webhookRequestHeaders(hook);
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0 || records.some((record) => !isPublicAddress(record.address))) {
      console.error(`Webhook abgelehnt: ${host}`);
      return;
    }
    const response = await fetch(hook.url, {
      method: request.method,
      headers: request.headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.error(`Webhook ${host} antwortete ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "fehlgeschlagen";
    console.error(`Webhook ${host}: ${message}`);
  }
}
