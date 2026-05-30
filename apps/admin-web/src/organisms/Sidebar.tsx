import { Car, ClipboardList, QrCode, Tags, Trophy } from "lucide-react";
import { SidebarNavButton, StaffCard } from "@carshow/carshow-components";
import type { StaffUser } from "@carshow/carshow-components";
import type { View } from "../App";

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
      <div>
        <div className="brand-mark">CELEBRATION CHURCH</div>
        <p className="eyebrow">Staff Dashboard</p>
      </div>
      <nav>
        <SidebarNavButton active={view === "dashboard"} onClick={() => onNavigate("dashboard")}>
          <ClipboardList size={22} />
          Dashboard
        </SidebarNavButton>
        <SidebarNavButton active={view === "registrations"} onClick={() => onNavigate("registrations")}>
          <Car size={22} />
          Registrations
        </SidebarNavButton>
        <SidebarNavButton active={view === "qr-cards"} onClick={() => onNavigate("qr-cards")}>
          <QrCode size={22} />
          QR Cards
        </SidebarNavButton>
        <SidebarNavButton active={view === "categories"} onClick={() => onNavigate("categories")}>
          <Tags size={22} />
          Categories
        </SidebarNavButton>
        <SidebarNavButton active={view === "voting"} onClick={() => onNavigate("voting")}>
          <Trophy size={22} />
          Voting
        </SidebarNavButton>
      </nav>
      <StaffCard staff={staff} onLogout={onLogout} />
    </>
  );
}
