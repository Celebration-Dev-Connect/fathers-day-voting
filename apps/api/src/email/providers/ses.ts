import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "../types.js";

export interface SesSmtpProviderOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

/**
 * AWS SES SMTP provider via nodemailer.
 * Credentials come from environment variables — never hardcoded.
 * Set EMAIL_DRIVER=ses in production.
 */
export class SesEmailProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(options: SesSmtpProviderOptions) {
    this.from = `${options.fromName} <${options.fromAddress}>`;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: true,
      auth: {
        user: options.username,
        pass: options.password,
      },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.toName ? `${message.toName} <${message.to}>` : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
