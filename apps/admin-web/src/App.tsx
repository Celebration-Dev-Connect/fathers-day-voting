import { AdminShell as AdminShellTemplate, Alert, LoginCard } from "@carshow/carshow-components";
import type { Category, DashboardMetrics, Registration, SpecialAward, StaffUser } from "@carshow/carshow-components";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  clearToken,
  getDashboardMetrics,
  listCategories,
  listRegistrations,
  listSpecialAwards,
  me,
  setToken,
  type RegistrationFilter,
} from "./api";
import { API_URL } from "./config";
import { Sidebar } from "./organisms/Sidebar";
import { DashboardView } from "./views/DashboardView";

const CategoriesView = lazy(() =>
  import("./views/CategoriesView").then(({ CategoriesView }) => ({ default: CategoriesView })),
);
const PhotoReviewView = lazy(() =>
  import("./views/PhotoReviewView").then(({ PhotoReviewView }) => ({ default: PhotoReviewView })),
);
const QrCardsView = lazy(() =>
  import("./views/QrCardsView").then(({ QrCardsView }) => ({ default: QrCardsView })),
);
const RegistrationsView = lazy(() =>
  import("./views/RegistrationsView").then(({ RegistrationsView }) => ({ default: RegistrationsView })),
);
const VotingView = lazy(() =>
  import("./views/VotingView").then(({ VotingView }) => ({ default: VotingView })),
);
const HelpView = lazy(() =>
  import("./views/HelpView").then(({ HelpView }) => ({ default: HelpView })),
);
const CeremonyView = lazy(() =>
  import("./views/CeremonyView").then(({ CeremonyView }) => ({ default: CeremonyView })),
);
const TeamAccessView = lazy(() =>
  import("./views/TeamAccessView").then(({ TeamAccessView }) => ({ default: TeamAccessView })),
);

export type View =
  | "dashboard"
  | "registrations"
  | "qr-cards"
  | "categories"
  | "photo-review"
  | "voting"
  | "team-access"
  | "help";

export function App() {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = hash.get("token");
    const fragmentError = hash.get("error");
    window.history.replaceState(null, "", window.location.pathname);

    if (fragmentError) {
      setLoginError("Planning Center login failed. Make sure your account has been granted access.");
      setLoadingSession(false);
      return;
    }
    if (fragmentToken) setToken(fragmentToken);

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
        error={loginError}
        planningCenterUrl={`${API_URL}/auth/planning-center/start?app=admin`}
      />
    );
  }

  if (window.location.pathname.replace(/\/$/, "").endsWith("/ceremony")) {
    return (
      <Suspense fallback={<div className="boot">Loading ceremony...</div>}>
        <CeremonyView />
      </Suspense>
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
  const [specialAwards, setSpecialAwards] = useState<SpecialAward[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    total: 0,
    checkedIn: 0,
    assignedQr: 0,
    categories: 0,
  });
  const [search, setSearch] = useState("");
  const [registrationFilter, setRegistrationFilter] = useState<RegistrationFilter | "all">("all");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listCategories(), listSpecialAwards()])
      .then(([categoryResult, specialAwardResult]) => {
        setCategories(categoryResult.categories);
        setSpecialAwards(specialAwardResult.specialAwards);
      })
      .catch((loadError) => setError(loadError.message));
  }, [refreshKey]);

  useEffect(() => {
    getDashboardMetrics()
      .then(({ metrics }) => setMetrics(metrics))
      .catch((loadError) => setError(loadError.message));
  }, [refreshKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      listRegistrations(search, registrationFilter === "all" ? undefined : registrationFilter)
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
  }, [refreshKey, search, registrationFilter, selected?.id]);

  function refresh() {
    setRefreshKey((v) => v + 1);
  }

  return (
    <AdminShellTemplate
      sidebar={<Sidebar staff={staff} view={view} onNavigate={setView} onLogout={onLogout} />}
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <Suspense fallback={<div className="empty-state">Loading view...</div>}>
        {view === "dashboard" ? (
          <DashboardView metrics={metrics} onRegister={() => setView("registrations")} />
        ) : null}
        {view === "registrations" ? (
          <RegistrationsView
            staff={staff}
            categories={categories}
            registrations={registrations}
            search={search}
            registrationFilter={registrationFilter}
            selected={selected}
            onSearch={setSearch}
            onFilterChange={setRegistrationFilter}
            onSelect={setSelected}
            onRefresh={refresh}
          />
        ) : null}
        {view === "qr-cards" ? <QrCardsView /> : null}
        {view === "categories" ? (
          <CategoriesView
            staff={staff}
            categories={categories}
            specialAwards={specialAwards}
            onRefresh={refresh}
          />
        ) : null}
        {view === "photo-review" ? <PhotoReviewView /> : null}
        {view === "voting" ? (
          <VotingView
            staff={staff}
            onOpenRegistration={(registration) => {
              setSelected(registration);
              setSearch(registration.entryNumber.toString());
              setView("registrations");
            }}
          />
        ) : null}
        {view === "team-access" && staff.role === "ADMIN" ? <TeamAccessView /> : null}
        {view === "help" ? <HelpView staff={staff} onNavigate={setView} /> : null}
      </Suspense>
    </AdminShellTemplate>
  );
}
