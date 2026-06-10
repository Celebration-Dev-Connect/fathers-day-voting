import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import oauth2 from "@fastify/oauth2";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { config } from "./config.js";
import type { ImageModerator } from "./media/moderation/index.js";
import type { PhotoStorage } from "./media/storage/index.js";
import type { TextModerator } from "./text/moderation/index.js";
import { PhotoModerationWorker } from "./media/worker.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerInternalRoutes } from "./routes/internal.js";
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
  textModerator: TextModerator;
};

export async function buildApp({ storage, moderator, textModerator }: AppDeps) {
  const app = Fastify({ logger: true, trustProxy: true });

  // When an explicit allowlist is configured (prod), restrict to it; otherwise
  // reflect any origin (dev SPAs on localhost ports; prod SPAs are same-origin).
  await app.register(cors, {
    origin: config.corsAllowedOrigins ?? true,
    credentials: true,
  });
  await app.register(sensible);
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { files: 1, fileSize: config.photos.maxBytes } });
  await app.register(rateLimit, { global: false });

  if (config.planningCenter.clientId && config.planningCenter.clientSecret && config.planningCenter.callbackUrl) {
    await app.register(oauth2, {
      name: "planningCenter",
      credentials: {
        client: {
          id: config.planningCenter.clientId,
          secret: config.planningCenter.clientSecret,
        },
        auth: {
          authorizeHost: "https://api.planningcenteronline.com",
          authorizePath: "/oauth/authorize",
          tokenHost: "https://api.planningcenteronline.com",
          tokenPath: "/oauth/token",
        },
      },
      callbackUri: config.planningCenter.callbackUrl,
      scope: ["people", "services"],
    });
  }

  const worker = new PhotoModerationWorker(storage, moderator, app.log);

  app.get("/health", async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerInternalRoutes(app);
  await registerCategoryRoutes(app);
  await registerVotingRoutes(app);
  await registerJudgingRoutes(app);
  await registerRegistrationRoutes(app);
  await registerQrCardRoutes(app);
  await registerOwnerRoutes(app, { textModerator });
  await registerPhotosRoutes(app, { storage, worker });
  await registerPublicRoutes(app);

  return { app, worker };
}
