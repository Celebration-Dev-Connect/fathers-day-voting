import type { EmailMessage, EmailProvider } from "../types.js";

/**
 * Development provider: prints emails to stdout instead of sending them.
 * Set EMAIL_DRIVER=console (the default in non-production environments).
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      [
        "╔══ [EMAIL - not sent in dev] ══════════════════════════════",
        `  To:      ${message.toName ? `${message.toName} <${message.to}>` : message.to}`,
        `  Subject: ${message.subject}`,
        "  ── text/plain ──────────────────────────────────────────",
        message.text
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
        "╚═══════════════════════════════════════════════════════════",
      ].join("\n"),
    );
  }
}
