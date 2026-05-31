const COOKIE_NAME = "carshow_ballot";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type DraftPick = {
  vehicleId: string;
  entryNumber: number;
  year: number;
  make: string;
  model: string;
  nickname: string | null;
  categoryId: string;
  categoryName: string;
};

type BallotCookie = {
  voterKey: string;
  drafts: Record<string, DraftPick>; // categoryId → pending pick
  submitted: Record<string, DraftPick>; // categoryId → locked pick
};

function parseBallot(): BallotCookie | null {
  try {
    const match = document.cookie
      .split("; ")
      .find((r) => r.startsWith(`${COOKIE_NAME}=`));
    if (!match) return null;
    const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const parsed = JSON.parse(raw) as BallotCookie;

    // Discard any submitted entries that are plain strings (old cookie format).
    if (parsed.submitted) {
      for (const key of Object.keys(parsed.submitted)) {
        if (typeof parsed.submitted[key] !== "object") {
          delete parsed.submitted[key];
        }
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveBallot(ballot: BallotCookie): void {
  const encoded = encodeURIComponent(JSON.stringify(ballot));
  document.cookie = `${COOKIE_NAME}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function getBallot(): BallotCookie {
  const existing = parseBallot();
  if (existing?.voterKey) return existing;
  const fresh: BallotCookie = { voterKey: crypto.randomUUID(), drafts: {}, submitted: {} };
  saveBallot(fresh);
  return fresh;
}

export function getOrCreateVoterKey(): string {
  return getBallot().voterKey;
}

export function getDrafts(): Record<string, DraftPick> {
  return getBallot().drafts;
}

export function getSubmitted(): Record<string, DraftPick> {
  return getBallot().submitted;
}

export function setDraftPick(pick: DraftPick): void {
  const ballot = getBallot();
  ballot.drafts[pick.categoryId] = pick;
  saveBallot(ballot);
}

export function clearDraftPick(categoryId: string): void {
  const ballot = getBallot();
  delete ballot.drafts[categoryId];
  saveBallot(ballot);
}

export function markCategorySubmitted(pick: DraftPick): void {
  const ballot = getBallot();
  ballot.submitted[pick.categoryId] = pick;
  delete ballot.drafts[pick.categoryId];
  saveBallot(ballot);
}
