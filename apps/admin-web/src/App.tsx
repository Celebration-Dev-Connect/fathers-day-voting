import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  Car,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Plus,
  QrCode,
  Save,
  Search,
  ShieldCheck,
  Tags,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  assignQrCard,
  checkInRegistration,
  clearToken,
  createCategory,
  createRegistration,
  devLogin,
  listCategories,
  listRegistrations,
  lookupQrCard,
  me,
  setToken,
  updateCategory,
  updateRegistration,
} from "./api";
import type { Category, Registration, RegistrationPayload, StaffUser } from "./types";

type View = "dashboard" | "registrations" | "categories";

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

function payloadFromRegistration(registration: Registration): RegistrationPayload {
  return {
    owner: {
      firstName: registration.owner.firstName,
      lastName: registration.owner.lastName,
      phone: registration.owner.phone,
      email: registration.owner.email ?? "",
      publicName: registration.owner.publicName ?? "",
      publicNameOptIn: registration.owner.publicNameOptIn,
      waiverAccepted: registration.owner.waiverAccepted,
    },
    vehicle: {
      categoryId: registration.category.id,
      year: registration.year,
      make: registration.make,
      model: registration.model,
      nickname: registration.nickname ?? "",
      plateNumber: registration.plateNumber ?? "",
      exteriorColor: registration.exteriorColor ?? "",
      internalNotes: registration.internalNotes ?? "",
    },
  };
}

function vehicleName(registration: Registration) {
  return `${registration.year} ${registration.make} ${registration.model}`;
}

export function App() {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    me()
      .then(({ staff }) => setStaff(staff))
      .catch(() => clearToken())
      .finally(() => setLoadingSession(false));
  }, []);

  if (loadingSession) {
    return <div className="boot">Starting registration console...</div>;
  }

  if (!staff) {
    return (
      <LoginScreen
        error={error}
        onLogin={async (email) => {
          setError("");
          try {
            const result = await devLogin(email);
            setToken(result.token);
            setStaff(result.staff);
          } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : "Login failed");
          }
        }}
      />
    );
  }

  return (
    <AdminShell
      staff={staff}
      onLogout={() => {
        clearToken();
        setStaff(null);
      }}
    />
  );
}

