import { Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { BrowseView } from "./views/BrowseView";
import { CategoryView } from "./views/CategoryView";
import { LandingView } from "./views/LandingView";
import { VehicleView } from "./views/VehicleView";

function Header() {
  const navigate = useNavigate();
  return (
    <header className="public-header" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
      <div>
        <p className="public-header-brand">Celebration Church</p>
        <h1 className="public-header-title">Father's Day Car Show</h1>
      </div>
    </header>
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

export function App() {
  return (
    <div className="public-app">
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route element={<WithHeader />}>
          <Route path="/v/:token" element={<VehicleView />} />
          <Route path="/browse" element={<BrowseView />} />
          <Route path="/browse/:slug" element={<CategoryView />} />
        </Route>
      </Routes>
    </div>
  );
}
