import { LogOut, UserRound } from "lucide-react";
import { Button } from "../atoms/Button.js";
import type { StaffUser } from "../types.js";

export function StaffCard({
  staff,
  onLogout,
}: {
  staff: StaffUser;
  onLogout: () => void;
}) {
  return (
    <div className="staff-card">
      <UserRound size={24} />
      <div>
        <strong>{staff.displayName}</strong>
        <span>{staff.role}</span>
      </div>
      <Button variant="icon" onClick={onLogout} aria-label="Log out">
        <LogOut size={20} />
      </Button>
    </div>
  );
}
