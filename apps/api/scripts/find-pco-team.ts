/**
 * One-off helper: print the Planning Center Services team ID(s) for a given team name,
 * using a staff member's stored OAuth token (refreshing if needed). No PAT/service creds.
 *
 * Usage:
 *   1. Log into the admin app via Planning Center so a token is persisted.
 *   2. npx tsx apps/api/scripts/find-pco-team.ts "carshow"
 */
import { prisma } from "@carshow/db";
import { getValidStaffAccessToken, planningCenterOAuthHeaders } from "../src/services/planningCenter.js";

const log = {
  info: (...a: unknown[]) => console.error("[info]", ...a),
  warn: (...a: unknown[]) => console.error("[warn]", ...a),
  error: (...a: unknown[]) => console.error("[error]", ...a),
} as unknown as Parameters<typeof getValidStaffAccessToken>[1];

async function main() {
  const teamName = process.argv[2] ?? "carshow";

  const staff = await prisma.staffUser.findFirst({
    where: { pcoAccessToken: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!staff) {
    console.error("No staff user has a stored Planning Center token. Log into the admin app via PCO first.");
    process.exit(1);
  }

  const accessToken = await getValidStaffAccessToken(staff, log);
  const res = await fetch(
    `https://api.planningcenteronline.com/services/v2/teams?where[name]=${encodeURIComponent(teamName)}&include=service_type`,
    { headers: planningCenterOAuthHeaders(accessToken) },
  );
  if (!res.ok) {
    console.error(`PCO request failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = (await res.json()) as {
    data: { id: string; attributes: { name: string }; relationships?: { service_type?: { data?: { id?: string } } } }[];
    included?: { type: string; id: string; attributes: { name: string } }[];
  };

  if (body.data.length === 0) {
    console.log(`No PCO Services team named exactly "${teamName}".`);
    return;
  }
  console.log(`Teams named "${teamName}":`);
  for (const team of body.data) {
    const stId = team.relationships?.service_type?.data?.id;
    const st = body.included?.find((i) => i.type === "ServiceType" && i.id === stId)?.attributes.name;
    console.log(`  id=${team.id}  name="${team.attributes.name}"  serviceType="${st ?? "—"}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
