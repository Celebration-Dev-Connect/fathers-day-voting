import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { config } from "./config.js";
import type { ImageModerator } from "./media/moderation/index.js";
import type { PhotoStorage } from "./media/storage/index.js";
import { PhotoModerationWorker } from "./media/worker.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerJudgingRoutes } from "./routes/judging.js";
import { registerOwnerRoutes } from "./routes/owner.js";
import { registerPhotosRoutes } from "./routes/photos.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerQrCardRoutes } from "./routes/qrCards.js";
import { registerRegistrationRoutes } from "./routes/registrations.js";
import { registerVotingRoutes } from "./routes/voting.js";

export type AppDeps = {
  storage: PhotoStorage;
  moderator: ImageModerator;
};

export async function buildApp({ storage, moderator }: AppDeps) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { files: 1, fileSize: config.photos.maxBytes } });
  await app.register(rateLimit, { global: false });

  const worker = new PhotoModerationWorker(storage, moderator, app.log);

  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerCategoryRoutes(app);
  await registerVotingRoutes(app);
  await registerJudgingRoutes(app);
  await registerRegistrationRoutes(app);
  await registerQrCardRoutes(app);
  await registerOwnerRoutes(app);
  await registerPhotosRoutes(app, { storage, worker });
  await registerPublicRoutes(app);

  return { app, worker };
}
