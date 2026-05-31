import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerJudgingRoutes } from "./routes/judging.js";
import { registerQrCardRoutes } from "./routes/qrCards.js";
import { registerRegistrationRoutes } from "./routes/registrations.js";
import { registerVotingRoutes } from "./routes/voting.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(sensible);

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "local-dev-secret-change-me",
  });

  app.get("/health", async () => {
    return { ok: true };
  });

  await registerAuthRoutes(app);
  await registerCategoryRoutes(app);
  await registerVotingRoutes(app);
  await registerJudgingRoutes(app);
  await registerRegistrationRoutes(app);
  await registerQrCardRoutes(app);

  return app;
}
