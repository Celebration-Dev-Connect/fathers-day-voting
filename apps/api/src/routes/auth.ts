import { prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStaff } from "../auth.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/dev-login", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      throw app.httpErrors.notFound("Dev login is disabled in production");
    }

    const body = z.object({ email: z.string().email() }).parse(request.body);
    const staff = await prisma.staffUser.findUnique({
      where: { email: body.email },
    });

    if (!staff?.devLogin || !staff.active) {
      throw app.httpErrors.unauthorized("Unknown dev staff user");
    }

    const token = app.jwt.sign({
      staffUserId: staff.id,
      role: staff.role,
    });

    return reply.send({
      token,
      staff: {
        id: staff.id,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
      },
    });
  });

  app.get("/auth/planning-center/start", async () => {
    throw app.httpErrors.notImplemented("Planning Center OAuth is configured in production setup later");
  });

  app.get("/auth/me", async (request) => {
    const staff = await requireStaff(app, request);
    return {
      staff: {
        id: staff.id,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
      },
    };
  });
}