function LoginScreen({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("admin@carshow.local");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await onLogin(email);
    setSubmitting(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">CELEBRATION CHURCH</div>
        <p className="eyebrow">Staff Registration Console</p>
        <h1>Father's Day Car Show</h1>
        <form onSubmit={submit} className="stack">
          <label>
            Dev staff account
            <select value={email} onChange={(event) => setEmail(event.target.value)}>
              <option value="admin@carshow.local">Admin User</option>
              <option value="registrar1@carshow.local">Registrar One</option>
              <option value="registrar2@carshow.local">Registrar Two</option>
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={submitting}>
            <ShieldCheck size={20} />
            {submitting ? "Signing in..." : "Dev Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminShell({ staff, onLogout }: { staff: StaffUser; onLogout: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [categories, setCategories] = useState<Category[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    listCategories()
      .then(({ categories }) => setCategories(categories))
      .catch((loadError) => setError(loadError.message));
  }, [refreshKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      listRegistrations(search)
        .then(({ registrations }) => {
          setRegistrations(registrations);
          if (selected) {
            const updated = registrations.find((registration) => registration.id === selected.id);
            if (updated) setSelected(updated);
          }
        })
        .catch((loadError) => setError(loadError.message));
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [refreshKey, search, selected?.id]);

  const metrics = useMemo(() => {
    const checkedIn = registrations.filter((registration) => registration.status === "CHECKED_IN").length;
    const assignedQr = registrations.filter((registration) => registration.qrCard).length;
    return {
      total: registrations.length,
      checkedIn,
      assignedQr,
      categories: categories.filter((category) => category.active).length,
    };
  }, [categories, registrations]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">CELEBRATION CHURCH</div>
          <p className="eyebrow">Staff Dashboard</p>
        </div>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <ClipboardList size={22} />
            Dashboard
          </button>
          <button className={view === "registrations" ? "active" : ""} onClick={() => setView("registrations")}>
            <Car size={22} />
            Registrations
          </button>
          <button className={view === "categories" ? "active" : ""} onClick={() => setView("categories")}>
            <Tags size={22} />
            Categories
          </button>
        </nav>
        <div className="staff-card">
          <UserRound size={24} />
          <div>
            <strong>{staff.displayName}</strong>
            <span>{staff.role}</span>
          </div>
          <button className="icon-button" onClick={onLogout} aria-label="Log out">
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        {error ? <div className="alert danger">{error}</div> : null}
        {view === "dashboard" ? (
          <Dashboard metrics={metrics} onRegister={() => setView("registrations")} />
        ) : null}
        {view === "registrations" ? (
          <RegistrationsView
            categories={categories}
            registrations={registrations}
            search={search}
            selected={selected}
            onSearch={setSearch}
            onSelect={setSelected}
            onRefresh={refresh}
          />
        ) : null}
        {view === "categories" ? (
          <CategoriesView staff={staff} categories={categories} onRefresh={refresh} />
        ) : null}
      </main>
    </div>
  );
}

function Dashboard({
  metrics,
  onRegister,
}: {
  metrics: { total: number; checkedIn: number; assignedQr: number; categories: number };
  onRegister: () => void;
}) {
  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">2026 Event</p>
          <h1>Registration Overview</h1>
        </div>
        <button className="primary-button" onClick={onRegister}>
          <Plus size={20} />
          Register Vehicle
        </button>
      </div>
      <div className="metric-grid">
        <Metric label="Registered Vehicles" value={metrics.total} icon={<Car />} />
        <Metric label="Checked In" value={metrics.checkedIn} icon={<CheckCircle2 />} />
        <Metric label="QR Assigned" value={metrics.assignedQr} icon={<QrCode />} />
        <Metric label="Active Categories" value={metrics.categories} icon={<Tags />} />
      </div>
      <div className="wide-card">
        <h2>Event-day focus</h2>
        <p>
          This slice is intentionally tight: register vehicles, check them in, assign QR cards, and keep
          audit history clean before adding judging, photo moderation, voting cutoff, and results.
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function RegistrationsView({
  categories,
  registrations,
  search,
  selected,
  onSearch,
  onSelect,
  onRefresh,
}: {
  categories: Category[];
  registrations: Registration[];
  search: string;
  selected: Registration | null;
  onSearch: (value: string) => void;
  onSelect: (registration: Registration | null) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="registrations-layout">
      <div className="list-panel">
        <div className="page-header compact">
          <div>
            <p className="eyebrow">Registration Table</p>
            <h1>Staff Registrations</h1>
          </div>
          <button className="primary-button" onClick={() => onSelect(null)}>
            <Plus size={20} />
            New
          </button>
        </div>
        <label className="search-box">
          <Search size={20} />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search owner, phone, plate, entry, QR..."
          />
        </label>
        <div className="registration-list">
          {registrations.map((registration) => (
            <button
              key={registration.id}
              className={`registration-row ${selected?.id === registration.id ? "selected" : ""}`}
              onClick={() => onSelect(registration)}
            >
              <span className="entry-code">#{registration.entryNumber.toString().padStart(3, "0")}</span>
              <div>
                <strong>{vehicleName(registration)}</strong>
                <span>
                  {registration.owner.firstName} {registration.owner.lastName}
                </span>
              </div>
              <span className={`status-badge ${registration.status.toLowerCase()}`}>
                {registration.status.replace("_", " ")}
              </span>
              <span className="qr-pill">{registration.qrCard?.visibleCode ?? "No QR"}</span>
            </button>
          ))}
          {!registrations.length ? <div className="empty-state">No registrations found.</div> : null}
        </div>
      </div>
      <RegistrationEditor
        key={selected?.id ?? "new"}
        categories={categories}
        registration={selected}
        onSaved={(registration) => {
          onSelect(registration);
          onRefresh();
        }}
      />
    </section>
  );
}

function RegistrationEditor({
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
        <button className="primary-button" disabled={saving}>
          <Save size={20} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert danger">{error}</div> : null}

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
          <input value={payload.owner.phone} onChange={(event) => updateOwner("phone", event.target.value)} />
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
          <button type="button" className="secondary-button" onClick={checkIn}>
            <CheckCircle2 size={20} />
            Check In
          </button>
          <QrAssignment registration={registration} onAssigned={onSaved} />
        </div>
      ) : null}
    </form>
  );
}

function QrAssignment({
  registration,
  onAssigned,
}: {
  registration: Registration;
  onAssigned: (registration: Registration) => void;
}) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [code, setCode] = useState(registration.qrCard?.visibleCode ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  async function startScan() {
    setError("");
    setMessage("");
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoDevice(undefined, videoElement!);
      const scannedCode = result.getText();
      setCode(scannedCode);
      setMessage(`Scanned ${scannedCode}`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Camera scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function assign() {
    setError("");
    setMessage("");
    try {
      await lookupQrCard(code);
      await assignQrCard(registration.id, code);
      setMessage("QR assigned and audit log written.");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "QR assignment failed");
    }
  }

  return (
    <section className="qr-panel">
      <div>
        <strong>{registration.qrCard ? `QR ${registration.qrCard.visibleCode}` : "Assign QR Card"}</strong>
        <span>Camera scan plus manual fallback</span>
      </div>
      <video ref={setVideoElement} className="qr-video" muted playsInline />
      <div className="qr-actions">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="C-001 or token" />
        <button type="button" className="secondary-button" onClick={startScan} disabled={scanning}>
          <QrCode size={20} />
          {scanning ? "Scanning..." : "Scan"}
        </button>
        <button type="button" className="primary-button" onClick={assign} disabled={!code || Boolean(registration.qrCard)}>
          Assign
        </button>
      </div>
      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert danger">{error}</div> : null}
    </section>
  );
}

function CategoriesView({
  staff,
  categories,
  onRefresh,
}: {
  staff: StaffUser;
  categories: Category[];
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createCategory(name);
      setName("");
      onRefresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create category");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin Setup</p>
          <h1>Categories</h1>
        </div>
      </div>
      {error ? <div className="alert danger">{error}</div> : null}
      {staff.role === "ADMIN" ? (
        <form className="inline-form" onSubmit={addCategory}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category name" />
          <button className="primary-button">
            <Plus size={20} />
            Add Category
          </button>
        </form>
      ) : (
        <div className="alert">Registrar accounts can view categories but cannot edit setup.</div>
      )}
      <div className="category-grid">
        {categories.map((category) => (
          <article key={category.id} className="category-card">
            <div>
              <strong>{category.name}</strong>
              <span>{category._count?.vehicleEntries ?? 0} registrations</span>
            </div>
            <button
              className="secondary-button"
              disabled={staff.role !== "ADMIN"}
              onClick={async () => {
                await updateCategory(category.id, { active: !category.active });
                onRefresh();
              }}
            >
              {category.active ? "Active" : "Inactive"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
