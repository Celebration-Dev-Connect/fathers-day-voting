import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import logoHeader from "./assets/logo-header.png";
import { VotePanel } from "./components/VotePanel";
import { VotingProvider, useVoting } from "./context/VotingContext";
import { BrowseView } from "./views/BrowseView";
import { CategoryView } from "./views/CategoryView";
import { EntryDetailView } from "./views/EntryDetailView";
import { LandingView } from "./views/LandingView";
import { VehicleView } from "./views/VehicleView";

function Header() {
  const navigate = useNavigate();
  const {
    votingOpen,
    cutoffPassed,
    categories,
    specialAwards,
    drafts,
    submitted,
    specialAwardDrafts,
    specialAwardSubmitted,
    isPanelOpen,
    togglePanel,
    closePanel,
  } = useVoting();

  const showVoting = votingOpen && !cutoffPassed;
  const totalInteracted =
    Object.keys(drafts).length +
    Object.keys(submitted).length +
    Object.keys(specialAwardDrafts).length +
    Object.keys(specialAwardSubmitted).length;
  const totalSubmitted = Object.keys(submitted).length + Object.keys(specialAwardSubmitted).length;
  const totalBallotItems = categories.length + specialAwards.length;

  return (
    <>
      <header
        className="public-header"
        onClick={() => navigate("/")}
        style={{ cursor: "pointer" }}
      >
        <div className="public-header-identity">
          <img
            src={logoHeader}
            alt="Father's Day Car Show"
            className="public-header-logo"
          />
          <div className="public-header-text">
            <p className="public-header-brand">Celebration Church</p>
            <h1 className="public-header-title">Father's Day Car Show</h1>
          </div>
        </div>
        {showVoting && (
          <button
            className="vote-now-btn"
            onClick={(e) => { e.stopPropagation(); togglePanel(); }}
            aria-expanded={isPanelOpen}
          >
            Vote Now
            {totalInteracted > 0 && (
              <span className="vote-now-badge">
                {totalSubmitted}/{totalBallotItems}
              </span>
            )}
          </button>
        )}
      </header>
      {isPanelOpen && showVoting && <VotePanel onClose={closePanel} />}
    </>
  );
}

function WithHeader() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

function AppRoutes() {
  return (
    <div className="public-app">
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route element={<WithHeader />}>
          <Route path="/v/:token" element={<VehicleView />} />
          <Route path="/browse" element={<BrowseView />} />
          <Route path="/browse/:slug" element={<CategoryView />} />
          <Route path="/browse/entry/:entryNumber" element={<EntryDetailView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export function App() {
  return (
    <VotingProvider>
      <AppRoutes />
    </VotingProvider>
  );
}
