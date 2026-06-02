import {
  Alert,
  Badge,
  Button,
  EntryCard,
  LoginCard,
  PageHeader,
  vehicleName,
} from "@carshow/carshow-components";
import type {
  JudgeBallot,
  JudgeCategorySummary,
  JudgeSession,
  PublicEntry,
  PublicVehicle,
  Registration,
  StaffUser,
} from "@carshow/carshow-components";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  ClipboardList,
  Clock,
  LogOut,
  Save,
  Search,
  ShieldCheck,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  clearToken,
  devLogin,
  getJudgeBallot,
  getJudgeSession,
  listJudgeVehicles,
  me,
  saveJudgeBallot,
  setToken,
  uploadRegistrationPhoto,
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
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);
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
  }, [selectedCategoryId, categoryReloadKey]);

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
              onPhotoUploaded={() => {
                setMessage("Photo submitted for review.");
                setCategoryReloadKey((key) => key + 1);
              }}
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
  onPhotoUploaded,
}: {
  judgingOpen: boolean;
  loading: boolean;
  selectedCategory: JudgeCategorySummary | null;
  vehicles: Registration[];
  ballot: JudgeBallot | null;
  isDirty: boolean;
  onChange: (ballot: JudgeBallot) => void;
  onSave: () => void;
  onPhotoUploaded: () => void;
}) {
  const picks = ballot?.picks ?? [];
  const [detailVehicle, setDetailVehicle] = useState<Registration | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const normalizedSearch = vehicleSearch.trim().toLowerCase();
  const visibleVehicles = normalizedSearch
    ? vehicles.filter((registration) =>
        [
          registration.entryNumber.toString(),
          vehicleName(registration),
          registration.owner.firstName,
          registration.owner.lastName,
          registration.exteriorColor ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : vehicles;

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
            <span>{visibleVehicles.length}</span>
          </div>
          <label className="judge-search-field">
            <Search size={18} />
            <input
              type="search"
              value={vehicleSearch}
              onChange={(event) => setVehicleSearch(event.target.value)}
              placeholder="Search vehicles"
              aria-label="Search eligible vehicles"
            />
          </label>
          {loading ? <div className="empty-state">Loading vehicles...</div> : null}
          {!loading && selectedCategory && !vehicles.length ? (
            <div className="judge-empty-panel compact">
              <ClipboardList size={28} />
              <strong>No checked-in vehicles yet.</strong>
              <span>This category will populate as vehicles are checked in.</span>
            </div>
          ) : null}
          {!loading && vehicles.length > 0 && visibleVehicles.length === 0 ? (
            <div className="judge-empty-panel compact">
              <Search size={28} />
              <strong>No vehicles match that search.</strong>
              <span>Try an entry number, owner name, vehicle, or color.</span>
            </div>
          ) : null}
          <div className="judge-vehicle-list">
            {!loading && visibleVehicles.map((registration) => {
              const rank = picks.find((pick) => pick.registration.id === registration.id)?.rank;

              return (
                <article
                  className={rank ? "judge-vehicle-card ranked" : "judge-vehicle-card"}
                  key={registration.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailVehicle(registration)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailVehicle(registration);
                    }
                  }}
                >
                  <EntryCard entry={toPublicEntry(registration)} />
                  <div className="judge-card-actions">
                    {rank ? <Badge variant="rank">{rank}</Badge> : null}
                    <Button
                      variant="secondary"
                      disabled={!judgingOpen || Boolean(rank) || picks.length >= 10}
                      onClick={(event) => {
                        event.stopPropagation();
                        addVehicle(registration);
                      }}
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
        onPhotoUploaded={onPhotoUploaded}
        onRemove={(vehicleId) => removeVehicle(vehicleId)}
        onRankAt={(registration, rank) => rankVehicleAt(registration, rank)}
      />
    </>
  );
}

function publicOwnerName(registration: Registration) {
  if (registration.owner.publicNameOptIn) {
    return registration.owner.publicName || `${registration.owner.firstName} ${registration.owner.lastName}`;
  }
  return `${registration.owner.firstName} ${registration.owner.lastName}`;
}

function toPublicEntry(registration: Registration): PublicEntry {
  return {
    id: registration.id,
    entryNumber: registration.entryNumber,
    year: registration.year,
    make: registration.make,
    model: registration.model,
    nickname: registration.nickname ?? null,
    exteriorColor: registration.exteriorColor ?? null,
    category: {
      id: registration.category.id,
      name: registration.category.name,
      slug: registration.category.slug,
    },
    ownerName: publicOwnerName(registration),
    photos: (registration.photos ?? []).map((photo) => ({
      id: photo.id,
      url: photo.url,
      mediumUrl: null,
      thumbUrl: null,
      altText: photo.altText ?? null,
      sortOrder: photo.sortOrder,
    })),
  };
}

function JudgeVehicleDrawer({
  judgingOpen,
  maxRank,
  pickedRank,
  vehicle,
  onClose,
  onPhotoUploaded,
  onRemove,
  onRankAt,
}: {
  judgingOpen: boolean;
  maxRank: number;
  pickedRank: number | null;
  vehicle: Registration | null;
  onClose: () => void;
  onPhotoUploaded: () => void;
  onRemove: (vehicleId: string) => void;
  onRankAt: (vehicle: Registration, rank: number) => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  if (!vehicle) return null;

  const publicVehicle: PublicVehicle = toPublicEntry(vehicle);

  return (
    <div className="judge-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="judge-vehicle-drawer" aria-label="Vehicle details" onClick={(event) => event.stopPropagation()}>
        <div className="judge-detail-top-banner">
          <div>
            <p>Celebration Church</p>
            <strong>Father's Day Car Show</strong>
          </div>
          <Badge variant="status" modifier={judgingOpen ? "active" : "closed"}>
            Judging
          </Badge>
        </div>

        <div className="judge-detail-toolbar">
          <button className="back-link" type="button" onClick={onClose}>
            <ArrowLeft size={18} />
            Back
          </button>
          <Button variant="icon" onClick={onClose} aria-label="Close vehicle details">
            <X size={20} />
          </Button>
        </div>

        <JudgeVehicleProfileCard
          vehicle={publicVehicle}
          onAddPhoto={() => setUploadOpen(true)}
        />

        <dl className="judge-vehicle-facts">
          <div>
            <dt>Status</dt>
            <dd>{vehicle.status.replace("_", " ")}</dd>
          </div>
          {vehicle.plateNumber ? (
            <div>
              <dt>Plate</dt>
              <dd>{vehicle.plateNumber}</dd>
            </div>
          ) : null}
          {vehicle.internalNotes ? (
            <div className="wide">
              <dt>Notes</dt>
              <dd>{vehicle.internalNotes}</dd>
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
        {uploadOpen ? (
          <JudgePhotoUploadDialog
            vehicle={vehicle}
            onClose={() => setUploadOpen(false)}
            onUploaded={() => {
              setUploadOpen(false);
              onPhotoUploaded();
            }}
          />
        ) : null}
      </aside>
    </div>
  );
}

function JudgeVehicleProfileCard({
  vehicle,
  onAddPhoto,
}: {
  vehicle: PublicVehicle;
  onAddPhoto: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const photos = vehicle.photos;
  const currentPhoto = photos[photoIndex] ?? photos[0];
  const currentLoaded = loadedIds.has(currentPhoto?.id ?? "");
  const title = vehicle.nickname
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model} — "${vehicle.nickname}"`
    : `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  useEffect(() => {
    setPhotoIndex(0);
  }, [vehicle.id]);

  function markLoaded(id: string) {
    setLoadedIds((prev) => new Set([...prev, id]));
  }

  return (
    <article className="vehicle-profile judge-profile-card">
      <div className="vehicle-profile-photos">
        <div className="vehicle-profile-photo-wrap">
          {photos.length > 0 && currentPhoto ? (
            <>
              {!currentLoaded && <div className="img-shimmer" aria-hidden="true" />}
              <img
                key={currentPhoto.id}
                className="vehicle-profile-main-photo"
                src={currentPhoto.url}
                alt={currentPhoto.altText ?? title}
                style={{ opacity: currentLoaded ? 1 : 0, transition: "opacity 0.3s ease" }}
                onLoad={() => markLoaded(currentPhoto.id)}
              />
            </>
          ) : (
            <div className="vehicle-profile-no-photo" />
          )}
        </div>
        <div
          className={`vehicle-profile-thumbs judge-photo-strip${photos.length === 0 ? " no-photos" : ""}`}
          aria-label="Vehicle photos"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              className={`vehicle-profile-thumb${index === photoIndex ? " active" : ""}`}
              onClick={() => setPhotoIndex(index)}
              aria-label={`Photo ${index + 1}`}
              type="button"
            >
              {!loadedIds.has(photo.id) && <div className="img-shimmer" aria-hidden="true" />}
              <img
                src={photo.url}
                alt=""
                style={{ opacity: loadedIds.has(photo.id) ? 1 : 0, transition: "opacity 0.25s ease" }}
                onLoad={() => markLoaded(photo.id)}
              />
            </button>
          ))}
          <button
            className="vehicle-profile-thumb vehicle-profile-add-photo"
            onClick={onAddPhoto}
            aria-label="Add vehicle photo"
            type="button"
          >
            <Camera size={26} />
          </button>
        </div>
      </div>

      <div className="vehicle-profile-body">
        <div className="vehicle-profile-meta">
          <span className="vehicle-profile-category">{vehicle.category.name}</span>
          <span className="eyebrow">Entry #{vehicle.entryNumber}</span>
        </div>
        <h1 className="vehicle-profile-title">{title}</h1>
        {vehicle.ownerName ? <p className="muted-copy">{vehicle.ownerName}</p> : null}
        {vehicle.exteriorColor ? <p className="muted-copy">{vehicle.exteriorColor}</p> : null}
      </div>
    </article>
  );
}

function JudgePhotoUploadDialog({
  vehicle,
  onClose,
  onUploaded,
}: {
  vehicle: Registration;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function chooseFile(nextFile: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError("");
    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : "");
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function submitPhoto() {
    if (!file) {
      inputRef.current?.click();
      return;
    }
    setUploading(true);
    setError("");
    try {
      await uploadRegistrationPhoto(vehicle.id, file);
      onUploaded();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="judge-upload-backdrop" role="presentation" onClick={onClose}>
      <section className="judge-upload-dialog" aria-label="Add vehicle photo" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>Add vehicle photo</strong>
          <Button variant="icon" onClick={onClose} aria-label="Close upload dialog">
            <X size={20} />
          </Button>
        </header>
        <div className="judge-upload-body">
          <p className="judge-upload-vehicle">{vehicle.year} {vehicle.make} {vehicle.model}</p>
          <p className="muted-copy">
            Add a photo for judges to review. Uploaded photos are queued for moderation before they appear publicly.
          </p>
          {previewUrl ? (
            <img className="judge-upload-preview" src={previewUrl} alt="Selected vehicle upload preview" />
          ) : null}
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <input
            ref={inputRef}
            className="judge-upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {!file ? (
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
              <Camera size={18} />
              Choose Photo
            </Button>
          ) : (
            <div className="judge-upload-actions">
              <Button disabled={uploading} onClick={submitPhoto}>
                {uploading ? "Uploading..." : "Upload Photo"}
              </Button>
              <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
                Choose Different
              </Button>
            </div>
          )}
          <p className="judge-upload-hint">JPEG, PNG, or WebP. Max one photo per submission.</p>
        </div>
      </section>
    </div>
  );
}
