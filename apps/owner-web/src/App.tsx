import { Camera, CheckCircle2, CircleAlert, CloudUpload, Loader2, LogOut, Save, Star, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { VehiclePhotoViewer, compressImage, formatPhone } from "@carshow/carshow-components";
import {
  createOwnerSession,
  deleteOwnerPhoto,
  getOwnerVehicle,
  setOwnerPrimaryPhoto,
  type OwnerPhoto,
  type OwnerVehicle,
  type OwnerVehicleSummary,
  updateOwnerVehicle,
  uploadOwnerPhoto,
} from "./api";

const OWNER_SESSION_KEY = "carshow-owner-session";
const COMPRESSION_TARGET_BYTES = 4.5 * 1024 * 1024;
const MANAGED_PHOTO_LIMIT = 15;
const ACTIVE_PHOTO_STATUSES = new Set<OwnerPhoto["moderationStatus"]>(["PENDING", "PROCESSING", "HUMAN_REVIEW", "APPROVED"]);
const PROCESSING_PHOTO_STATUSES = new Set<OwnerPhoto["moderationStatus"]>(["PENDING", "PROCESSING"]);

type StoredOwnerSession = {
  token: string;
  vehicleId: string;
};

function AppHeader({ onLogout }: { onLogout?: () => void }) {
  return (
    <header className="owner-header">
      <div>
        <p className="owner-header-brand">Celebration Church</p>
        <h1>Father's Day Car Show</h1>
      </div>
      {onLogout ? (
        <button className="owner-logout" type="button" onClick={onLogout}>
          <LogOut aria-hidden="true" />
          Log Out
        </button>
      ) : (
        <span>Owner</span>
      )}
    </header>
  );
}

function OwnerLoginView({
  onLogin,
}: {
  onLogin: (session: StoredOwnerSession, vehicle: OwnerVehicle, vehicles: OwnerVehicleSummary[]) => void;
}) {
  const [lastName, setLastName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await createOwnerSession({ lastName, accessCode });
      const session = { token: result.token, vehicleId: result.vehicle.id };
      localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(session));
      onLogin(session, result.vehicle, result.vehicles);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="owner-page owner-page-centered">
        <form className="owner-card owner-login" onSubmit={submit}>
          <p className="owner-header-brand">Owner Access</p>
          <h2>Manage your vehicle</h2>
          <p className="owner-muted">
            Enter your last name and the 5 digit vehicle access code from your owner email.
          </p>
          {error ? <p className="owner-upload-error">{error}</p> : null}
          <label>
            Last name
            <input value={lastName} autoComplete="family-name" onChange={(event) => setLastName(event.target.value)} />
          </label>
          <label>
            5 digit code
            <input
              value={accessCode}
              inputMode="numeric"
              maxLength={5}
              pattern="\d{5}"
              placeholder="00000"
              onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 5))}
            />
          </label>
          <button type="submit" disabled={loading || !lastName.trim() || accessCode.length !== 5}>
            {loading ? <Loader2 className="spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            {loading ? "Checking..." : "Log In"}
          </button>
        </form>
      </main>
    </>
  );
}

function statusLabel(status: OwnerPhoto["moderationStatus"]) {
  if (status === "APPROVED") return "Approved";
  if (status === "PROCESSING") return "Processing";
  if (status === "HUMAN_REVIEW") return "Needs review";
  if (status === "REJECTED") return "Rejected";
  if (status === "FAILED") return "Needs review";
  return "Pending review";
}

function hasProcessingOwnerPhotos(vehicle: OwnerVehicle | null) {
  return (vehicle?.photos ?? []).some((photo) => PROCESSING_PHOTO_STATUSES.has(photo.moderationStatus));
}

function ownerPhotoSignature(vehicle: OwnerVehicle | null) {
  return (vehicle?.photos ?? [])
    .map((photo) => `${photo.id}:${photo.moderationStatus}:${photo.url ?? ""}:${photo.isPrimary ? "primary" : ""}`)
    .join("|");
}

