import { Camera, CheckCircle2, Download, ImagePlus, Loader2, Mail, Save, Search, Star, Trash2, UserRound, X } from "lucide-react";
import { Alert, Button, compressImage, formatPhone, payloadFromRegistration } from "@carshow/carshow-components";
import type { Category, Registration, RegistrationPayload, VehiclePhoto } from "@carshow/carshow-components";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  checkInRegistration,
  createRegistration,
  createRegistrationForOwner,
  deleteRegistrationPhoto,
  downloadRegistrationPhotos,
  getRegistration,
  listOwners,
  sendOwnerInviteEmail,
  setRegistrationPrimaryPhoto,
  updateRegistration,
  uploadRegistrationPhoto,
  type OwnerSummary,
} from "../api";
import { QrAssignment } from "./QrAssignment";

function parseFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return {};
  try {
    const parsed: unknown = JSON.parse(error.message);
    if (!Array.isArray(parsed)) return {};
    const map: Record<string, string> = {};
    for (const issue of parsed) {
      if (issue && Array.isArray(issue.path) && issue.path.length >= 2 && typeof issue.message === "string") {
        const msg: string = issue.message.includes("at least 1 character") ? "Required" : issue.message;
        map[issue.path.join(".")] = msg;
      }
    }
    return map;
  } catch {
    return {};
  }
}

const emptyPayload: RegistrationPayload = {
  owner: {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    publicName: "",
    publicNameOptIn: false,
    waiverAccepted: false,
  },
  vehicle: {
    categoryId: "",
    year: new Date().getFullYear(),
    make: "",
    model: "",
    nickname: "",
    plateNumber: "",
    exteriorColor: "",
    internalNotes: "",
    buildStory: "",
  },
};

function ownerAccessCodeFor(registration: Registration) {
  return registration.ownerAccessCode;
}

function hasProcessingPhotos(registration: Registration | null) {
  return (registration?.photos ?? []).some((photo) => photo.moderationStatus === "PENDING" || photo.moderationStatus === "PROCESSING");
}

function photoProcessingSignature(registration: Registration | null) {
  return (registration?.photos ?? [])
    .map((photo) => `${photo.id}:${photo.moderationStatus}:${photo.url ?? ""}:${photo.isPrimary ? "primary" : ""}`)
    .join("|");
}

