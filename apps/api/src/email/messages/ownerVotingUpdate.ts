import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmailMessage } from "../types.js";
import { renderTemplate } from "../templates.js";

const emailDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../text/email");
let logoDataUri: string | null = null;

async function getLogoDataUri(): Promise<string> {
  if (!logoDataUri) {
    const buf = await readFile(resolve(emailDir, "logo-header.png"));
    logoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return logoDataUri;
}

export interface OwnerVotingUpdateOptions {
  firstName: string;
  lastName: string;
  email: string;
}

export async function buildOwnerVotingUpdateEmail(options: OwnerVotingUpdateOptions): Promise<EmailMessage> {
  const logoDataUri = await getLogoDataUri();

  const { html, text } = await renderTemplate("owner-voting-update", {
    firstName: options.firstName,
    logoDataUri,
  });

  return {
    to: options.email,
    toName: `${options.firstName} ${options.lastName}`,
    subject: "Award Ceremony Moved Up — Starts at 2:30 PM",
    html,
    text,
  };
}
