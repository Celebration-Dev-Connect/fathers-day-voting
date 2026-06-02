import { ArrowLeft, Camera, CheckCircle2, CircleAlert, CloudUpload, ImagePlus, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { formatPhone } from "@carshow/carshow-components";
import { getOwnerVehicle, type OwnerPhoto, type OwnerVehicle, updateOwnerVehicle, uploadOwnerPhoto } from "./api";

function AppHeader() {
  return (
    <header className="owner-header">
      <div>
        <p className="owner-header-brand">Celebration Church</p>
        <h1>Father's Day Car Show</h1>
      </div>
      <span>Owner</span>
    </header>
  );
}

function EmptyTokenView() {
  return (
    <main className="owner-page owner-page-centered">
      <section className="owner-card owner-empty">
        <CircleAlert aria-hidden="true" />
        <h2>Vehicle link needed</h2>
        <p>Open this page from the owner QR or staff-provided owner link to edit photos and your build story.</p>
      </section>
    </main>
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

function PhotoManager({
  photos,
  selectedPhotoId,
  onSelectPhoto,
  onAddPhoto,
  uploading,
}: {
  photos: OwnerPhoto[];
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string) => void;
  onAddPhoto: () => void;
  uploading: boolean;
}) {
  const visiblePhotos = photos.filter((photo) => photo.url);

  return (
    <section className="owner-card owner-photo-manager">
      <div className="owner-section-title">
        <div>
          <p>Photos</p>
          <h2>{photos.length} / 10</h2>
        </div>
        <button className="owner-icon-action" type="button" onClick={onAddPhoto} disabled={uploading}>
          {uploading ? <Loader2 className="spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
          <span>{uploading ? "Uploading" : "Add"}</span>
        </button>
      </div>

      <div className="owner-photo-grid">
        {visiblePhotos.map((photo, index) => (
          <button
            key={photo.id}
            className={`owner-photo-tile ${selectedPhotoId === photo.id ? "is-selected" : ""}`}
            type="button"
            onClick={() => onSelectPhoto(photo.id)}
          >
            <img src={photo.url ?? ""} alt={photo.altText ?? `Vehicle photo ${index + 1}`} />
            {index === 0 ? <strong>Primary</strong> : null}
          </button>
        ))}
        <button
          className="owner-photo-tile owner-photo-add"
          type="button"
          onClick={onAddPhoto}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
          <span>{uploading ? "Uploading" : "Add Photo"}</span>
        </button>
      </div>

      {photos.some((photo) => photo.moderationStatus !== "APPROVED") ? (
        <div className="owner-photo-queue">
          {photos
            .filter((photo) => photo.moderationStatus !== "APPROVED")
            .map((photo) => (
              <p key={photo.id}>
                <CloudUpload aria-hidden="true" />
                Photo #{photo.sortOrder}: {statusLabel(photo.moderationStatus)}
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
  publicToken,
}: {
  vehicle: OwnerVehicle;
  onClose: () => void;
  onUploaded: () => void;
  publicToken: string;
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
      await uploadOwnerPhoto(publicToken, file);
      onUploaded();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {!file ? (
            <button className="owner-upload-secondary" type="button" onClick={() => inputRef.current?.click()}>
              <Camera aria-hidden="true" />
              Choose Photo
            </button>
          ) : (
            <div className="owner-upload-actions">
              <button type="button" disabled={uploading} onClick={submitPhoto}>
                {uploading ? "Uploading..." : "Upload Photo"}
              </button>
              <button className="owner-upload-secondary" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
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
  const { publicToken } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<OwnerVehicle | null>(null);
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
  const [plateNumber, setPlateNumber] = useState("");
  const [exteriorColor, setExteriorColor] = useState("");
  const [publicNameOptIn, setPublicNameOptIn] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    if (!publicToken) return;
    setLoading(true);
    setError(null);
    getOwnerVehicle(publicToken)
      .then(({ vehicle: nextVehicle }) => {
        if (ignore) return;
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
        setPlateNumber(nextVehicle.plateNumber ?? "");
        setExteriorColor(nextVehicle.exteriorColor ?? "");
        setPublicNameOptIn(nextVehicle.owner.publicNameOptIn);
        setSelectedPhotoId(nextVehicle.photos.find((photo) => photo.url)?.id ?? null);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Load failed");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [publicToken]);

  const selectedPhoto = useMemo(
    () => vehicle?.photos.find((photo) => photo.id === selectedPhotoId && photo.url) ?? vehicle?.photos.find((photo) => photo.url),
    [selectedPhotoId, vehicle],
  );

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
      plateNumber !== (vehicle.plateNumber ?? "") ||
      exteriorColor !== (vehicle.exteriorColor ?? "") ||
      publicNameOptIn !== vehicle.owner.publicNameOptIn);

  async function handleSave() {
    if (!publicToken) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateOwnerVehicle(publicToken, {
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
          plateNumber: plateNumber.trim() || null,
          exteriorColor: exteriorColor.trim() || null,
        },
      });
      setVehicle(result.vehicle);
      setBuildStory(result.vehicle.buildStory);
      setOwnerFirstName(result.vehicle.owner.firstName);
      setOwnerLastName(result.vehicle.owner.lastName);
      setOwnerPhone(formatPhone(result.vehicle.owner.phone));
      setOwnerEmail(result.vehicle.owner.email ?? "");
      setOwnerPublicName(result.vehicle.owner.publicName ?? "");
      setYear(result.vehicle.year);
      setMake(result.vehicle.make);
      setModel(result.vehicle.model);
      setNickname(result.vehicle.nickname ?? "");
      setPlateNumber(result.vehicle.plateNumber ?? "");
      setExteriorColor(result.vehicle.exteriorColor ?? "");
      setPublicNameOptIn(result.vehicle.owner.publicNameOptIn);
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!publicToken) return <EmptyTokenView />;

  return (
    <>
      <AppHeader />
      <main className="owner-page">
        <button className="owner-back" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
          Back
        </button>

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
            <section className="owner-profile-card">
              <div className="owner-hero-photo">
                {selectedPhoto?.url ? (
                  <img src={selectedPhoto.url} alt={selectedPhoto.altText ?? `${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
                ) : (
                  <div className="owner-photo-placeholder">
                    <Camera aria-hidden="true" />
                  </div>
                )}
              </div>
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
              uploading={uploadOpen}
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
                  Plate
                  <input value={plateNumber} maxLength={20} onChange={(event) => setPlateNumber(event.target.value.toUpperCase())} />
                </label>
              </div>
              <label>
                Exterior color
                <input value={exteriorColor} maxLength={60} onChange={(event) => setExteriorColor(event.target.value)} />
              </label>
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
          publicToken={publicToken}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            if (publicToken) void getOwnerVehicle(publicToken).then(({ vehicle: nextVehicle }) => {
              setVehicle(nextVehicle);
              setSelectedPhotoId(nextVehicle.photos.find((photo) => photo.url)?.id ?? null);
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
      <Route path="/" element={<EmptyTokenView />} />
      <Route path="/:publicToken" element={<OwnerPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