export function RegistrationEditor({
  categories,
  registration,
  onCancel,
  onSaved,
}: {
  categories: Category[];
  registration: Registration | null;
  onCancel: () => void;
  onSaved: (registration: Registration) => void;
}) {
  const [payload, setPayload] = useState<RegistrationPayload>(() =>
    registration ? payloadFromRegistration(registration) : emptyPayload,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerCandidates, setOwnerCandidates] = useState<OwnerSummary[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<OwnerSummary | null>(null);
  const [searchingOwners, setSearchingOwners] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!payload.vehicle.categoryId && categories[0]) {
      setPayload((current) => ({
        ...current,
        vehicle: { ...current.vehicle, categoryId: categories[0].id },
      }));
    }
  }, [categories, payload.vehicle.categoryId]);

  useEffect(() => {
    if (!registration || !hasProcessingPhotos(registration)) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      getRegistration(registration.id)
        .then((result) => {
          if (!cancelled) onSaved(result.registration);
        })
        .catch(() => {
          // Keep the editor quiet while background processing catches up.
        });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [registration?.id, onSaved, photoProcessingSignature(registration)]);

  function updateOwner<Key extends keyof RegistrationPayload["owner"]>(
    key: Key,
    value: RegistrationPayload["owner"][Key],
  ) {
    setFieldErrors((prev) => { const next = { ...prev }; delete next[`owner.${key}`]; return next; });
    setPayload((current) => ({ ...current, owner: { ...current.owner, [key]: value } }));
  }

  function updateVehicle<Key extends keyof RegistrationPayload["vehicle"]>(
    key: Key,
    value: RegistrationPayload["vehicle"][Key],
  ) {
    setFieldErrors((prev) => { const next = { ...prev }; delete next[`vehicle.${key}`]; return next; });
    setPayload((current) => ({ ...current, vehicle: { ...current.vehicle, [key]: value } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    setFieldErrors({});
    try {
      const result = registration
        ? await updateRegistration(registration.id, payload)
        : selectedOwner
          ? await createRegistrationForOwner(payload, selectedOwner.id)
          : await createRegistration(payload);
      onSaved(result.registration);
      setMessage("Registration saved.");
    } catch (saveError) {
      const parsed = parseFieldErrors(saveError);
      if (Object.keys(parsed).length > 0) {
        setFieldErrors(parsed);
      } else {
        setError(saveError instanceof Error ? saveError.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function searchExistingOwners() {
    setSearchingOwners(true);
    setError("");
    try {
      const result = await listOwners(ownerSearch);
      setOwnerCandidates(result.owners);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Owner search failed");
    } finally {
      setSearchingOwners(false);
    }
  }

  function chooseExistingOwner(owner: OwnerSummary) {
    setSelectedOwner(owner);
    setOwnerCandidates([]);
    setOwnerSearch("");
    setPayload((current) => ({
      ...current,
      owner: {
        firstName: owner.firstName,
        lastName: owner.lastName,
        phone: owner.phone,
        email: owner.email ?? "",
        publicName: owner.publicName ?? "",
        publicNameOptIn: owner.publicNameOptIn,
        waiverAccepted: owner.waiverAccepted,
      },
    }));
  }

  function clearExistingOwner() {
    setSelectedOwner(null);
    setPayload((current) => ({ ...current, owner: emptyPayload.owner }));
  }

  async function checkIn() {
    if (!registration) return;
    setError("");
    try {
      const result = await checkInRegistration(registration.id);
      onSaved(result.registration);
      setMessage("Vehicle checked in.");
    } catch (checkInError) {
      setError(checkInError instanceof Error ? checkInError.message : "Check-in failed");
    }
  }

  async function refreshRegistration(messageText?: string) {
    if (!registration) return;
    const result = await getRegistration(registration.id);
    onSaved(result.registration);
    if (messageText) setMessage(messageText);
  }

  async function uploadPhoto(file: File | null) {
    if (!registration || !file) return;
    setUploadingPhoto(true);
    setError("");
    setMessage("");
    try {
      const toUpload = await compressImage(file);
      await uploadRegistrationPhoto(registration.id, toUpload);
      await refreshRegistration("Photo uploaded for review.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setHeroPhoto(photoId: string) {
    if (!registration) return;
    setPhotoBusyId(photoId);
    setError("");
    setMessage("");
    try {
      const result = await setRegistrationPrimaryPhoto(registration.id, photoId);
      onSaved(result.registration);
      setMessage("Hero image updated.");
    } catch (primaryError) {
      setError(primaryError instanceof Error ? primaryError.message : "Could not update hero image");
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function deletePhoto(photo: VehiclePhoto) {
    if (!registration) return;
    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
    setPhotoBusyId(photo.id);
    setError("");
    setMessage("");
    try {
      await deleteRegistrationPhoto(registration.id, photo.id);
      await refreshRegistration("Photo deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete photo");
    } finally {
      setPhotoBusyId(null);
    }
  }

  async function sendEmail() {
    if (!registration) return;
    setSendingEmail(true);
    setError("");
    setMessage("");
    try {
      const result = await sendOwnerInviteEmail(registration.id);
      setMessage(result.sent ? "Access code email sent." : (result.reason ?? "Email not sent."));
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : "Could not send email");
    } finally {
      setSendingEmail(false);
    }
  }

  async function resendEmail() {
    if (!registration) return;
    setResendingEmail(true);
    setError("");
    setMessage("");
    try {
      const result = await sendOwnerInviteEmail(registration.id, true);
      setMessage(result.sent ? "Access code email resent." : (result.reason ?? "Email not sent."));
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : "Could not resend email");
    } finally {
      setResendingEmail(false);
    }
  }

  return (
    <form className="editor-panel" onSubmit={save}>
      <div className="editor-header">
        <div>
          <p className="eyebrow">{registration ? `Entry #${registration.entryNumber}` : "New Entry"}</p>
          <h2>{registration ? "Edit Registration" : "Register Vehicle"}</h2>
        </div>
        <div className="header-actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          {registration?.owner.email ? (
            registration.owner.ownerInviteSentAt ? (
              <Button
                type="button"
                variant="secondary"
                disabled={resendingEmail}
                onClick={() => void resendEmail()}
              >
                {resendingEmail ? <Loader2 size={20} className="spin" /> : <Mail size={20} />}
                {resendingEmail ? "Sending..." : "Resend Email"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={sendingEmail}
                onClick={() => void sendEmail()}
              >
                {sendingEmail ? <Loader2 size={20} className="spin" /> : <Mail size={20} />}
                {sendingEmail ? "Sending..." : "Send Access Code"}
              </Button>
            )
          ) : null}
          <Button type="submit" disabled={saving}>
            <Save size={20} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {registration ? (
        <Alert variant="info">
          Owner app access code: <strong>{ownerAccessCodeFor(registration)}</strong>
          {!registration.owner.email ? (
            <span className="muted-copy"> · No email on file</span>
          ) : registration.owner.ownerInviteSentAt ? (
            <span className="muted-copy"> · Email sent {new Date(registration.owner.ownerInviteSentAt).toLocaleString()}</span>
          ) : null}
        </Alert>
      ) : null}

      {!registration ? (
        <section className="existing-owner-picker">
          <div>
            <p className="eyebrow">Vehicle Owner</p>
            <h3>{selectedOwner ? "Adding vehicle to existing owner" : "Create new owner or find existing"}</h3>
          </div>
          {selectedOwner ? (
            <div className="existing-owner-selected">
              <UserRound size={20} />
              <div>
                <strong>{selectedOwner.firstName} {selectedOwner.lastName}</strong>
                <span>{selectedOwner.phone} · {selectedOwner.email || "No email"}</span>
                <span>
                  {selectedOwner.vehicleEntries.length} existing vehicle
                  {selectedOwner.vehicleEntries.length === 1 ? "" : "s"}
                </span>
              </div>
              <Button type="button" variant="secondary" onClick={clearExistingOwner}>
                <X size={18} />
                Use new owner
              </Button>
            </div>
          ) : (
            <>
              <div className="existing-owner-search">
                <input
                  value={ownerSearch}
                  placeholder="Search by name, phone, or email"
                  onChange={(event) => setOwnerSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchExistingOwners();
                    }
                  }}
                />
                <Button type="button" variant="secondary" disabled={searchingOwners} onClick={() => void searchExistingOwners()}>
                  <Search size={18} />
                  {searchingOwners ? "Searching" : "Find owner"}
                </Button>
              </div>
              {ownerCandidates.length ? (
                <div className="existing-owner-results">
                  {ownerCandidates.map((owner) => (
                    <button type="button" key={owner.id} onClick={() => chooseExistingOwner(owner)}>
                      <strong>{owner.firstName} {owner.lastName}</strong>
                      <span>{owner.phone} · {owner.email || "No email"}</span>
                      <span>
                        {owner.vehicleEntries.map((vehicle) => `#${vehicle.entryNumber} ${vehicle.year} ${vehicle.make} ${vehicle.model}`).join(", ")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <div className="form-grid">
        <label>
          First name *
          <input className={fieldErrors["owner.firstName"] ? "input-error" : undefined} disabled={Boolean(selectedOwner)} value={payload.owner.firstName} onChange={(event) => updateOwner("firstName", event.target.value)} />
          {fieldErrors["owner.firstName"] && <span className="field-error">{fieldErrors["owner.firstName"]}</span>}
        </label>
        <label>
          Last name *
          <input className={fieldErrors["owner.lastName"] ? "input-error" : undefined} disabled={Boolean(selectedOwner)} value={payload.owner.lastName} onChange={(event) => updateOwner("lastName", event.target.value)} />
          {fieldErrors["owner.lastName"] && <span className="field-error">{fieldErrors["owner.lastName"]}</span>}
        </label>
        <label>
          Phone *
          <input
            className={fieldErrors["owner.phone"] ? "input-error" : undefined}
            value={payload.owner.phone}
            inputMode="numeric"
            maxLength={12}
            pattern="\d{3}-\d{3}-\d{4}"
            placeholder="XXX-XXX-XXXX"
            disabled={Boolean(selectedOwner)}
            onChange={(event) => updateOwner("phone", formatPhone(event.target.value))}
          />
          {fieldErrors["owner.phone"] && <span className="field-error">{fieldErrors["owner.phone"]}</span>}
        </label>
        <label>
          Email
          <input className={fieldErrors["owner.email"] ? "input-error" : undefined} disabled={Boolean(selectedOwner)} value={payload.owner.email} onChange={(event) => updateOwner("email", event.target.value)} />
          {fieldErrors["owner.email"] && <span className="field-error">{fieldErrors["owner.email"]}</span>}
        </label>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          disabled={Boolean(selectedOwner)}
          checked={payload.owner.waiverAccepted}
          onChange={(event) => updateOwner("waiverAccepted", event.target.checked)}
        />
        Owner agreed to event liability waiver.
      </label>
      {fieldErrors["owner.waiverAccepted"] && <span className="field-error">{fieldErrors["owner.waiverAccepted"]}</span>}

      <div className="form-grid">
        <label>
          Year *
          <input
            className={fieldErrors["vehicle.year"] ? "input-error" : undefined}
            type="number"
            value={payload.vehicle.year}
            onChange={(event) => updateVehicle("year", Number(event.target.value))}
          />
          {fieldErrors["vehicle.year"] && <span className="field-error">{fieldErrors["vehicle.year"]}</span>}
        </label>
        <label>
          Make *
          <input className={fieldErrors["vehicle.make"] ? "input-error" : undefined} value={payload.vehicle.make} onChange={(event) => updateVehicle("make", event.target.value)} />
          {fieldErrors["vehicle.make"] && <span className="field-error">{fieldErrors["vehicle.make"]}</span>}
        </label>
        <label>
          Model *
          <input className={fieldErrors["vehicle.model"] ? "input-error" : undefined} value={payload.vehicle.model} onChange={(event) => updateVehicle("model", event.target.value)} />
          {fieldErrors["vehicle.model"] && <span className="field-error">{fieldErrors["vehicle.model"]}</span>}
        </label>
        <label>
          Plate
          <input
            className={fieldErrors["vehicle.plateNumber"] ? "input-error" : undefined}
            value={payload.vehicle.plateNumber}
            onChange={(event) => updateVehicle("plateNumber", event.target.value.toUpperCase())}
          />
          {fieldErrors["vehicle.plateNumber"] && <span className="field-error">{fieldErrors["vehicle.plateNumber"]}</span>}
        </label>
      </div>

      <label>
        Category *
        <select
          className={fieldErrors["vehicle.categoryId"] ? "input-error" : undefined}
          value={payload.vehicle.categoryId}
          onChange={(event) => updateVehicle("categoryId", event.target.value)}
        >
          {categories
            .filter((category) => category.active)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
        {fieldErrors["vehicle.categoryId"] && <span className="field-error">{fieldErrors["vehicle.categoryId"]}</span>}
      </label>

      <label>
        Owner story / build description
        <textarea
          className={fieldErrors["vehicle.buildStory"] ? "input-error" : undefined}
          value={payload.vehicle.buildStory}
          onChange={(event) => updateVehicle("buildStory", event.target.value)}
          rows={5}
          maxLength={2500}
          placeholder="Add or edit the story the owner wants shown with their vehicle."
        />
        {fieldErrors["vehicle.buildStory"] && <span className="field-error">{fieldErrors["vehicle.buildStory"]}</span>}
      </label>

      <label>
        Internal notes
        <textarea
          className={fieldErrors["vehicle.internalNotes"] ? "input-error" : undefined}
          value={payload.vehicle.internalNotes}
          onChange={(event) => updateVehicle("internalNotes", event.target.value)}
          rows={3}
        />
        {fieldErrors["vehicle.internalNotes"] && <span className="field-error">{fieldErrors["vehicle.internalNotes"]}</span>}
      </label>

      {registration ? (
        <section className="owner-assist-panel">
          <div className="owner-assist-header">
            <div>
              <p className="eyebrow">Owner Support</p>
              <h3>Photos and hero image</h3>
            </div>
            <div className="photo-header-actions">
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void uploadPhoto(event.target.files?.[0] ?? null)}
              />
              {(registration.photos ?? []).some((p) => p.moderationStatus === "APPROVED") ? (
                <Button
                  type="button"
                  variant="icon"
                  light
                  aria-label="Download photos"
                  disabled={downloadingPhotos}
                  onClick={() => {
                    setDownloadingPhotos(true);
                    downloadRegistrationPhotos(registration.id).finally(() => setDownloadingPhotos(false));
                  }}
                >
                  {downloadingPhotos ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" disabled={uploadingPhoto} onClick={() => fileInputRef.current?.click()}>
                {uploadingPhoto ? <Loader2 className="spin" size={18} /> : <ImagePlus size={18} />}
                {uploadingPhoto ? "Uploading..." : "Upload Photo"}
              </Button>
            </div>
          </div>

          <div className="owner-assist-photo-grid">
            {(registration.photos ?? []).map((photo, index) => (
              <div className={`owner-assist-photo ${photo.isPrimary ? "primary" : ""}`} key={photo.id}>
                <div className="owner-assist-photo-preview">
                  {photo.url ? (
                    <img src={photo.url} alt={photo.altText ?? `Vehicle photo ${index + 1}`} />
                  ) : (
                    <div>
                      <Camera size={20} aria-hidden="true" />
                      <span>{photo.moderationStatus ? photo.moderationStatus.charAt(0) + photo.moderationStatus.slice(1).toLowerCase() : "Pending"}</span>
                    </div>
                  )}
                  {photo.isPrimary ? <strong>Hero</strong> : null}
                </div>
                <div className="owner-assist-photo-actions">
                  {photo.url && photo.moderationStatus === "APPROVED" && !photo.isPrimary ? (
                    <button type="button" title="Set as hero image" disabled={photoBusyId === photo.id} onClick={() => void setHeroPhoto(photo.id)}>
                      {photoBusyId === photo.id ? <Loader2 className="spin" size={14} /> : <Star size={14} />}
                    </button>
                  ) : photo.isPrimary ? (
                    <span>Hero</span>
                  ) : null}
                  <button
                    className="danger"
                    type="button"
                    disabled={photoBusyId === photo.id}
                    onClick={() => void deletePhoto(photo)}
                    aria-label={`Delete photo ${photo.sortOrder}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!(registration.photos ?? []).length ? <div className="photo-empty">No photos uploaded yet.</div> : null}
          </div>
        </section>
      ) : null}

      {registration ? (
        <div className="action-strip">
          <Button onClick={checkIn}>
            <CheckCircle2 size={20} />
            Check In
          </Button>
          <QrAssignment registration={registration} onAssigned={onSaved} />
        </div>
      ) : null}
    </form>
  );
}
