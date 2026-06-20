import { StaffRole, prisma } from "@carshow/db";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStaff } from "../auth.js";
import { config } from "../config.js";
import {
  getPersonTeamMemberships,
  planningCenterOAuthHeaders,
  storeStaffTokens,
} from "../services/planningCenter.js";

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

const ROLE_PRIORITY: Record<StaffRole, number> = {
  [StaffRole.ADMIN]: 3,
  [StaffRole.REGISTRAR]: 2,
  [StaffRole.JUDGE]: 1,
};

/** Pick the highest-privilege role from a set of matched roles (ADMIN > REGISTRAR > JUDGE). */
export function pickHighestRole(roles: StaffRole[]): StaffRole | null {
  return roles.reduce<StaffRole | null>(
    (best, role) => (best === null || ROLE_PRIORITY[role] > ROLE_PRIORITY[best] ? role : best),
    null,
  );
}

/**
 * Resolve a staff role from the admin-managed PcoTeamRole mappings. A mapping with no
 * positionName grants its role to any member of the team; one with a positionName grants
 * its role only to people holding that position. Highest privilege across all matches wins.
 *
 * Membership is read with a single person-scoped Planning Center query, so duplicate team
 * names never collide (mappings are matched by team ID) and team size doesn't matter.
 */
async function resolvePcoRole(
  pcoPersonId: string,
  accessToken: string,
  log: FastifyBaseLogger,
): Promise<StaffRole | null> {
  const mappings = await prisma.pcoTeamRole.findMany({ where: { active: true } });
  if (mappings.length === 0) {
    log.warn("No active PCO team-role mappings configured — no staff can sign in via Planning Center");
    return null;
  }

  const memberships = await getPersonTeamMemberships(pcoPersonId, accessToken, log);

  // Key by team ID for ID-based mappings and by team name for the legacy name-only
  // admin fallback. A person without an explicit position still counts as a member,
  // so seed an empty sentinel that whole-team mappings can match.
  const positionsByTeam = new Map<string, string[]>();
  for (const membership of memberships) {
    const positions = membership.positions.length ? membership.positions : [""];
    positionsByTeam.set(membership.teamId, positions);
    positionsByTeam.set(membership.teamName, positions);
  }

  const matchedRoles = matchMappedRoles(mappings, positionsByTeam);
  const role = pickHighestRole(matchedRoles);
  log.info(
    { pcoPersonId, teamCount: memberships.length, matchedRoles, role },
    "PCO role resolved from team mappings",
  );
  return role;
}

type TeamRoleMapping = {
  id?: string;
  pcoTeamId?: string | null;
  pcoTeamName: string;
  positionName: string | null;
  role: StaffRole;
};

/**
 * Given the position names a person holds per team, return the roles they qualify for.
 * A whole-team mapping (positionName === null) matches any member; a positioned mapping
 * matches only that position. A person is a member of a team only if they hold at least
 * one position in it — an empty/absent position list never matches.
 */
export function matchMappedRoles(
  mappings: TeamRoleMapping[],
  positionsByTeam: Map<string, string[]>,
): StaffRole[] {
  const matchedRoles: StaffRole[] = [];
  for (const mapping of mappings) {
    const memberPositions = positionsByTeam.get(mapping.pcoTeamId ?? mapping.pcoTeamName);
    if (!memberPositions || memberPositions.length === 0) continue;
    if (mapping.positionName === null) {
      matchedRoles.push(mapping.role);
    } else if (
      memberPositions.some((name) => name.toLowerCase() === mapping.positionName!.toLowerCase())
    ) {
      matchedRoles.push(mapping.role);
    }
  }
  return matchedRoles;
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
    if (staff.role === StaffRole.ADMIN || staff.role === StaffRole.REGISTRAR) {
      throw app.httpErrors.unauthorized("Admin and registrar accounts must sign in through Planning Center");
    }

    const token = app.jwt.sign({ staffUserId: staff.id, role: staff.role }, { expiresIn: "12h" });

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
        headers: planningCenterOAuthHeaders(accessToken),
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

      const role = await resolvePcoRole(pcoPersonId, accessToken, app.log);
      if (!role) {
        return reply.redirect(`${spaUrl}/#error=unauthorized`);
      }

      const staff = await prisma.staffUser.upsert({
        where: { planningCenterId: pcoPersonId },
        create: { planningCenterId: pcoPersonId, email, displayName, role, active: true, devLogin: false },
        update: { email, displayName, role, active: true },
      });

      // Persist the OAuth token set so the admin team picker can call Planning Center
      // on this user's behalf later (refreshing as needed) — no service credential.
      const refreshToken = tokenSet.token.refresh_token as string | undefined;
      const expiresInSeconds = Number(tokenSet.token.expires_in) || 7200;
      await storeStaffTokens(staff.id, { accessToken, refreshToken, expiresInSeconds });

      const jwt = app.jwt.sign({ staffUserId: staff.id, role: staff.role }, { expiresIn: "12h" });
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
