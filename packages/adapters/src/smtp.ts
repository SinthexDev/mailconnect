import nodemailer from "nodemailer";
import { mailPriorityHeaders, type OutboundMail, type SmtpPort, type SmtpSettings } from "@mailconnect/domain";
import { connectionError } from "./mail-error.js";

function transport(settings: SmtpSettings, socketTimeout = 30_000) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure,
    auth: { user: settings.username, pass: settings.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout,
    tls: { minVersion: "TLSv1.2" },
  });
}

export const smtpAdapter: SmtpPort = {
  async test(settings) {
    const client = transport(settings);
    try {
      await client.verify();
    } catch (error) {
      throw connectionError("SMTP", error);
    } finally {
      client.close();
    }
  },

  async send(settings, message: OutboundMail) {
    const client = transport(settings, 120_000);
    const recipients = [...message.to, ...message.cc, ...message.bcc];
    const headers = mailPriorityHeaders(message.priority);
    const options = {
      from: message.from.name
        ? { name: message.from.name, address: message.from.address }
        : message.from.address,
      to: message.to,
      cc: message.cc.length ? message.cc : undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers,
      attachments: message.attachments?.map((item) => ({
        filename: item.filename,
        content: Buffer.from(item.content),
        contentType: item.contentType,
        cid: item.contentId,
      })),
    };
    try {
      const imported = await import("nodemailer/lib/mail-composer/index.js") as {
        default: new (mail: object) => { compile: () => { messageId: () => string; build: () => Promise<Buffer> } };
      };
      const compiled = new imported.default(options).compile();
      const messageId = compiled.messageId();
      const raw = await compiled.build();
      await client.sendMail({
        envelope: { from: message.from.address, to: recipients },
        raw,
      });
      return { messageId, raw };
    } catch (error) {
      throw connectionError("SMTP", error);
    } finally {
      client.close();
    }
  },
};
