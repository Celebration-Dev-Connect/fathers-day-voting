import type { StaffUser } from "@carshow/carshow-components";
import { VotingSettings } from "../organisms/VotingSettings";

export function VotingView({ staff }: { staff: StaffUser }) {
  return <VotingSettings staff={staff} />;
}
