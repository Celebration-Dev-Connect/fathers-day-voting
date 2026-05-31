import { Alert, Badge, Button, LoginCard, PageHeader, vehicleName } from "@carshow/carshow-components";
import type {
  JudgeBallot,
  JudgeCategorySummary,
  JudgeSession,
  Registration,
  StaffUser,
} from "@carshow/carshow-components";
import { ArrowDown, ArrowUp, Check, ClipboardList, LogOut, Save, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  clearToken,
  devLogin,
  getJudgeBallot,
  getJudgeSession,
  listJudgeVehicles,
  me,
  saveJudgeBallot,
  setToken,
} from "./api";

const DEV_LOGIN_OPTIONS = [
  { label: "Admin User", email: "admin@carshow.local" },
  { label: "Registrar One", email: "registrar1@carshow.local" },
  { label: "Registrar Two", email: "registrar2@carshow.local" },
];

export function App() {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    me()
      .then(({ staff }) => setStaff(staff))
      .catch(() => clearToken())
      .finally(() => setLoadingSession(false));
  }, []);

  if (loadingSession) {
    return <div className="judge-boot">Starting judging console...</div>;
  }

  if (!staff) {
    return (
      <LoginCard
        brandMark="CELEBRATION CHURCH"
        subtitle="Judge Ballot Console"
        title="Father's Day Car Show"
        loginOptions={DEV_LOGIN_OPTIONS}
        error={loginError}
        onLogin={async (email) => {
          setLoginError("");
          try {
            const result = await devLogin(email);
            setToken(result.token);
            setStaff(result.staff);
          } catch (error) {
            setLoginError(error instanceof Error ? error.message : "Login failed");
          }
        }}
      />
    );
  }

  return <JudgeApp staff={staff} onLogout={() => { clearToken(); setStaff(null); }} />;
}

