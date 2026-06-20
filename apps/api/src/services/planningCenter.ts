import { prisma } from "@carshow/db";
import type { StaffUser } from "@carshow/db";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { decryptToken, encryptToken } from "./tokenCrypto.js";

export type PlanningCenterMember = {
  id: string;
  name: string;
  email?: string | null;
  positions: string[];
  leader: boolean;
};

export type PlanningCenterTeam = {
  id: string;
  name: string;
  serviceTypeName?: string | null;
  memberCount?: number;
  leaderCount?: number;
  positionNames?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  members?: PlanningCenterMember[];
};

export type PlanningCenterErrorCode =
  | "PCO_SESSION_EXPIRED"
  | "PCO_FORBIDDEN"
  | "PCO_RATE_LIMITED"
  | "PCO_UNAVAILABLE";

export class PlanningCenterApiError extends Error {
  readonly code: PlanningCenterErrorCode;
  readonly statusCode: number;

  constructor(code: PlanningCenterErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "PlanningCenterApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const pcoCollectionSchema = z.object({
  data: z.array(z.any()),
  included: z.array(z.any()).optional().default([]),
  links: z.object({ next: z.string().nullable().optional() }).optional(),
});

const pcoSingleSchema = z.object({
  data: z.any(),
  included: z.array(z.any()).optional().default([]),
});

const userAgent = config.planningCenter.userAgent;

export function planningCenterOAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": userAgent,
  };
}

function planningCenterErrorForStatus(status: number): PlanningCenterApiError {
  if (status === 401) {
    return new PlanningCenterApiError(
      "PCO_SESSION_EXPIRED",
      "Your Planning Center session has expired. Sign out and sign back in.",
      401,
    );
  }
  if (status === 403) {
    return new PlanningCenterApiError(
      "PCO_FORBIDDEN",
      "Your Planning Center account does not have permission to browse Services teams.",
      403,
    );
  }
  if (status === 429) {
    return new PlanningCenterApiError(
      "PCO_RATE_LIMITED",
      "Planning Center is rate limiting team lookup requests. Try again shortly.",
      429,
    );
  }
  return new PlanningCenterApiError(
    "PCO_UNAVAILABLE",
    "Planning Center could not be reached. Try again shortly.",
    502,
  );
}

async function pcoFetch(url: string, headers: Record<string, string>, log: FastifyBaseLogger) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log.warn({ status: response.status, url, body: body.slice(0, 400) }, "Planning Center API request failed");
    throw planningCenterErrorForStatus(response.status);
  }
  return response.json();
}

async function pcoFetchAll(url: string, headers: Record<string, string>, log: FastifyBaseLogger) {
  const rows: unknown[] = [];
  const included: unknown[] = [];
  let nextUrl: string | undefined = url;
  let page = 0;
  while (nextUrl && page < 50) {
    page++;
    const parsed = pcoCollectionSchema.parse(await pcoFetch(nextUrl, headers, log));
    rows.push(...parsed.data);
    included.push(...parsed.included);
    nextUrl = parsed.links?.next ?? undefined;
  }
  return { data: rows, included };
}

function stringAttr(record: unknown, key: string) {
  if (!record || typeof record !== "object") return null;
  const attrs = (record as { attributes?: Record<string, unknown> }).attributes;
  const value = attrs?.[key];
  return typeof value === "string" ? value : null;
}

function relationshipId(record: unknown, key: string) {
  if (!record || typeof record !== "object") return null;
  const relationships = (record as { relationships?: Record<string, { data?: { id?: unknown } | null }> }).relationships;
  const id = relationships?.[key]?.data?.id;
  return typeof id === "string" ? id : null;
}

