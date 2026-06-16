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

export interface OwnerInviteVehicle {
  entryNumber: string;
  vehicleName: string;
  category: string;
  accessCode: string;
}

export interface OwnerInviteOptions {
  firstName: string;
  lastName: string;
  email: string;
  portalUrl: string;
  vehicles: OwnerInviteVehicle[];
}

export async function buildOwnerInviteEmail(options: OwnerInviteOptions): Promise<EmailMessage> {
  const logoDataUri = await getLogoDataUri();

  const { html, text } = await renderTemplate("owner-invite", {
    firstName: options.firstName,
    portalUrl: options.portalUrl,
    logoDataUri,
    vehicles: options.vehicles,
  });

  return {
    to: options.email,
    toName: `${options.firstName} ${options.lastName}`,
    subject: "Your Father's Day Car Show Access Code",
    html,
    text,
  };
}
