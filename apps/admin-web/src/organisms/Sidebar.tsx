import { Car, CircleHelp, ClipboardList, Images, LogOut, QrCode, ShieldCheck, Tags, Trophy } from "lucide-react";
import { SidebarNavButton, StaffCard } from "@carshow/carshow-components";
import type { StaffUser } from "@carshow/carshow-components";
import type { View } from "../App";

const viewLabels: Record<View, string> = {
  dashboard: "Dashboard",
  registrations: "Registrations",
  "qr-cards": "QR Cards",
  categories: "Categories",
  "photo-review": "Photo Review",
  voting: "Voting",
  "team-access": "Team Access",
  help: "Help Guide",
};

export function Sidebar({
  staff,
  view,
  onNavigate,
  onLogout,
}: {
  staff: StaffUser;
  view: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="mobile-admin-bar">
        <div>
          <div className="brand-mark">CELEBRATION CHURCH</div>
          <p>{viewLabels[view]}</p>
        </div>
        <button type="button" onClick={onLogout} aria-label="Log out">
          <LogOut size={22} />
        </button>
      </div>

      <div className="sidebar-brand">
        <div className="brand-mark">CELEBRATION CHURCH</div>
        <p className="eyebrow">Staff Dashboard</p>
      </div>
      <nav>
        <SidebarNavButton active={view === "dashboard"} onClick={() => onNavigate("dashboard")} aria-label="Dashboard">
          <ClipboardList size={22} />
          <span>Dashboard</span>
        </SidebarNavButton>
        <SidebarNavButton
          active={view === "registrations"}
          onClick={() => onNavigate("registrations")}
          aria-label="Registrations"
        >
          <Car size={22} />
          <span>Registrations</span>
        </SidebarNavButton>
        <SidebarNavButton active={view === "qr-cards"} onClick={() => onNavigate("qr-cards")} aria-label="QR Cards">
          <QrCode size={22} />
          <span>QR Cards</span>
        </SidebarNavButton>
        <SidebarNavButton active={view === "categories"} onClick={() => onNavigate("categories")} aria-label="Categories">
          <Tags size={22} />
          <span>Categories</span>
        </SidebarNavButton>
        <SidebarNavButton
          active={view === "photo-review"}
          onClick={() => onNavigate("photo-review")}
          aria-label="Photo Review"
        >
          <Images size={22} />
          <span>Photos</span>
        </SidebarNavButton>
        <SidebarNavButton active={view === "voting"} onClick={() => onNavigate("voting")} aria-label="Voting">
          <Trophy size={22} />
          <span>Voting</span>
        </SidebarNavButton>
        {staff.role === "ADMIN" ? (
          <SidebarNavButton
            active={view === "team-access"}
            onClick={() => onNavigate("team-access")}
            aria-label="Team Access"
          >
            <ShieldCheck size={22} />
            <span>Team Access</span>
          </SidebarNavButton>
        ) : null}
        <SidebarNavButton active={view === "help"} onClick={() => onNavigate("help")} aria-label="Help Guide">
          <CircleHelp size={22} />
          <span>Help</span>
        </SidebarNavButton>
      </nav>
      <StaffCard staff={staff} onLogout={onLogout} />
    </>
  );
}
