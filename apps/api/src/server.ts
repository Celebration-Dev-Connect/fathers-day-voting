import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { config } from "./config.js";
import { buildApp } from "./app.js";
import { createEmailProvider } from "./email/index.js";
import { createStorage } from "./media/storage/index.js";
import { createModerator } from "./media/moderation/index.js";
import { createTextModerator } from "./text/moderation/index.js";

// Log the actual AWS identity the process is running as so we can confirm
// the ECS task role is being used (not a fallback user or another role).
if (config.moderation.driver === "rekognition") {
  try {
    const sts = new STSClient({ region: config.aws.region });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log("[aws-identity]", JSON.stringify(identity));
    console.log("[rekognition-region] configured:", config.aws.region);
  } catch (err) {
    console.error("[aws-identity] failed to get caller identity:", err);
  }
}

const storage = createStorage();
const moderator = createModerator();
const textModerator = createTextModerator();
const emailProvider = createEmailProvider();
const { app, worker, importWorker } = await buildApp({ storage, moderator, textModerator, emailProvider });

await app.listen({ port: config.port, host: config.host });
worker.start();
importWorker.start();