function recordId(record: unknown) {
  if (!record || typeof record !== "object") return null;
  const id = (record as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function recordType(record: unknown) {
  if (!record || typeof record !== "object") return null;
  const type = (record as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

function includedByTypeAndId(included: unknown[], type: string, id: string | null) {
  if (!id) return null;
  return included.find((item) => recordType(item) === type && recordId(item) === id) ?? null;
}

function displayName(person: unknown) {
  const fullName = [stringAttr(person, "first_name"), stringAttr(person, "last_name")].filter(Boolean).join(" ");
  return stringAttr(person, "name") ?? (fullName || "Unknown person");
}

function email(person: unknown) {
  return stringAttr(person, "primary_email_address") ?? stringAttr(person, "email_address");
}

function isLeaderPosition(positionName: string) {
  return /leader|admin|captain|lead/i.test(positionName);
}

function teamFromRecord(record: unknown, included: unknown[]): Omit<PlanningCenterTeam, "members"> {
  const id = recordId(record) ?? "";
  const serviceType = includedByTypeAndId(included, "ServiceType", relationshipId(record, "service_type"));
  return {
    id,
    name: stringAttr(record, "name") ?? `Team ${id}`,
    serviceTypeName: serviceType ? stringAttr(serviceType, "name") : null,
    createdAt: stringAttr(record, "created_at"),
    updatedAt: stringAttr(record, "updated_at"),
  };
}

async function loadTeamPositionAssignments(
  teamId: string,
  accessToken: string,
  log: FastifyBaseLogger,
) {
  return pcoFetchAll(
    `https://api.planningcenteronline.com/services/v2/teams/${encodeURIComponent(teamId)}/person_team_position_assignments?include=team_position,person&per_page=100`,
    planningCenterOAuthHeaders(accessToken),
    log,
  );
}

function summarizeMembers(assignments: unknown[], included: unknown[]) {
  const membersById = new Map<string, PlanningCenterMember>();
  const positions = new Set<string>();

  for (const assignment of assignments) {
    const personId = relationshipId(assignment, "person");
    const positionId = relationshipId(assignment, "team_position");
    if (!personId) continue;

    const position = includedByTypeAndId(included, "TeamPosition", positionId);
    const positionName = position ? stringAttr(position, "name") : null;
    if (positionName) positions.add(positionName);

    const person = includedByTypeAndId(included, "Person", personId);
    const current = membersById.get(personId) ?? {
      id: personId,
      name: person ? displayName(person) : `Person ${personId}`,
      email: person ? email(person) : null,
      positions: [],
      leader: false,
    };
    if (positionName && !current.positions.includes(positionName)) {
      current.positions.push(positionName);
    }
    current.leader = current.leader || current.positions.some(isLeaderPosition);
    membersById.set(personId, current);
  }

  const members = [...membersById.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    members,
    positionNames: [...positions].sort((a, b) => a.localeCompare(b)),
    memberCount: members.length,
    leaderCount: members.filter((member) => member.leader).length,
  };
}

// --- Org-wide team list (cached) -------------------------------------------------

type CachedTeam = Omit<PlanningCenterTeam, "members" | "memberCount" | "leaderCount" | "positionNames">;
let teamCache: { teams: CachedTeam[]; fetchedAt: number } | null = null;
const TEAM_CACHE_TTL_MS = 5 * 60 * 1000;

async function listAllTeams(accessToken: string, log: FastifyBaseLogger): Promise<CachedTeam[]> {
  if (teamCache && Date.now() - teamCache.fetchedAt < TEAM_CACHE_TTL_MS) {
    return teamCache.teams;
  }
  const result = await pcoFetchAll(
    "https://api.planningcenteronline.com/services/v2/teams?include=service_type&per_page=100",
    planningCenterOAuthHeaders(accessToken),
    log,
  );
  const teams = result.data
    .map((record) => teamFromRecord(record, result.included))
    .filter((team) => team.id);
  teamCache = { teams, fetchedAt: Date.now() };
  log.info({ teamCount: teams.length }, "Planning Center team list cached");
  return teams;
}

/**
 * Search all PCO Services teams by name (case-insensitive substring). Returns lightweight
 * records; member counts and positions are loaded on demand via {@link getPlanningCenterTeam}.
 */
export async function searchPlanningCenterTeams(query: string, accessToken: string, log: FastifyBaseLogger) {
  const teams = await listAllTeams(accessToken, log);
  const needle = query.trim().toLowerCase();
  return teams
    .filter((team) => team.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);
}

export async function getPlanningCenterTeam(
  teamId: string,
  accessToken: string,
  log: FastifyBaseLogger,
  includeMembers = true,
): Promise<PlanningCenterTeam> {
  const parsedTeam = pcoSingleSchema.parse(await pcoFetch(
    `https://api.planningcenteronline.com/services/v2/teams/${encodeURIComponent(teamId)}?include=service_type`,
    planningCenterOAuthHeaders(accessToken),
    log,
  ));
  const team = teamFromRecord(parsedTeam.data, parsedTeam.included);

  const assignmentResult = await loadTeamPositionAssignments(teamId, accessToken, log);
  const summary = summarizeMembers(assignmentResult.data, assignmentResult.included);
  return {
    ...team,
    positionNames: summary.positionNames,
    memberCount: summary.memberCount,
    leaderCount: summary.leaderCount,
    members: includeMembers ? summary.members : undefined,
  };
}

// --- Login-time membership lookup (person-centric) -------------------------------

export type PersonTeamMembership = { teamId: string; teamName: string; positions: string[] };

/**
 * Fetch every team + position the given person holds, in one paginated person-scoped query.
 * Bounded by how many teams the person is on, not by team size.
 */
export async function getPersonTeamMemberships(
  pcoPersonId: string,
  accessToken: string,
  log: FastifyBaseLogger,
): Promise<PersonTeamMembership[]> {
  // A person's assignments relate to a TeamPosition, not directly to a Team. The team
  // hangs off the TeamPosition, so we resolve it via the nested `team_position.team` include.
  const result = await pcoFetchAll(
    `https://api.planningcenteronline.com/services/v2/people/${encodeURIComponent(pcoPersonId)}/person_team_position_assignments?include=team_position.team&per_page=100`,
    planningCenterOAuthHeaders(accessToken),
    log,
  );

  const byTeam = new Map<string, PersonTeamMembership>();
  for (const assignment of result.data) {
    const teamPosition = includedByTypeAndId(result.included, "TeamPosition", relationshipId(assignment, "team_position"));
    const teamId = teamPosition ? relationshipId(teamPosition, "team") : null;
    if (!teamId) continue;
    const teamRecord = includedByTypeAndId(result.included, "Team", teamId);
    const teamName = teamRecord ? stringAttr(teamRecord, "name") ?? `Team ${teamId}` : `Team ${teamId}`;
    const positionName = teamPosition ? stringAttr(teamPosition, "name") : null;

    const current = byTeam.get(teamId) ?? { teamId, teamName, positions: [] };
    if (positionName && !current.positions.includes(positionName)) current.positions.push(positionName);
    byTeam.set(teamId, current);
  }
  return [...byTeam.values()];
}

// --- OAuth token persistence + refresh -------------------------------------------

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

/** Persist the freshly-issued OAuth token set on a staff user (encrypted at rest). */
export async function storeStaffTokens(
  staffUserId: string,
  tokens: { accessToken: string; refreshToken?: string; expiresInSeconds: number },
) {
  await prisma.staffUser.update({
    where: { id: staffUserId },
    data: {
      pcoAccessToken: encryptToken(tokens.accessToken),
      pcoRefreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
      pcoTokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
    },
  });
}

/**
 * Return a valid PCO access token for the given staff user, refreshing via the stored
 * refresh token when expired. Throws if no usable token is available (admin must re-login).
 */
export async function getValidStaffAccessToken(staff: StaffUser, log: FastifyBaseLogger): Promise<string> {
  const accessToken = decryptToken(staff.pcoAccessToken);
  const expiresAt = staff.pcoTokenExpiresAt?.getTime() ?? 0;
  if (accessToken && expiresAt - 60_000 > Date.now()) {
    return accessToken;
  }

  const refreshToken = decryptToken(staff.pcoRefreshToken);
  if (!refreshToken || !config.planningCenter.clientId || !config.planningCenter.clientSecret) {
    throw new PlanningCenterApiError(
      "PCO_SESSION_EXPIRED",
      "Your Planning Center session has expired. Sign out and sign back in.",
      401,
    );
  }

  const response = await fetch("https://api.planningcenteronline.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": userAgent },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.planningCenter.clientId,
      client_secret: config.planningCenter.clientSecret,
    }),
  });
  if (!response.ok) {
    log.warn({ status: response.status }, "Planning Center token refresh failed");
    throw new PlanningCenterApiError(
      "PCO_SESSION_EXPIRED",
      "Your Planning Center session has expired. Sign out and sign back in.",
      401,
    );
  }
  const tokens = tokenResponseSchema.parse(await response.json());
  await storeStaffTokens(staff.id, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresInSeconds: tokens.expires_in,
  });
  return tokens.access_token;
}
