export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  /**
   * Send a single transactional email. Throws on delivery failure.
   * The implementation is responsible for applying the configured `from`
   * address — callers only supply the recipient and rendered content.
   */
  send(message: EmailMessage): Promise<void>;
}
