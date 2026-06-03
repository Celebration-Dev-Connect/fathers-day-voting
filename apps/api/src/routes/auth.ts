import { StaffRole, prisma } from "@carshow/db";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStaff } from "../auth.js";
import { config } from "../config.js";

const pcoMeSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      first_name: z.string().nullable().optional(),
      last_name: z.string().nullable().optional(),
      primary_email_address: z.string().nullable().optional(),
    }),
  }),
});

const pcoTeamsSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

const pcoAssignmentsSchema = z.object({
  data: z.array(
    z.object({
      relationships: z.object({
        person: z.object({ data: z.object({ id: z.string() }) }),
        team_position: z.object({ data: z.object({ id: z.string() }) }),
      }),
    }),
  ),
  included: z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      attributes: z.object({ name: z.string() }).passthrough(),
    }),
  ),
});

const POSITION_ROLE_MAP: Record<string, StaffRole> = {
  admin: StaffRole.ADMIN,
  judge: StaffRole.JUDGE,
  registrar: StaffRole.REGISTRAR,
};

async function resolvePcoRole(
  pcoPersonId: string,
  accessToken: string,
  teamName: string,
  log: FastifyBaseLogger,
): Promise<StaffRole | null> {
  const teamsRes = await fetch(
    `https://api.planningcenteronline.com/services/v2/teams?where[name]=${encodeURIComponent(teamName)}&per_page=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!teamsRes.ok) {
    log.error({ status: teamsRes.status }, "PCO teams fetch failed");
    return null;
  }
  const teamsBody = await teamsRes.json();
  log.info({ teamName, teamsBody }, "PCO teams response");
  const teams = pcoTeamsSchema.parse(teamsBody);
  const teamId = teams.data[0]?.id;
  if (!teamId) {
    log.warn({ teamName }, "PCO team not found — check team name matches exactly in PCO Services");
    return null;
  }

  const assignRes = await fetch(
    `https://api.planningcenteronline.com/services/v2/teams/${teamId}/person_team_position_assignments?include=team_position`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!assignRes.ok) {
    log.error({ status: assignRes.status }, "PCO PTPA fetch failed");
    return null;
  }
  const assignBody = await assignRes.json();
  const allPersonIds = (assignBody as any).data?.map((a: any) => a.relationships?.person?.data?.id);
  const allPositions = (assignBody as any).included?.filter((i: any) => i.type === "TeamPosition").map((i: any) => ({ id: i.id, name: i.attributes?.name }));
  log.info({ teamId, pcoPersonId, allPersonIds, allPositions }, "PCO team assignments");

  const assignments = pcoAssignmentsSchema.parse(assignBody);

  const myAssignment = assignments.data.find(
    (a) => a.relationships.person.data.id === pcoPersonId,
  );
  if (!myAssignment) {
    log.warn({ pcoPersonId, allPersonIds }, "PCO person not found in team assignments");
    return null;
  }

  const tpId = myAssignment.relationships.team_position.data.id;
  const position = assignments.included.find(
    (i) => i.type === "TeamPosition" && i.id === tpId,
  );
  if (!position) {
    log.warn({ tpId, allPositions }, "PCO team position not found in included data");
    return null;
  }

  const positionName = position.attributes.name;
  const role = POSITION_ROLE_MAP[positionName.toLowerCase()] ?? null;
  log.info({ positionName, role }, "PCO position resolved");
  return role;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/dev-login", async (request, reply) => {
    if (!config.enableDevLogin) {
      throw app.httpErrors.notFound("Dev login is disabled");
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

  if (config.planningCenter.clientId && config.planningCenter.clientSecret && config.planningCenter.callbackUrl) {
    app.get("/auth/planning-center/start", async (request, reply) => {
      const { app: targetApp } = z
        .object({ app: z.enum(["admin", "judge"]).default("admin") })
        .parse(request.query);

      reply.setCookie("pco_target_app", targetApp, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });

      const authUri = await app.oauth2PlanningCenter!.generateAuthorizationUri(request, reply);
      return reply.redirect(authUri);
    });

    app.get("/auth/planning-center/callback", async (request, reply) => {
      const tokenSet = await app.oauth2PlanningCenter!.getAccessTokenFromAuthorizationCodeFlow(request, reply);
      const accessToken = tokenSet.token.access_token;

      const pcoMeRes = await fetch("https://api.planningcenteronline.com/people/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!pcoMeRes.ok) {
        app.log.error({ status: pcoMeRes.status }, "Failed to fetch PCO user info");
        throw app.httpErrors.badGateway("Failed to fetch user info from Planning Center");
      }

      const pcoMe = pcoMeSchema.parse(await pcoMeRes.json());
      const pcoPersonId = pcoMe.data.id;
      const attrs = pcoMe.data.attributes;
      const displayName =
        [attrs.first_name, attrs.last_name].filter(Boolean).join(" ") || `PCO User ${pcoPersonId}`;
      const email = attrs.primary_email_address ?? `pco-${pcoPersonId}@placeholder.local`;

      const targetApp = (request.cookies as Record<string, string>).pco_target_app ?? "admin";
      reply.clearCookie("pco_target_app", { path: "/" });
      const spaUrl = targetApp === "judge" ? (config.judgeWebUrl ?? "") : (config.adminWebUrl ?? "");

      const role = await resolvePcoRole(pcoPersonId, accessToken, config.planningCenter.teamName, app.log);
      if (!role) {
        return reply.redirect(`${spaUrl}/#error=unauthorized`);
      }

      const staff = await prisma.staffUser.upsert({
        where: { planningCenterId: pcoPersonId },
        create: { planningCenterId: pcoPersonId, email, displayName, role, active: true, devLogin: false },
        update: { email, displayName, role, active: true },
      });

      const jwt = app.jwt.sign({ staffUserId: staff.id, role: staff.role });
      return reply.redirect(`${spaUrl}/#token=${jwt}`);
    });
  }

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