function PhotoManager({
  photos,
  selectedPhotoId,
  onSelectPhoto,
  onAddPhoto,
  onSetPrimary,
  onDeletePhoto,
  uploading,
  busyPhotoId,
}: {
  photos: OwnerPhoto[];
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string) => void;
  onAddPhoto: () => void;
  onSetPrimary: (id: string) => void;
  onDeletePhoto: (photo: OwnerPhoto) => void;
  uploading: boolean;
  busyPhotoId: string | null;
}) {
  const visiblePhotos = photos.filter((photo) => photo.url);
  const managedPhotoCount = photos.filter(
    (photo) => photo.managedUpload && ACTIVE_PHOTO_STATUSES.has(photo.moderationStatus),
  ).length;

  return (
    <section className="owner-card owner-photo-manager">
      <div className="owner-section-title">
        <div>
          <p>Photos</p>
          <h2>{managedPhotoCount} / {MANAGED_PHOTO_LIMIT} owner and staff</h2>
        </div>
      </div>

      <div className="owner-photo-grid">
        {visiblePhotos.map((photo, index) => (
          <div
            key={photo.id}
            className={`owner-photo-tile ${selectedPhotoId === photo.id ? "is-selected" : ""}`}
          >
            <button className="owner-photo-preview" type="button" onClick={() => onSelectPhoto(photo.id)}>
              <img src={photo.url ?? ""} alt={photo.altText ?? `Vehicle photo ${index + 1}`} />
              {photo.isPrimary ? <strong>Primary</strong> : null}
            </button>
            <div className="owner-photo-tile-actions">
              {photo.moderationStatus === "APPROVED" && !photo.isPrimary ? (
                <button type="button" disabled={busyPhotoId === photo.id} onClick={() => onSetPrimary(photo.id)}>
                  {busyPhotoId === photo.id ? <Loader2 className="spin" aria-hidden="true" /> : <Star aria-hidden="true" />}
                  Set Primary
                </button>
              ) : (
                <span>{statusLabel(photo.moderationStatus)}</span>
              )}
              {photo.ownerUploaded ? (
                <button
                  className="owner-photo-delete"
                  type="button"
                  disabled={busyPhotoId === photo.id}
                  onClick={() => onDeletePhoto(photo)}
                  aria-label={`Delete photo ${photo.sortOrder}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <button
          className="owner-photo-tile owner-photo-add"
          type="button"
          onClick={onAddPhoto}
          disabled={uploading || managedPhotoCount >= MANAGED_PHOTO_LIMIT}
        >
          {uploading ? <Loader2 className="spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
          <span>{uploading ? "Uploading" : managedPhotoCount >= MANAGED_PHOTO_LIMIT ? "Photo Limit Reached" : "Add Photo"}</span>
        </button>
      </div>

      {photos.some((photo) => photo.moderationStatus !== "APPROVED") ? (
        <div className="owner-photo-queue">
          {photos
            .filter((photo) => photo.moderationStatus !== "APPROVED")
            .map((photo) => (
              <p key={photo.id}>
                <span>
                  <CloudUpload aria-hidden="true" />
                  Photo #{photo.sortOrder}: {statusLabel(photo.moderationStatus)}
                </span>
                {photo.ownerUploaded ? (
                  <button
                    type="button"
                    disabled={busyPhotoId === photo.id}
                    onClick={() => onDeletePhoto(photo)}
                    aria-label={`Delete photo ${photo.sortOrder}`}
                  >
                    {busyPhotoId === photo.id ? <Loader2 className="spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                    Delete
                  </button>
                ) : null}
              </p>
            ))}
        </div>
      ) : null}

    </section>
  );
}

function OwnerPhotoUploadDialog({
  vehicle,
  onClose,
  onUploaded,
  token,
}: {
  vehicle: OwnerVehicle;
  onClose: () => void;
  onUploaded: () => void;
  token: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function chooseFile(nextFile: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError("");
    if (!nextFile) {
      setFile(null);
      setPreviewUrl("");
      return;
    }
    let fileToUse = nextFile;
    if (nextFile.size > COMPRESSION_TARGET_BYTES) {
      setCompressing(true);
      try {
        fileToUse = await compressImage(nextFile, COMPRESSION_TARGET_BYTES);
      } catch {
        setError("Could not compress image. Please choose a smaller file.");
        setFile(null);
        setPreviewUrl("");
        setCompressing(false);
        return;
      } finally {
        setCompressing(false);
      }
    }
    setFile(fileToUse);
    setPreviewUrl(URL.createObjectURL(fileToUse));
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
      await uploadOwnerPhoto(vehicle.id, token, file);
      onUploaded();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const busy = compressing || uploading;

  return (
    <div className="owner-upload-backdrop" role="presentation" onClick={onClose}>
      <section className="owner-upload-dialog" aria-label="Add vehicle photo" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>Add your photo</strong>
          <button className="owner-upload-close" type="button" onClick={onClose} aria-label="Close upload dialog">
            ×
          </button>
        </header>
        <div className="owner-upload-body">
          <p className="owner-upload-vehicle">{vehicle.year} {vehicle.make} {vehicle.model}</p>
          <p className="owner-muted">
            Add a photo of your vehicle. Uploaded photos are queued for review before they appear publicly.
          </p>
          {previewUrl ? <img className="owner-upload-preview" src={previewUrl} alt="Selected vehicle upload preview" /> : null}
          {error ? <p className="owner-upload-error">{error}</p> : null}
          <input
            ref={inputRef}
            className="owner-upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
          />
          {!file && !compressing ? (
            <button className="owner-upload-secondary" type="button" onClick={() => inputRef.current?.click()}>
              <Camera aria-hidden="true" />
              Choose Photo
            </button>
          ) : (
            <div className="owner-upload-actions">
              <button type="button" disabled={busy} onClick={() => void submitPhoto()}>
                {busy ? <Loader2 className="spin" aria-hidden="true" /> : null}
                {compressing ? "Optimizing..." : uploading ? "Uploading..." : "Upload Photo"}
              </button>
              <button className="owner-upload-secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
                Choose Different
              </button>
            </div>
          )}
          <p className="owner-upload-hint">JPEG, PNG, or WebP. Max one photo per submission.</p>
        </div>
      </section>
    </div>
  );
}

function OwnerPortal() {
  const [session, setSession] = useState<StoredOwnerSession | null>(() => {
    const raw = localStorage.getItem(OWNER_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredOwnerSession;
    } catch {
      localStorage.removeItem(OWNER_SESSION_KEY);
      return null;
    }
  });
  const [vehicle, setVehicle] = useState<OwnerVehicle | null>(null);
  const [vehicles, setVehicles] = useState<OwnerVehicleSummary[]>([]);
  const [buildStory, setBuildStory] = useState("");
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPublicName, setOwnerPublicName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [exteriorColor, setExteriorColor] = useState("");
  const [publicNameOptIn, setPublicNameOptIn] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function hydrateVehicle(nextVehicle: OwnerVehicle) {
    setVehicle(nextVehicle);
    setBuildStory(nextVehicle.buildStory);
    setOwnerFirstName(nextVehicle.owner.firstName);
    setOwnerLastName(nextVehicle.owner.lastName);
    setOwnerPhone(formatPhone(nextVehicle.owner.phone));
    setOwnerEmail(nextVehicle.owner.email ?? "");
    setOwnerPublicName(nextVehicle.owner.publicName ?? "");
    setYear(nextVehicle.year);
    setMake(nextVehicle.make);
    setModel(nextVehicle.model);
    setNickname(nextVehicle.nickname ?? "");
    setExteriorColor(nextVehicle.exteriorColor ?? "");
    setPublicNameOptIn(nextVehicle.owner.publicNameOptIn);
    setSelectedPhotoId(nextVehicle.primaryPhotoId ?? nextVehicle.photos.find((photo) => photo.url)?.id ?? null);
  }

  useEffect(() => {
    let ignore = false;
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getOwnerVehicle(session.vehicleId, session.token)
      .then(({ vehicle: nextVehicle, vehicles: nextVehicles }) => {
        if (ignore) return;
        hydrateVehicle(nextVehicle);
        setVehicles(nextVehicles);
      })
      .catch((err) => {
        if (!ignore) {
          localStorage.removeItem(OWNER_SESSION_KEY);
          setSession(null);
          setVehicle(null);
          setVehicles([]);
          setError(err instanceof Error ? err.message : "Load failed");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [session?.token, session?.vehicleId]);

  useEffect(() => {
    if (!session || !vehicle || !hasProcessingOwnerPhotos(vehicle)) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      getOwnerVehicle(vehicle.id, session.token)
        .then(({ vehicle: nextVehicle, vehicles: nextVehicles }) => {
          if (cancelled) return;
          setVehicle((current) =>
            current && current.id === nextVehicle.id
              ? { ...current, photos: nextVehicle.photos, primaryPhotoId: nextVehicle.primaryPhotoId }
              : current,
          );
          setVehicles(nextVehicles);
          setSelectedPhotoId((current) =>
            current ?? nextVehicle.primaryPhotoId ?? nextVehicle.photos.find((photo) => photo.url)?.id ?? null,
          );
        })
        .catch(() => {});
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [session?.token, vehicle?.id, ownerPhotoSignature(vehicle)]);

  const hasChanges =
    vehicle !== null &&
    (buildStory !== vehicle.buildStory ||
      ownerFirstName !== vehicle.owner.firstName ||
      ownerLastName !== vehicle.owner.lastName ||
      ownerPhone !== formatPhone(vehicle.owner.phone) ||
      ownerEmail !== (vehicle.owner.email ?? "") ||
      ownerPublicName !== (vehicle.owner.publicName ?? "") ||
      year !== vehicle.year ||
      make !== vehicle.make ||
      model !== vehicle.model ||
      nickname !== (vehicle.nickname ?? "") ||
      exteriorColor !== (vehicle.exteriorColor ?? "") ||
      publicNameOptIn !== vehicle.owner.publicNameOptIn);

  async function handleSave() {
    if (!session || !vehicle) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateOwnerVehicle(vehicle.id, session.token, {
        owner: {
          firstName: ownerFirstName,
          lastName: ownerLastName,
          phone: ownerPhone,
          email: ownerEmail,
          publicName: ownerPublicName,
          publicNameOptIn,
        },
        vehicle: {
          year,
          make,
          model,
          buildStory,
          nickname: nickname.trim() || null,
          exteriorColor: exteriorColor.trim() || null,
        },
      });
      hydrateVehicle(result.vehicle);
      setVehicles(result.vehicles);
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleLogin(nextSession: StoredOwnerSession, nextVehicle: OwnerVehicle, nextVehicles: OwnerVehicleSummary[]) {
    setSession(nextSession);
    hydrateVehicle(nextVehicle);
    setVehicles(nextVehicles);
    setError(null);
  }

  function logout() {
    localStorage.removeItem(OWNER_SESSION_KEY);
    setSession(null);
    setVehicle(null);
    setVehicles([]);
    setMessage(null);
    setError(null);
  }

  async function switchVehicle(vehicleId: string) {
    if (!session || vehicleId === vehicle?.id) return;
    const nextSession = { ...session, vehicleId };
    localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  async function handleSetPrimary(photoId: string) {
    if (!session || !vehicle) return;
    setBusyPhotoId(photoId);
    setError(null);
    setMessage(null);
    try {
      const result = await setOwnerPrimaryPhoto(vehicle.id, session.token, photoId);
      hydrateVehicle(result.vehicle);
      setVehicles(result.vehicles);
      setSelectedPhotoId(photoId);
      setMessage("Primary photo updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update primary photo");
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function handleDeletePhoto(photo: OwnerPhoto) {
    if (!session || !vehicle) return;
    const confirmed = window.confirm("Remove this photo? This cannot be undone.");
    if (!confirmed) return;
    setBusyPhotoId(photo.id);
    setError(null);
    setMessage(null);
    try {
      await deleteOwnerPhoto(vehicle.id, session.token, photo.id);
      const result = await getOwnerVehicle(vehicle.id, session.token);
      hydrateVehicle(result.vehicle);
      setVehicles(result.vehicles);
      setMessage("Photo removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete photo");
    } finally {
      setBusyPhotoId(null);
    }
  }

  if (!session) return <OwnerLoginView onLogin={handleLogin} />;

  return (
    <>
      <AppHeader onLogout={logout} />
      <main className="owner-page">

        {loading ? (
          <section className="owner-card owner-loading">
            <Loader2 className="spin" aria-hidden="true" />
            <span>Loading vehicle</span>
          </section>
        ) : null}

        {!loading && error && !vehicle ? (
          <section className="owner-card owner-empty">
            <CircleAlert aria-hidden="true" />
            <h2>Load failed</h2>
            <p>{error}</p>
          </section>
        ) : null}

        {vehicle ? (
          <div className="owner-layout">
            {vehicles.length > 1 ? (
              <section className="owner-card owner-vehicle-switcher">
                <label>
                  Your vehicles
                  <select value={vehicle.id} onChange={(event) => void switchVehicle(event.target.value)}>
                    {vehicles.map((ownedVehicle) => (
                      <option key={ownedVehicle.id} value={ownedVehicle.id}>
                        #{ownedVehicle.entryNumber} {ownedVehicle.year} {ownedVehicle.make} {ownedVehicle.model}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            ) : null}

            <section className="owner-profile-card">
              <VehiclePhotoViewer
                photos={vehicle.photos.flatMap((photo) =>
                  photo.url ? [{ id: photo.id, url: photo.url, altText: photo.altText }] : [],
                )}
                title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                autoAdvance
                selectedPhotoId={selectedPhotoId}
                onSelectPhoto={setSelectedPhotoId}
                emptyContent={<Camera aria-hidden="true" />}
              />
              <div className="owner-profile-body">
                <div className="owner-entry-meta">
                  <span>{vehicle.category.name}</span>
                  <strong>Entry #{vehicle.entryNumber}</strong>
                </div>
                <h2>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                  {vehicle.nickname ? ` - "${vehicle.nickname}"` : ""}
                </h2>
                <p>{vehicle.owner.firstName} {vehicle.owner.lastName}</p>
                {vehicle.exteriorColor ? <p>{vehicle.exteriorColor}</p> : null}
              </div>
            </section>

            <PhotoManager
              photos={vehicle.photos}
              selectedPhotoId={selectedPhotoId}
              onSelectPhoto={setSelectedPhotoId}
              onAddPhoto={() => setUploadOpen(true)}
              onSetPrimary={(photoId) => void handleSetPrimary(photoId)}
              onDeletePhoto={(photo) => void handleDeletePhoto(photo)}
              uploading={uploadOpen}
              busyPhotoId={busyPhotoId}
            />

            <section className="owner-card owner-form-card">
              <div className="owner-section-title">
                <div>
                  <p>Owner Details</p>
                  <h2>Contact and public display</h2>
                </div>
              </div>
              <div className="owner-form-grid">
                <label>
                  First name
                  <input value={ownerFirstName} onChange={(event) => setOwnerFirstName(event.target.value)} />
                </label>
                <label>
                  Last name
                  <input value={ownerLastName} onChange={(event) => setOwnerLastName(event.target.value)} />
                </label>
              </div>
              <div className="owner-form-grid">
                <label>
                  Phone
                  <input
                    value={ownerPhone}
                    inputMode="numeric"
                    maxLength={12}
                    pattern="\d{3}-\d{3}-\d{4}"
                    placeholder="XXX-XXX-XXXX"
                    onChange={(event) => setOwnerPhone(formatPhone(event.target.value))}
                  />
                </label>
                <label>
                  Email
                  <input value={ownerEmail} inputMode="email" onChange={(event) => setOwnerEmail(event.target.value)} />
                </label>
              </div>
              <label>
                Public display name
                <input value={ownerPublicName} maxLength={120} onChange={(event) => setOwnerPublicName(event.target.value)} />
              </label>
            </section>

            <section className="owner-card owner-form-card">
              <div className="owner-section-title">
                <div>
                  <p>Vehicle Details</p>
                  <h2>What should visitors know?</h2>
                </div>
              </div>
              <div className="owner-form-grid three">
                <label>
                  Year
                  <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
                </label>
                <label>
                  Make
                  <input value={make} onChange={(event) => setMake(event.target.value)} />
                </label>
                <label>
                  Model
                  <input value={model} onChange={(event) => setModel(event.target.value)} />
                </label>
              </div>
              <div className="owner-form-grid">
                <label>
                  Nickname
                  <input value={nickname} maxLength={80} onChange={(event) => setNickname(event.target.value)} />
                </label>
                <label>
                  Exterior color
                  <input value={exteriorColor} maxLength={60} onChange={(event) => setExteriorColor(event.target.value)} />
                </label>
              </div>
              <label>
                Story or build description
                <textarea
                  value={buildStory}
                  maxLength={2500}
                  rows={8}
                  placeholder="Share what you built, restored, modified, or love about this vehicle."
                  onChange={(event) => setBuildStory(event.target.value)}
                />
              </label>
              <div className="owner-form-footer">
                <label className="owner-check-row">
                  <input
                    type="checkbox"
                    checked={publicNameOptIn}
                    onChange={(event) => setPublicNameOptIn(event.target.checked)}
                  />
                  Show my name on the public vehicle page
                </label>
                <span>{buildStory.length}/2500</span>
              </div>
            </section>

            <section className="owner-card owner-privacy">
              <CheckCircle2 aria-hidden="true" />
              <p>Uploaded photos enter the moderation queue first. Pending photos are not public until approved.</p>
            </section>
          </div>
        ) : null}
      </main>

      {uploadOpen && vehicle ? (
        <OwnerPhotoUploadDialog
          vehicle={vehicle}
          token={session.token}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void getOwnerVehicle(vehicle.id, session.token).then(({ vehicle: nextVehicle, vehicles: nextVehicles }) => {
              hydrateVehicle(nextVehicle);
              setVehicles(nextVehicles);
              setSelectedPhotoId(nextVehicle.primaryPhotoId ?? nextVehicle.photos.find((photo) => photo.url)?.id ?? null);
              setMessage("Photo uploaded for review");
            });
          }}
        />
      ) : null}

      {vehicle ? (
        <div className="owner-action-bar">
          <div aria-live="polite">
            {error ? <span className="owner-error">{error}</span> : null}
            {message ? <span className="owner-success">{message}</span> : null}
          </div>
          <button type="button" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            Save Changes
          </button>
        </div>
      ) : null}
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<OwnerPortal />} />
    </Routes>
  );
}
