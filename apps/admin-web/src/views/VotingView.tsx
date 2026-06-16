import type { Registration, StaffUser } from "@carshow/carshow-components";
import { VotingSettings } from "../organisms/VotingSettings";

export function VotingView({
  staff,
  onOpenRegistration,
}: {
  staff: StaffUser;
  onOpenRegistration: (registration: Registration) => void;
}) {
  return <VotingSettings staff={staff} onOpenRegistration={onOpenRegistration} />;
}
