import { StaffRole, prisma } from "@carshow/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { getPlanningCenterTeam, hasPlanningCenterApiCredentials, searchPlanningCenterTeams } from "../services/planningCenter.js";

const roleSchema = z.nativeEnum(StaffRole);
const fallbackAdminMappingId = "default-admin-team";

export async function registerPcoTeamRoleRoutes(app: FastifyInstance) {
  app.get("/admin/pco-services/teams/search", async (request) => {
    await requireAdmin(app, request);
    const query = z.object({ q: z.string().trim().min(2) }).parse(request.query);
    if (!hasPlanningCenterApiCredentials()) {
      throw app.httpErrors.failedDependency("Planning Center API credentials are not configured");
    }
    return { teams: await searchPlanningCenterTeams(query.q, app.log) };
  });

  app.get("/admin/pco-services/teams/:teamId", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ teamId: z.string().trim().min(1) }).parse(request.params);
    if (!hasPlanningCenterApiCredentials()) {
      throw app.httpErrors.failedDependency("Planning Center API credentials are not configured");
    }
    return { team: await getPlanningCenterTeam(params.teamId, app.log, true) };
  });

  app.get("/admin/pco-team-roles", async (request) => {
    await requireAdmin(app, request);
    return {
      teamRoles: await prisma.pcoTeamRole.findMany({
        orderBy: [{ pcoServiceTypeName: "asc" }, { pcoTeamName: "asc" }, { positionName: "asc" }],
      }),
    };
  });

  app.post("/admin/pco-team-roles", async (request) => {
    await requireAdmin(app, request);
    const body = z
      .object({
        pcoTeamId: z.string().trim().min(1),
        pcoTeamName: z.string().trim().min(1),
        pcoServiceTypeName: z.string().trim().min(1).nullable().optional(),
        positionName: z.string().trim().min(1).nullable().optional(),
        role: roleSchema,
      })
      .parse(request.body);

    const positionName = body.positionName?.trim() || null;
    const serviceTypeName = body.pcoServiceTypeName?.trim() || null;

    const duplicate = await prisma.pcoTeamRole.findFirst({
      where: { pcoTeamId: body.pcoTeamId, positionName },
    });
    if (duplicate) {
      throw app.httpErrors.conflict(
        positionName
          ? `A mapping for "${body.pcoTeamName}" / "${positionName}" already exists.`
          : `A whole-team mapping for "${body.pcoTeamName}" already exists.`,
      );
    }

    const teamRole = await prisma.pcoTeamRole.create({
      data: {
        pcoTeamId: body.pcoTeamId,
        pcoTeamName: body.pcoTeamName,
        pcoServiceTypeName: serviceTypeName,
        positionName,
        role: body.role,
      },
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
    if (existing.id === fallbackAdminMappingId && body.active === false) {
      throw app.httpErrors.badRequest("The fallback carshow admin mapping cannot be disabled");
    }

    const teamRole = await prisma.pcoTeamRole.update({ where: { id: existing.id }, data: body });
    return { teamRole };
  });

  app.delete("/admin/pco-team-roles/:id", async (request) => {
    await requireAdmin(app, request);
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.pcoTeamRole.findUnique({ where: { id: params.id } });
    if (!existing) throw app.httpErrors.notFound("Team role mapping not found");
    if (existing.id === fallbackAdminMappingId) {
      throw app.httpErrors.badRequest("The fallback carshow admin mapping cannot be deleted");
    }

    await prisma.pcoTeamRole.delete({ where: { id: existing.id } });
    return { ok: true };
  });
}
