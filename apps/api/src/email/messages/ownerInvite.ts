import type { EmailMessage } from "../types.js";
import { renderTemplate } from "../templates.js";

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
  const { html, text } = await renderTemplate("owner-invite", {
    firstName: options.firstName,
    portalUrl: options.portalUrl,
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
