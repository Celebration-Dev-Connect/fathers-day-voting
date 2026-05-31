import type { FastifyInstance, FastifyRequest } from "fastify";
import { StaffRole, prisma } from "@carshow/db";
import { z } from "zod";

export type StaffSession = {
  staffUserId: string;
  role: StaffRole;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: StaffSession;
    user: StaffSession;
  }
}

const authHeaderSchema = z.object({
  authorization: z.string().optional(),
});

export async function requireStaff(app: FastifyInstance, request: FastifyRequest) {
  const headers = authHeaderSchema.parse(request.headers);
  if (!headers.authorization?.startsWith("Bearer ")) {
    throw app.httpErrors.unauthorized("Missing staff session");
  }

  const token = headers.authorization.replace("Bearer ", "");
  const session = app.jwt.verify<StaffSession>(token);
  const staff = await prisma.staffUser.findUnique({
    where: { id: session.staffUserId },
  });

  if (!staff?.active) {
    throw app.httpErrors.unauthorized("Staff account is inactive");
  }

  return staff;
}

export async function requireAdmin(app: FastifyInstance, request: FastifyRequest) {
  const staff = await requireStaff(app, request);
  if (staff.role !== StaffRole.ADMIN) {
    throw app.httpErrors.forbidden("Admin role required");
  }
  return staff;
}