function JudgeApp({ staff, onLogout }: { staff: StaffUser; onLogout: () => void }) {
  const [session, setSession] = useState<JudgeSession | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Registration[]>([]);
  const [ballot, setBallot] = useState<JudgeBallot | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const selectedCategory = session?.categories.find((item) => item.category.id === selectedCategoryId) ?? null;

  async function refreshSession() {
    const result = await getJudgeSession();
    setSession(result);
    setSelectedCategoryId((current) => current ?? result.categories[0]?.category.id ?? null);
  }

  useEffect(() => {
    setLoading(true);
    refreshSession()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load judging session"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) return;
    setError("");
    Promise.all([listJudgeVehicles(selectedCategoryId), getJudgeBallot(selectedCategoryId)])
      .then(([vehicleResult, ballotResult]) => {
        setVehicles(vehicleResult.registrations);
        setBallot(ballotResult);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load category ballot"));
  }, [selectedCategoryId]);

  async function saveBallot(nextPicks = ballot?.picks ?? []) {
    if (!selectedCategoryId) return;
    setMessage("");
    setError("");
    try {
      const result = await saveJudgeBallot(
        selectedCategoryId,
        nextPicks.map((pick) => ({ vehicleEntryId: pick.registration.id, rank: pick.rank })),
      );
      setBallot(result);
      await refreshSession();
      setMessage("Draft ballot saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save ballot");
    }
  }

  return (
    <main className="judge-app">
      <header className="judge-topbar">
        <div>
          <strong>Celebration Church</strong>
          <span>Judging</span>
        </div>
        <Button variant="icon" light onClick={onLogout} aria-label="Log out">
          <LogOut size={22} />
        </Button>
      </header>

      <section className="judge-content">
        <PageHeader
          eyebrow="Judge Ballots"
          title={selectedCategory?.category.name ?? "Category Review"}
          actions={
            <StatusPill
              label={session?.judgingOpen ? "Judging open" : "Judging closed"}
              active={session?.judgingOpen ?? false}
            />
          }
        />

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {message ? <Alert>{message}</Alert> : null}

        <div className="judge-status">
          <div>
            <span>Signed in as</span>
            <strong>{staff.displayName}</strong>
          </div>
          <div>
            <span>Ballot progress</span>
            <strong>{ballot?.picks.length ?? 0}/10 ranked</strong>
          </div>
        </div>

        {loading ? <div className="empty-state">Loading judging console...</div> : null}
        {!loading && session ? (
          <div className="judge-layout">
            <CategoryRail
              categories={session.categories}
              selectedCategoryId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
            <BallotWorkspace
              judgingOpen={session.judgingOpen}
              vehicles={vehicles}
              ballot={ballot}
              onChange={setBallot}
              onSave={() => saveBallot()}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return <Badge variant="status" modifier={active ? "active" : "closed"}>{label}</Badge>;
}

function CategoryRail({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: JudgeCategorySummary[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <aside className="judge-category-rail" aria-label="Judging categories">
      {categories.map((item) => (
        <button
          className={item.category.id === selectedCategoryId ? "judge-category active" : "judge-category"}
          key={item.category.id}
          onClick={() => onSelect(item.category.id)}
          type="button"
        >
          <span>{item.category.name}</span>
          <strong>{item.rankedCount}/10</strong>
          <small>{item.eligibleVehicleCount} eligible</small>
        </button>
      ))}
    </aside>
  );
}

function BallotWorkspace({
  judgingOpen,
  vehicles,
  ballot,
  onChange,
  onSave,
}: {
  judgingOpen: boolean;
  vehicles: Registration[];
  ballot: JudgeBallot | null;
  onChange: (ballot: JudgeBallot) => void;
  onSave: () => void;
}) {
  const picks = ballot?.picks ?? [];
  const pickedIds = useMemo(() => new Set(picks.map((pick) => pick.registration.id)), [picks]);

  function updatePicks(nextRegistrations: Registration[]) {
    if (!ballot) return;
    onChange({
      ...ballot,
      picks: nextRegistrations.map((registration, index) => ({ registration, rank: index + 1 })),
    });
  }

  function addVehicle(registration: Registration) {
    if (picks.length >= 10 || pickedIds.has(registration.id)) return;
    updatePicks([...picks.map((pick) => pick.registration), registration]);
  }

  function removeVehicle(registrationId: string) {
    updatePicks(picks.map((pick) => pick.registration).filter((registration) => registration.id !== registrationId));
  }

  function moveVehicle(registrationId: string, direction: -1 | 1) {
    const registrations = picks.map((pick) => pick.registration);
    const index = registrations.findIndex((registration) => registration.id === registrationId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= registrations.length) return;
    const next = [...registrations];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    updatePicks(next);
  }

  return (
    <div className="judge-ballot-grid">
      <section className="judge-panel">
        <div className="judge-panel-heading">
          <div>
            <ClipboardList size={22} />
            <strong>Eligible Vehicles</strong>
          </div>
          <span>{vehicles.length}</span>
        </div>
        <div className="judge-vehicle-list">
          {vehicles.map((registration) => (
            <article className="judge-vehicle-card" key={registration.id}>
              <div>
                <small>#{registration.entryNumber.toString().padStart(3, "0")}</small>
                <strong>{vehicleName(registration)}</strong>
                <span>{registration.exteriorColor ?? "Color not listed"}</span>
              </div>
              <Button
                variant="secondary"
                disabled={!judgingOpen || pickedIds.has(registration.id) || picks.length >= 10}
                onClick={() => addVehicle(registration)}
              >
                <Check size={18} />
                Rank
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="judge-panel">
        <div className="judge-panel-heading">
          <div>
            <Trophy size={22} />
            <strong>Top 10 Ballot</strong>
          </div>
          <Button disabled={!judgingOpen || !ballot} onClick={onSave}>
            <Save size={18} />
            Save Draft
          </Button>
        </div>
        <div className="judge-ranked-list">
          {picks.length ? (
            picks.map((pick, index) => (
              <article className="judge-ranked-card" key={pick.registration.id}>
                <b>{pick.rank}</b>
                <div>
                  <strong>{vehicleName(pick.registration)}</strong>
                  <span>#{pick.registration.entryNumber.toString().padStart(3, "0")}</span>
                </div>
                <div className="judge-rank-actions">
                  <Button variant="icon" disabled={!judgingOpen || index === 0} onClick={() => moveVehicle(pick.registration.id, -1)} aria-label="Move up">
                    <ArrowUp size={18} />
                  </Button>
                  <Button variant="icon" disabled={!judgingOpen || index === picks.length - 1} onClick={() => moveVehicle(pick.registration.id, 1)} aria-label="Move down">
                    <ArrowDown size={18} />
                  </Button>
                  <Button variant="icon" disabled={!judgingOpen} onClick={() => removeVehicle(pick.registration.id)} aria-label="Remove from ballot">
                    <X size={18} />
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">No vehicles ranked yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
