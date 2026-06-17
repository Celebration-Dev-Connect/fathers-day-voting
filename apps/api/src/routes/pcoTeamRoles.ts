import { StaffRole, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";

const roleSchema = z.nativeEnum(StaffRole);

export async function registerPcoTeamRoleRoutes(app: FastifyInstance) {
  app.get("/admin/pco-team-roles", async (request) => {
    await requireAdmin(app, request);
    return {
      teamRoles: await prisma.pcoTeamRole.findMany({
        orderBy: [{ pcoTeamName: "asc" }, { positionName: "asc" }],
      }),
    };
  });

  app.post("/admin/pco-team-roles", async (request) => {
    await requireAdmin(app, request);
    const body = z
      .object({
        pcoTeamName: z.string().trim().min(1),
        positionName: z.string().trim().min(1).nullable().optional(),
        role: roleSchema,
      })
      .parse(request.body);

    const positionName = body.positionName?.trim() || null;

    const duplicate = await prisma.pcoTeamRole.findFirst({
      where: { pcoTeamName: body.pcoTeamName, positionName },
    });
    if (duplicate) {
      throw app.httpErrors.conflict(
        positionName
          ? `A mapping for "${body.pcoTeamName}" / "${positionName}" already exists.`
          : `A whole-team mapping for "${body.pcoTeamName}" already exists.`,
      );
    }

    const teamRole = await prisma.pcoTeamRole.create({
      data: { pcoTeamName: body.pcoTeamName, positionName, role: body.role },
    });
    return { teamRole };
  });

  app.patch("/admin/pco-team-roles/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        role: roleSchema.optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.pcoTeamRole.findUnique({ where: { id: params.id } });
    if (!existing) throw app.httpErrors.notFound("Team role mapping not found");

    const teamRole = await prisma.pcoTeamRole.update({ where: { id: existing.id }, data: body });
    return { teamRole };
  });

  app.delete("/admin/pco-team-roles/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.pcoTeamRole.findUnique({ where: { id: params.id } });
    if (!existing) throw app.httpErrors.notFound("Team role mapping not found");

    await prisma.pcoTeamRole.delete({ where: { id: existing.id } });
    return { ok: true };
  });
}
