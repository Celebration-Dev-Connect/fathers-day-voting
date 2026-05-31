import { Button } from "@carshow/carshow-components";
import { useNavigate } from "react-router-dom";

export function LandingView() {
  const navigate = useNavigate();
  return (
    <div>
      <div className="landing-hero">
        <p className="public-header-brand">Celebration Church</p>
        <h1 className="landing-hero-title">Father's Day Car Show</h1>
        <p className="landing-hero-sub">Scan a vehicle's QR card to view details and cast your vote.</p>
        <div className="landing-actions">
          <Button variant="primary" onClick={() => navigate("/browse")}>Browse Entries</Button>
        </div>
      </div>
    </div>
  );
}
