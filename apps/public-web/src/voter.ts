const VOTER_KEY = "carshow-voter-key";

export function getOrCreateVoterKey(): string {
  let key = localStorage.getItem(VOTER_KEY);
  if (!key) {
    // Try reading from cookie as fallback (e.g. after localStorage was cleared)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)carshow-voter-key=([^;]+)/);
    key = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  }
  if (!key) {
    key = crypto.randomUUID();
  }
  persist(key);
  return key;
}

function persist(key: string) {
  localStorage.setItem(VOTER_KEY, key);
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `carshow-voter-key=${encodeURIComponent(key)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}
