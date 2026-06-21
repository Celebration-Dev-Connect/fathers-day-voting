import { config } from "../config.js";
import { ConsoleEmailProvider } from "./providers/console.js";
import { SesEmailProvider } from "./providers/ses.js";
import type { EmailProvider } from "./types.js";

export function createEmailProvider(): EmailProvider {
  if (config.email.driver === "ses") {
    return new SesEmailProvider({
      host: config.email.smtp.host!,
      port: config.email.smtp.port,
      username: config.email.smtp.username!,
      password: config.email.smtp.password!,
      fromAddress: config.email.fromAddress,
      fromName: config.email.fromName,
    });
  }
  return new ConsoleEmailProvider();
}

export type { EmailProvider } from "./types.js";
export { buildOwnerInviteEmail } from "./messages/ownerInvite.js";
export type { OwnerInviteVehicle, OwnerInviteOptions } from "./messages/ownerInvite.js";
export { buildOwnerRainUpdateEmail } from "./messages/ownerRainUpdate.js";
export type { OwnerRainUpdateOptions } from "./messages/ownerRainUpdate.js";
export { buildOwnerVotingUpdateEmail } from "./messages/ownerVotingUpdate.js";
export type { OwnerVotingUpdateOptions } from "./messages/ownerVotingUpdate.js";
