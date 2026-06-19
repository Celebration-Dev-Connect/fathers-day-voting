import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { config } from "../config.js";

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
  memberCount: number;
  leaderCount: number;
  positionNames: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  members?: PlanningCenterMember[];
};

export type PlanningCenterErrorCode =
  | "PCO_NOT_CONFIGURED"
  | "PCO_UNAUTHORIZED"
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

function planningCenterBasicHeaders() {
  const appId = config.planningCenter.apiAppId;
  const secret = config.planningCenter.apiSecret;
  if (!appId || !secret) return null;
  return {
    Authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
    "User-Agent": userAgent,
  };
}

export function hasPlanningCenterApiCredentials() {
  return Boolean(config.planningCenter.apiAppId && config.planningCenter.apiSecret);
}

function planningCenterErrorForStatus(status: number): PlanningCenterApiError {
  if (status === 401) {
    return new PlanningCenterApiError(
      "PCO_UNAUTHORIZED",
      "Planning Center rejected the team lookup credentials.",
      502,
    );
  }
  if (status === 403) {
    return new PlanningCenterApiError(
      "PCO_FORBIDDEN",
      "Planning Center credentials do not have permission to browse Services teams.",
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
    `Planning Center API request failed with ${status}.`,
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
  while (nextUrl && page < 20) {
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

function numberAttr(record: unknown, key: string) {
  if (!record || typeof record !== "object") return null;
  const attrs = (record as { attributes?: Record<string, unknown> }).attributes;
  const value = attrs?.[key];
  return typeof value === "number" ? value : null;
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

function teamFromRecord(record: unknown, included: unknown[]): Omit<PlanningCenterTeam, "memberCount" | "leaderCount" | "positionNames"> {
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
  headers: Record<string, string>,
  log: FastifyBaseLogger,
) {
  return pcoFetchAll(
    `https://api.planningcenteronline.com/services/v2/teams/${encodeURIComponent(teamId)}/person_team_position_assignments?include=team_position,person&per_page=100`,
    headers,
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

export async function searchPlanningCenterTeams(query: string, log: FastifyBaseLogger) {
  const headers = planningCenterBasicHeaders();
  if (!headers) {
    throw new PlanningCenterApiError(
      "PCO_NOT_CONFIGURED",
      "Planning Center API credentials are not configured.",
      424,
    );
  }

  const parsed = pcoCollectionSchema.parse(await pcoFetch(
    `https://api.planningcenteronline.com/services/v2/teams?where[name]=${encodeURIComponent(query)}&include=service_type&per_page=25`,
    headers,
    log,
  ));
  const teamRecords = parsed.data.slice(0, 10);
  const teams = await Promise.all(teamRecords.map(async (record) => {
    const team = teamFromRecord(record, parsed.included);
    if (!team.id) return null;
    const summary = await getPlanningCenterTeam(team.id, log, false, team);
    return summary;
  }));
  return teams.filter((team): team is NonNullable<typeof team> => Boolean(team));
}

export async function getPlanningCenterTeam(
  teamId: string,
  log: FastifyBaseLogger,
  includeMembers = true,
  knownTeam?: Omit<PlanningCenterTeam, "memberCount" | "leaderCount" | "positionNames">,
) {
  const headers = planningCenterBasicHeaders();
  if (!headers) {
    throw new PlanningCenterApiError(
      "PCO_NOT_CONFIGURED",
      "Planning Center API credentials are not configured.",
      424,
    );
  }

  let team = knownTeam;
  if (!team) {
    const parsedTeam = pcoSingleSchema.parse(await pcoFetch(
      `https://api.planningcenteronline.com/services/v2/teams/${encodeURIComponent(teamId)}?include=service_type`,
      headers,
      log,
    ));
    team = teamFromRecord(parsedTeam.data, parsedTeam.included);
  }

  const assignmentResult = await loadTeamPositionAssignments(teamId, headers, log);
  const summary = summarizeMembers(assignmentResult.data, assignmentResult.included);
  return {
    ...team,
    ...summary,
    members: includeMembers ? summary.members : undefined,
  };
}

export async function getPersonPositionsForTeamId(
  teamId: string,
  pcoPersonId: string,
  accessToken: string,
  log: FastifyBaseLogger,
) {
  const result = await loadTeamPositionAssignments(teamId, planningCenterOAuthHeaders(accessToken), log);
  const summary = summarizeMembers(result.data, result.included);
  return summary.members.find((member) => member.id === pcoPersonId)?.positions ?? [];
}
