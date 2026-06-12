import { Camera, CheckCircle2, Download, ImagePlus, Loader2, Save, Search, Star, Trash2, UserRound, X } from "lucide-react";
import { Alert, Button, formatPhone, payloadFromRegistration } from "@carshow/carshow-components";
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
  setRegistrationPrimaryPhoto,
  updateRegistration,
  uploadRegistrationPhoto,
  type OwnerSummary,
} from "../api";
import { QrAssignment } from "./QrAssignment";

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
  const [saving, setSaving] = useState(false);
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

  function updateOwner<Key extends keyof RegistrationPayload["owner"]>(
    key: Key,
    value: RegistrationPayload["owner"][Key],
  ) {
    setPayload((current) => ({ ...current, owner: { ...current.owner, [key]: value } }));
  }

  function updateVehicle<Key extends keyof RegistrationPayload["vehicle"]>(
    key: Key,
    value: RegistrationPayload["vehicle"][Key],
  ) {
    setPayload((current) => ({ ...current, vehicle: { ...current.vehicle, [key]: value } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = registration
        ? await updateRegistration(registration.id, payload)
        : selectedOwner
          ? await createRegistrationForOwner(payload, selectedOwner.id)
          : await createRegistration(payload);
      onSaved(result.registration);
      setMessage("Registration saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
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
      await uploadRegistrationPhoto(registration.id, file);
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
          <input disabled={Boolean(selectedOwner)} value={payload.owner.firstName} onChange={(event) => updateOwner("firstName", event.target.value)} />
        </label>
        <label>
          Last name *
          <input disabled={Boolean(selectedOwner)} value={payload.owner.lastName} onChange={(event) => updateOwner("lastName", event.target.value)} />
        </label>
        <label>
          Phone *
          <input
            value={payload.owner.phone}
            inputMode="numeric"
            maxLength={12}
            pattern="\d{3}-\d{3}-\d{4}"
            placeholder="XXX-XXX-XXXX"
            disabled={Boolean(selectedOwner)}
            onChange={(event) => updateOwner("phone", formatPhone(event.target.value))}
          />
        </label>
        <label>
          Email
          <input disabled={Boolean(selectedOwner)} value={payload.owner.email} onChange={(event) => updateOwner("email", event.target.value)} />
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

      <div className="form-grid">
        <label>
          Year *
          <input
            type="number"
            value={payload.vehicle.year}
            onChange={(event) => updateVehicle("year", Number(event.target.value))}
          />
        </label>
        <label>
          Make *
          <input value={payload.vehicle.make} onChange={(event) => updateVehicle("make", event.target.value)} />
        </label>
        <label>
          Model *
          <input value={payload.vehicle.model} onChange={(event) => updateVehicle("model", event.target.value)} />
        </label>
        <label>
          Plate
          <input
            value={payload.vehicle.plateNumber}
            onChange={(event) => updateVehicle("plateNumber", event.target.value.toUpperCase())}
          />
        </label>
      </div>

      <label>
        Category *
        <select
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
      </label>

      <label>
        Owner story / build description
        <textarea
          value={payload.vehicle.buildStory}
          onChange={(event) => updateVehicle("buildStory", event.target.value)}
          rows={5}
          maxLength={2500}
          placeholder="Add or edit the story the owner wants shown with their vehicle."
        />
      </label>

      <label>
        Internal notes
        <textarea
          value={payload.vehicle.internalNotes}
          onChange={(event) => updateVehicle("internalNotes", event.target.value)}
          rows={3}
        />
      </label>

      {registration ? (
        <section className="owner-assist-panel">
          <div className="owner-assist-header">
            <div>
              <p className="eyebrow">Owner Support</p>
              <h3>Photos and hero image</h3>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
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
                  variant="secondary"
                  disabled={downloadingPhotos}
                  onClick={() => {
                    setDownloadingPhotos(true);
                    downloadRegistrationPhotos(registration.id).finally(() => setDownloadingPhotos(false));
                  }}
                >
                  {downloadingPhotos ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                  {downloadingPhotos ? "Downloading..." : "Download Photos"}
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
                      <Camera aria-hidden="true" />
                      <span>{photo.moderationStatus ?? "Pending"}</span>
                    </div>
                  )}
                  {photo.isPrimary ? <strong>Hero</strong> : null}
                </div>
                <div className="owner-assist-photo-actions">
                  {photo.url && photo.moderationStatus === "APPROVED" && !photo.isPrimary ? (
                    <button type="button" disabled={photoBusyId === photo.id} onClick={() => void setHeroPhoto(photo.id)}>
                      {photoBusyId === photo.id ? <Loader2 className="spin" size={16} /> : <Star size={16} />}
                      Set Hero
                    </button>
                  ) : (
                    <span>{photo.isPrimary ? "Hero image" : photo.moderationStatus ?? "Pending review"}</span>
                  )}
                  <button
                    className="danger"
                    type="button"
                    disabled={photoBusyId === photo.id}
                    onClick={() => void deletePhoto(photo)}
                    aria-label={`Delete photo ${photo.sortOrder}`}
                  >
                    <Trash2 size={16} />
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
          <Button variant="secondary" onClick={checkIn}>
            <CheckCircle2 size={20} />
            Check In
          </Button>
          <QrAssignment registration={registration} onAssigned={onSaved} />
        </div>
      ) : null}
    </form>
  );
}
