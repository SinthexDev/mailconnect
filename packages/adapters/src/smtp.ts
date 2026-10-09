import nodemailer from "nodemailer";
import type { OutboundMail, SmtpPort, SmtpSettings } from "@mailconnect/domain";

function transport(settings: SmtpSettings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure,
    auth: { user: settings.username, pass: settings.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2" },
  });
}

function mailError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : "Verbindung fehlgeschlagen";
  return new Error(`SMTP: ${raw.replace(/\s+/g, " ").slice(0, 180)}`);
}

export const smtpAdapter: SmtpPort = {
  async test(settings) {
    const client = transport(settings);
    try {
      await client.verify();
    } catch (error) {
      throw mailError(error);
    } finally {
      client.close();
    }
  },

  async send(settings, message: OutboundMail) {
    const client = transport(settings);
    try {
      await client.sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc.length ? message.cc : undefined,
        bcc: message.bcc.length ? message.bcc : undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      throw mailError(error);
    } finally {
      client.close();
    }
  },
};
