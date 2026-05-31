import { AdminShell as AdminShellTemplate, Alert, LoginCard } from "@carshow/carshow-components";
import type { Category, DashboardMetrics, Registration, StaffUser } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { clearToken, devLogin, getDashboardMetrics, listCategories, listRegistrations, me, setToken } from "./api";
import { Sidebar } from "./organisms/Sidebar";
import { CategoriesView } from "./views/CategoriesView";
import { DashboardView } from "./views/DashboardView";
import { QrCardsView } from "./views/QrCardsView";
import { RegistrationsView } from "./views/RegistrationsView";
import { VotingView } from "./views/VotingView";

export type View = "dashboard" | "registrations" | "qr-cards" | "categories" | "voting";

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
    return <div className="boot">Starting registration console...</div>;
  }

  if (!staff) {
    return (
      <LoginCard
        brandMark="CELEBRATION CHURCH"
        subtitle="Staff Registration Console"
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

  return (
    <AdminShellConnected staff={staff} onLogout={() => { clearToken(); setStaff(null); }} />
  );
}

function AdminShellConnected({
  staff,
  onLogout,
}: {
  staff: StaffUser;
  onLogout: () => void;
}) {
  const [view, setView] = useState<View>("dashboard");
  const [categories, setCategories] = useState<Category[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    total: 0,
    checkedIn: 0,
    assignedQr: 0,
    categories: 0,
  });
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
    getDashboardMetrics()
      .then(({ metrics }) => setMetrics(metrics))
      .catch((loadError) => setError(loadError.message));
  }, [refreshKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      listRegistrations(search)
        .then(({ registrations }) => {
          setRegistrations(registrations);
          if (selected) {
            const updated = registrations.find((r) => r.id === selected.id);
            if (updated) setSelected(updated);
          }
        })
        .catch((loadError) => setError(loadError.message));
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [refreshKey, search, selected?.id]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  return (
    <AdminShellTemplate
      sidebar={<Sidebar staff={staff} view={view} onNavigate={setView} onLogout={onLogout} />}
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {view === "dashboard" ? (
        <DashboardView metrics={metrics} onRegister={() => setView("registrations")} />
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
    </AdminShellTemplate>
  );
}
