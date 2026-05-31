import { config } from "./config.js";
import { buildApp } from "./app.js";
import { createStorage } from "./media/storage/index.js";
import { createModerator } from "./media/moderation/index.js";
import { PhotoModerationWorker } from "./media/worker.js";

const storage = createStorage();
const moderator = createModerator();
const { app, worker } = await buildApp({ storage, moderator });

await app.listen({ port: config.port, host: config.host });
worker.start();
