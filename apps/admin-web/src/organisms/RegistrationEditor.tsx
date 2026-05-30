import { CheckCircle2, Save } from "lucide-react";
import { Alert, Button, formatPhone, payloadFromRegistration } from "@carshow/carshow-components";
import type { Category, Registration, RegistrationPayload } from "@carshow/carshow-components";
import { FormEvent, useEffect, useState } from "react";
import { checkInRegistration, createRegistration, updateRegistration } from "../api";
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
  },
};

export function RegistrationEditor({
  categories,
  registration,
  onSaved,
}: {
  categories: Category[];
  registration: Registration | null;
  onSaved: (registration: Registration) => void;
}) {
  const [payload, setPayload] = useState<RegistrationPayload>(() =>
    registration ? payloadFromRegistration(registration) : emptyPayload,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
        : await createRegistration(payload);
      onSaved(result.registration);
      setMessage("Registration saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
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

  return (
    <form className="editor-panel" onSubmit={save}>
      <div className="editor-header">
        <div>
          <p className="eyebrow">{registration ? `Entry #${registration.entryNumber}` : "New Entry"}</p>
          <h2>{registration ? "Edit Registration" : "Register Vehicle"}</h2>
        </div>
        <Button type="submit" disabled={saving}>
          <Save size={20} />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="form-grid">
        <label>
          First name *
          <input value={payload.owner.firstName} onChange={(event) => updateOwner("firstName", event.target.value)} />
        </label>
        <label>
          Last name *
          <input value={payload.owner.lastName} onChange={(event) => updateOwner("lastName", event.target.value)} />
        </label>
        <label>
          Phone *
          <input
            value={payload.owner.phone}
            inputMode="numeric"
            maxLength={12}
            pattern="\d{3}-\d{3}-\d{4}"
            placeholder="XXX-XXX-XXXX"
            onChange={(event) => updateOwner("phone", formatPhone(event.target.value))}
          />
        </label>
        <label>
          Email
          <input value={payload.owner.email} onChange={(event) => updateOwner("email", event.target.value)} />
        </label>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
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
        Internal notes
        <textarea
          value={payload.vehicle.internalNotes}
          onChange={(event) => updateVehicle("internalNotes", event.target.value)}
          rows={3}
        />
      </label>

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
