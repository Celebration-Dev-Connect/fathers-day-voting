import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  Car,
  CheckCircle2,
  Clock,
  ClipboardList,
  LogOut,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trophy,
  UserRound,
} from "lucide-react";
import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  assignQrCard,
  checkInRegistration,
  clearToken,
  createCategory,
  createRegistration,
  devLogin,
  getVotingSettings,
  getVotingTallies,
  listAudit,
  listCategories,
  listQrCards,
  listRegistrations,
  lookupQrCard,
  me,
  setToken,
  updateCategory,
  updateRegistration,
  updateVotingSettings,
} from "./api";
import { PUBLIC_APP_URL } from "./config";
import type {
  AuditLog,
  Category,
  CategoryVotingTally,
  QrCard as QrCardRecord,
  Registration,
  RegistrationPayload,
  StaffUser,
  VotingSettings,
} from "./types";

type View = "dashboard" | "registrations" | "qr-cards" | "categories" | "voting";

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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const first = digits.slice(0, 3);
  const second = digits.slice(3, 6);
  const third = digits.slice(6, 10);

  if (digits.length > 6) return `${first}-${second}-${third}`;
  if (digits.length > 3) return `${first}-${second}`;
  return first;
}

function payloadFromRegistration(registration: Registration): RegistrationPayload {
  return {
    owner: {
      firstName: registration.owner.firstName,
      lastName: registration.owner.lastName,
      phone: formatPhone(registration.owner.phone),
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

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : null;
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
          <button className={view === "qr-cards" ? "active" : ""} onClick={() => setView("qr-cards")}>
            <QrCode size={22} />
            QR Cards
          </button>
          <button className={view === "categories" ? "active" : ""} onClick={() => setView("categories")}>
            <Tags size={22} />
            Categories
          </button>
          <button className={view === "voting" ? "active" : ""} onClick={() => setView("voting")}>
            <Trophy size={22} />
            Voting
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
        {view === "qr-cards" ? <QrCardsView /> : null}
        {view === "categories" ? (
          <CategoriesView staff={staff} categories={categories} onRefresh={refresh} />
        ) : null}
        {view === "voting" ? <VotingView staff={staff} /> : null}
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
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const cameraAvailable =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  async function refreshAudit() {
    setAuditLoading(true);
    try {
      const result = await listAudit(registration.id);
      setAuditLogs(result.auditLogs);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Could not load QR audit trail");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    setCode("");
    setMessage("");
    setError("");
    void refreshAudit();
  }, [registration.id]);

  async function startScan() {
    setError("");
    setMessage("");
    if (!cameraAvailable) {
      setError(
        window.isSecureContext
          ? "Camera scanning is not available in this browser. Enter the QR code manually."
          : "Camera scanning requires HTTPS on iPad/Safari. Enter the QR code manually for now.",
      );
      return;
    }
    if (!videoElement) {
      setError("Camera view is still loading. Try Scan again.");
      return;
    }
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoDevice(undefined, videoElement);
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
      const result = await assignQrCard(registration.id, code);
      onAssigned(result.registration);
      await refreshAudit();
      setCode("");
      setMessage("QR assigned and audit log written.");
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "QR assignment failed");
    }
  }

  return (
    <section className="qr-panel">
      <div>
        <strong>{registration.qrCard ? `QR ${registration.qrCard.visibleCode}` : "Assign QR Card"}</strong>
        <span>{registration.qrCard ? "Scan a new QR to replace this card" : "Camera scan plus manual fallback"}</span>
      </div>
      <video ref={setVideoElement} className="qr-video" muted playsInline />
      <div className="qr-actions">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="C-001 or token" />
        <button type="button" className="secondary-button" onClick={startScan} disabled={scanning}>
          <QrCode size={20} />
          {scanning ? "Scanning..." : "Scan"}
        </button>
        <button type="button" className="primary-button" onClick={assign} disabled={!code}>
          {registration.qrCard ? "Replace QR" : "Assign"}
        </button>
      </div>
      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert danger">{error}</div> : null}
      <div className="qr-audit">
        <div className="qr-audit-header">
          <strong>Audit Trail</strong>
          <button type="button" className="icon-button light" onClick={refreshAudit} aria-label="Refresh QR audit">
            <RefreshCw size={18} />
          </button>
        </div>
        {auditLoading ? <span>Loading audit...</span> : null}
        {!auditLoading && !auditLogs.length ? <span>No QR assignment history yet.</span> : null}
        {auditLogs.slice(0, 5).map((log) => (
          <div className="audit-row" key={log.id}>
            <div>
              <strong>{log.action.replace("_", " ")}</strong>
              <span>
                {log.qrCard.visibleCode} by {log.staffUser.displayName}
              </span>
            </div>
            <time>{formatDateTime(log.createdAt)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function QrCardsView() {
  const [qrCards, setQrCards] = useState<QrCardRecord[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    listQrCards(status)
      .then(({ qrCards }) => setQrCards(qrCards))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load QR cards"))
      .finally(() => setLoading(false));
  }, [status]);

  const availableCount = qrCards.filter((card) => card.status === "PRINTED").length;
  const assignedCount = qrCards.filter((card) => card.status === "ASSIGNED").length;

  return (
    <section className="qr-cards-view">
      <div className="page-header no-print">
        <div>
          <p className="eyebrow">Seeded QR Inventory</p>
          <h1>QR Cards</h1>
        </div>
        <div className="header-actions">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter QR cards">
            <option value="">All Cards</option>
            <option value="PRINTED">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="REASSIGNED">Reassigned</option>
            <option value="RETIRED">Retired</option>
          </select>
          <button type="button" className="primary-button" onClick={() => window.print()}>
            <Printer size={20} />
            Print
          </button>
        </div>
      </div>

      {error ? <div className="alert danger no-print">{error}</div> : null}

      <div className="qr-summary no-print">
        <Metric label="Loaded Cards" value={qrCards.length} icon={<QrCode />} />
        <Metric label="Available" value={availableCount} icon={<CheckCircle2 />} />
        <Metric label="Assigned" value={assignedCount} icon={<Car />} />
      </div>

      {loading ? <div className="empty-state no-print">Loading QR cards...</div> : null}
      {!loading && !qrCards.length ? <div className="empty-state no-print">No QR cards found.</div> : null}

      <div className="print-sheet" aria-label="Printable QR card sheet">
        {chunk(qrCards, 4).map((pageCards, pageIndex) => (
          <div className="print-page" key={`qr-page-${pageIndex}`}>
            {pageCards.map((card) => (
              <QrPrintCard key={card.id} card={card} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

function QrPrintCard({ card }: { card: QrCardRecord }) {
  const [dataUrl, setDataUrl] = useState("");
  const qrUrl = `${PUBLIC_APP_URL}/v/${card.publicToken}`;
  const owner = card.vehicleEntry?.owner;

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "Q",
      margin: 2,
      width: 720,
      color: {
        dark: "#191c21",
        light: "#ffffff",
      },
    }).then((url) => {
      if (mounted) setDataUrl(url);
    });

    return () => {
      mounted = false;
    };
  }, [qrUrl]);

  return (
    <article className={`qr-print-card ${card.status.toLowerCase()}`}>
      <div className="qr-print-heading">
        <div>
          <strong>Father's Day Car Show</strong>
          <span>Celebration Church</span>
        </div>
        <b>{card.visibleCode}</b>
      </div>
      {dataUrl ? <img src={dataUrl} alt={`QR code ${card.visibleCode}`} /> : <div className="qr-placeholder" />}
      <div className="qr-print-footer">
        <span>{card.status.replace("_", " ")}</span>
        <small>{owner ? `${owner.firstName} ${owner.lastName}` : qrUrl}</small>
      </div>
    </article>
  );
}

function VotingView({ staff }: { staff: StaffUser }) {
  const [settings, setSettings] = useState<VotingSettings | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [tallies, setTallies] = useState<CategoryVotingTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManage = staff.role === "ADMIN";

  async function refreshVoting() {
    setLoading(true);
    setError("");
    try {
      const [settingsResult, tallyResult] = await Promise.all([getVotingSettings(), getVotingTallies()]);
      setSettings(settingsResult.event);
      setCutoff(toDateTimeLocalValue(settingsResult.event.peopleChoiceCutoff));
      setTallies(tallyResult.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load voting results");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshVoting();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await updateVotingSettings({
        votingOpen: settings.votingOpen,
        judgingOpen: settings.judgingOpen,
        resultsPublished: settings.resultsPublished,
        peopleChoiceCutoff: fromDateTimeLocalValue(cutoff),
      });
      setSettings(result.event);
      setCutoff(toDateTimeLocalValue(result.event.peopleChoiceCutoff));
      await refreshVoting();
      setMessage("Voting settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save voting settings");
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<Key extends keyof Pick<VotingSettings, "votingOpen" | "judgingOpen" | "resultsPublished">>(
    key: Key,
    value: VotingSettings[Key],
  ) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Voting Control</p>
          <h1>People's Choice & Judging</h1>
        </div>
        <button type="button" className="secondary-button" onClick={refreshVoting} disabled={loading}>
          <RefreshCw size={20} />
          Refresh
        </button>
      </div>

      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert danger">{error}</div> : null}
      {!canManage ? <div className="alert">Registrar accounts can view voting tallies but cannot edit settings.</div> : null}

      <div className="voting-settings">
        <div>
          <p className="eyebrow">People's Choice Cutoff</p>
          <h2>{formatDateTime(settings?.peopleChoiceCutoff)}</h2>
        </div>
        <label>
          Cutoff time
          <input
            type="datetime-local"
            value={cutoff}
            disabled={!canManage || !settings}
            onChange={(event) => setCutoff(event.target.value)}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.votingOpen ?? false}
            disabled={!canManage || !settings}
            onChange={(event) => updateSetting("votingOpen", event.target.checked)}
          />
          People's choice open
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.judgingOpen ?? false}
            disabled={!canManage || !settings}
            onChange={(event) => updateSetting("judgingOpen", event.target.checked)}
          />
          Judging open
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.resultsPublished ?? false}
            disabled={!canManage || !settings}
            onChange={(event) => updateSetting("resultsPublished", event.target.checked)}
          />
          Results published
        </label>
        <button type="button" className="primary-button" onClick={saveSettings} disabled={!canManage || saving || !settings}>
          <Save size={20} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {loading ? <div className="empty-state">Loading voting tallies...</div> : null}
      {!loading ? (
        <div className="tally-grid">
          {tallies.map((tally) => (
            <article className="tally-card" key={tally.category.id}>
              <div className="tally-card-header">
                <div>
                  <p className="eyebrow">Category</p>
                  <h2>{tally.category.name}</h2>
                </div>
              </div>

              <section className="tally-section">
                <div className="section-title">
                  <Trophy size={18} />
                  <strong>People's Choice</strong>
                </div>
                {tally.peopleChoice.length ? (
                  <div className="rank-list">
                    {tally.peopleChoice.map((item, index) => (
                      <div className="rank-row" key={item.registration.id}>
                        <span className="rank-badge">{index + 1}</span>
                        <div>
                          <strong>{vehicleName(item.registration)}</strong>
                          <span>
                            #{item.registration.entryNumber.toString().padStart(3, "0")} - {item.votes} votes
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No people's choice votes yet.</p>
                )}
              </section>

              <section className="tally-section">
                <div className="section-title">
                  <Clock size={18} />
                  <strong>Judge Top 3</strong>
                </div>
                {tally.judgeTop3.length ? (
                  <div className="rank-list">
                    {tally.judgeTop3.map((pick) => (
                      <div className="rank-row" key={pick.id}>
                        <span className="rank-badge">{pick.rank}</span>
                        <div>
                          <strong>{vehicleName(pick.registration)}</strong>
                          <span>
                            #{pick.registration.entryNumber.toString().padStart(3, "0")}
                            {pick.judgeName ? ` - ${pick.judgeName}` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No judge picks recorded yet.</p>
                )}
              </section>
            </article>
          ))}
        </div>
      ) : null}
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
