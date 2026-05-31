import { Alert, Badge, Button, LoginCard, PageHeader, vehicleName } from "@carshow/carshow-components";
import type {
  JudgeBallot,
  JudgeCategorySummary,
  JudgeSession,
  Registration,
  StaffUser,
} from "@carshow/carshow-components";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  Clock,
  Eye,
  ImageIcon,
  LogOut,
  Save,
  ShieldCheck,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  { label: "Judge One", email: "judge1@carshow.local" },
  { label: "Judge Two", email: "judge2@carshow.local" },
  { label: "Judge Three", email: "judge3@carshow.local" },
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
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [savedBallotSignature, setSavedBallotSignature] = useState("");
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
    setLoadingCategory(true);
    Promise.all([listJudgeVehicles(selectedCategoryId), getJudgeBallot(selectedCategoryId)])
      .then(([vehicleResult, ballotResult]) => {
        setVehicles(vehicleResult.registrations);
        setBallot(ballotResult);
        setSavedBallotSignature(ballotSignature(ballotResult));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load category ballot"))
      .finally(() => setLoadingCategory(false));
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
      setSavedBallotSignature(ballotSignature(result));
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
        <PageHeader eyebrow="Judge Ballots" title={selectedCategory?.category.name ?? "Category Review"} />

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {message ? <Alert>{message}</Alert> : null}

        {session ? <JudgeEventBanner session={session} selectedCategory={selectedCategory} /> : null}

        <div className="judge-status">
          <div>
            <span>Signed in as</span>
            <strong>{staff.displayName}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{selectedCategory?.category.name ?? "None assigned"}</strong>
          </div>
          <div>
            <span>Ballot progress</span>
            <strong>{ballot?.picks.length ?? 0}/10 ranked</strong>
          </div>
        </div>

        {loading ? <div className="empty-state">Loading judging console...</div> : null}
        {!loading && session && !session.categories.length ? (
          <div className="judge-empty-panel">
            <ShieldCheck size={34} />
            <strong>No judging categories are available yet.</strong>
            <span>Once admin enables categories for judging, they will appear here.</span>
          </div>
        ) : null}
        {!loading && session && session.categories.length ? (
          <div className="judge-layout">
            <CategoryRail
              categories={session.categories}
              selectedCategoryId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
            <BallotWorkspace
              judgingOpen={session.judgingOpen}
              loading={loadingCategory}
              selectedCategory={selectedCategory}
              vehicles={vehicles}
              ballot={ballot}
              isDirty={ballot ? ballotSignature(ballot) !== savedBallotSignature : false}
              onChange={setBallot}
              onSave={() => saveBallot()}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ballotSignature(ballot: JudgeBallot | null) {
  return (ballot?.picks ?? []).map((pick) => `${pick.rank}:${pick.registration.id}`).join("|");
}

function JudgeEventBanner({
  session,
  selectedCategory,
}: {
  session: JudgeSession;
  selectedCategory: JudgeCategorySummary | null;
}) {
  const rankedCount = selectedCategory?.rankedCount ?? 0;
  const eligibleCount = selectedCategory?.eligibleVehicleCount ?? 0;

  return (
    <section className={session.judgingOpen ? "judge-event-banner open" : "judge-event-banner closed"}>
      <div>
        {session.judgingOpen ? <ShieldCheck size={24} /> : <Clock size={24} />}
        <div>
          <strong>{session.judgingOpen ? "Judging is open" : "Judging is closed"}</strong>
          <span>
            {session.judgingOpen
              ? "Save your draft as you rank. Admin can tally saved picks while final ballot locking is being built."
              : "Ballots are read-only while judging is closed."}
          </span>
        </div>
      </div>
      <div className="judge-event-stats">
        <StatusPill label={`${rankedCount}/10 ranked`} active={rankedCount > 0} />
        <StatusPill label={`${eligibleCount} eligible`} active={eligibleCount > 0} />
      </div>
    </section>
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
          <i>{item.rankedCount === 0 ? "Not started" : item.rankedCount >= 10 ? "Ready to review" : "Draft in progress"}</i>
        </button>
      ))}
    </aside>
  );
}

function BallotWorkspace({
  judgingOpen,
  loading,
  selectedCategory,
  vehicles,
  ballot,
  isDirty,
  onChange,
  onSave,
}: {
  judgingOpen: boolean;
  loading: boolean;
  selectedCategory: JudgeCategorySummary | null;
  vehicles: Registration[];
  ballot: JudgeBallot | null;
  isDirty: boolean;
  onChange: (ballot: JudgeBallot) => void;
  onSave: () => void;
}) {
  const picks = ballot?.picks ?? [];
  const [detailVehicle, setDetailVehicle] = useState<Registration | null>(null);

  function updatePicks(nextRegistrations: Registration[]) {
    if (!ballot) return;
    onChange({
      ...ballot,
      picks: nextRegistrations.map((registration, index) => ({ registration, rank: index + 1 })),
    });
  }

  function addVehicle(registration: Registration) {
    if (picks.length >= 10 || picks.some((pick) => pick.registration.id === registration.id)) return;
    updatePicks([...picks.map((pick) => pick.registration), registration]);
  }

  function rankVehicleAt(registration: Registration, rank: number) {
    if (!judgingOpen) return;
    const withoutRegistration = picks
      .map((pick) => pick.registration)
      .filter((current) => current.id !== registration.id);
    const next = [...withoutRegistration];
    next.splice(Math.min(rank - 1, next.length), 0, registration);
    updatePicks(next.slice(0, 10));
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
    <>
      <div className="judge-ballot-grid">
        <section className="judge-panel">
          <div className="judge-panel-heading">
            <div>
              <ClipboardList size={22} />
              <strong>Eligible Vehicles</strong>
            </div>
            <span>{vehicles.length}</span>
          </div>
          {loading ? <div className="empty-state">Loading vehicles...</div> : null}
          {!loading && selectedCategory && !vehicles.length ? (
            <div className="judge-empty-panel compact">
              <ClipboardList size={28} />
              <strong>No checked-in vehicles yet.</strong>
              <span>This category will populate as vehicles are checked in.</span>
            </div>
          ) : null}
          <div className="judge-vehicle-list">
            {!loading && vehicles.map((registration) => {
              const firstPhoto = registration.photos?.[0];
              const rank = picks.find((pick) => pick.registration.id === registration.id)?.rank;

              return (
                <article className={rank ? "judge-vehicle-card ranked" : "judge-vehicle-card"} key={registration.id}>
                  <button className="judge-vehicle-media" type="button" onClick={() => setDetailVehicle(registration)}>
                    {firstPhoto ? <img src={firstPhoto.url} alt={firstPhoto.altText ?? vehicleName(registration)} /> : <ImageIcon size={24} />}
                  </button>
                  <div>
                    <small>#{registration.entryNumber.toString().padStart(3, "0")}</small>
                    <strong>{vehicleName(registration)}</strong>
                    <span>{registration.exteriorColor ?? "Color not listed"}</span>
                  </div>
                  <div className="judge-card-actions">
                    {rank ? <Badge variant="rank">{rank}</Badge> : null}
                    <Button variant="icon" onClick={() => setDetailVehicle(registration)} aria-label="View vehicle details">
                      <Eye size={18} />
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!judgingOpen || Boolean(rank) || picks.length >= 10}
                      onClick={() => addVehicle(registration)}
                    >
                      <Check size={18} />
                      Rank
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="judge-panel">
          <div className="judge-panel-heading">
            <div>
              <Trophy size={22} />
              <strong>Top 10 Ballot</strong>
            </div>
            <div className="judge-save-cluster">
              {isDirty ? <Badge variant="status" modifier="pending">Unsaved</Badge> : <Badge variant="status" modifier="active">Saved</Badge>}
              <Button disabled={!judgingOpen || !ballot || !isDirty} onClick={onSave}>
                <Save size={18} />
                Save Draft
              </Button>
            </div>
          </div>
          {!judgingOpen ? <Alert>Judging is closed. You can review this ballot, but changes are disabled.</Alert> : null}
          <div className="judge-ranked-list">
            {Array.from({ length: 10 }, (_, index) => {
              const pick = picks[index];
              return pick ? (
                <article className="judge-ranked-card" key={pick.registration.id}>
                  <b>{pick.rank}</b>
                  <button className="judge-ranked-summary" type="button" onClick={() => setDetailVehicle(pick.registration)}>
                    <strong>{vehicleName(pick.registration)}</strong>
                    <span>#{pick.registration.entryNumber.toString().padStart(3, "0")}</span>
                  </button>
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
              ) : (
                <article className="judge-ranked-card empty" key={`empty-rank-${index + 1}`}>
                  <b>{index + 1}</b>
                  <div>
                    <strong>Open rank</strong>
                    <span>Available</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <JudgeVehicleDrawer
        judgingOpen={judgingOpen}
        maxRank={10}
        pickedRank={detailVehicle ? picks.find((pick) => pick.registration.id === detailVehicle.id)?.rank ?? null : null}
        vehicle={detailVehicle}
        onClose={() => setDetailVehicle(null)}
        onRemove={(vehicleId) => removeVehicle(vehicleId)}
        onRankAt={(registration, rank) => rankVehicleAt(registration, rank)}
      />
    </>
  );
}

function JudgeVehicleDrawer({
  judgingOpen,
  maxRank,
  pickedRank,
  vehicle,
  onClose,
  onRemove,
  onRankAt,
}: {
  judgingOpen: boolean;
  maxRank: number;
  pickedRank: number | null;
  vehicle: Registration | null;
  onClose: () => void;
  onRemove: (vehicleId: string) => void;
  onRankAt: (vehicle: Registration, rank: number) => void;
}) {
  if (!vehicle) return null;

  return (
    <div className="judge-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="judge-vehicle-drawer" aria-label="Vehicle details" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <small>#{vehicle.entryNumber.toString().padStart(3, "0")}</small>
            <strong>{vehicleName(vehicle)}</strong>
            <span>{vehicle.category.name}</span>
          </div>
          <Button variant="icon" onClick={onClose} aria-label="Close vehicle details">
            <X size={20} />
          </Button>
        </header>

        <div className="judge-drawer-photos">
          {vehicle.photos?.length ? (
            vehicle.photos.slice(0, 3).map((photo) => (
              <img key={photo.id} src={photo.url} alt={photo.altText ?? vehicleName(vehicle)} />
            ))
          ) : (
            <div>
              <ImageIcon size={30} />
              <span>No photos</span>
            </div>
          )}
        </div>

        <dl className="judge-vehicle-facts">
          <div>
            <dt>Owner</dt>
            <dd>{vehicle.owner.publicNameOptIn && vehicle.owner.publicName ? vehicle.owner.publicName : `${vehicle.owner.firstName} ${vehicle.owner.lastName}`}</dd>
          </div>
          <div>
            <dt>Color</dt>
            <dd>{vehicle.exteriorColor ?? "Not listed"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{vehicle.status.replace("_", " ")}</dd>
          </div>
          {vehicle.nickname ? (
            <div>
              <dt>Nickname</dt>
              <dd>{vehicle.nickname}</dd>
            </div>
          ) : null}
        </dl>

        <section className="judge-drawer-rank">
          <div>
            <Star size={20} />
            <strong>{pickedRank ? `Ranked ${pickedRank}` : "Not ranked"}</strong>
          </div>
          <div className="judge-rank-picker">
            {Array.from({ length: maxRank }, (_, index) => index + 1).map((rank) => (
              <button
                className={pickedRank === rank ? "active" : ""}
                disabled={!judgingOpen}
                key={rank}
                onClick={() => onRankAt(vehicle, rank)}
                type="button"
              >
                {rank}
              </button>
            ))}
          </div>
          {pickedRank ? (
            <Button variant="secondary" disabled={!judgingOpen} onClick={() => onRemove(vehicle.id)}>
              <X size={18} />
              Remove from Ballot
            </Button>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
