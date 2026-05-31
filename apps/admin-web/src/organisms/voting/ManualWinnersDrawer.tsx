import { Save, X } from "lucide-react";
import { useState } from "react";
import { Alert, Button, vehicleName, type CategoryVotingTally } from "@carshow/carshow-components";

export function ManualWinnersDrawer({
  tally,
  saving,
  onClose,
  onSave,
}: {
  tally: CategoryVotingTally;
  saving: boolean;
  onClose: () => void;
  onSave: (winners: Array<{ vehicleEntryId: string; rank: number }>, reason: string) => Promise<void>;
}) {
  const candidates = tally.judgeRanking.slice(0, 10);
  const [winnerIds, setWinnerIds] = useState(() =>
    [1, 2, 3].map(
      (rank) =>
        tally.judgeTop3.find((winner) => winner.rank === rank)?.registration.id ??
        candidates[rank - 1]?.registration.id ??
        "",
    ),
  );
  const [reason, setReason] = useState("Manual admin final order after tie-break review.");

  function updateWinner(rank: number, vehicleEntryId: string) {
    setWinnerIds((current) => current.map((id, index) => (index === rank - 1 ? vehicleEntryId : id)));
  }

  const uniqueWinnerCount = new Set(winnerIds.filter(Boolean)).size;
  const canSave = winnerIds.every(Boolean) && uniqueWinnerCount === 3;

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="winner-drawer" aria-label="Manual winner order">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Manual Final Order</p>
            <h2>{tally.category.name}</h2>
          </div>
          <Button variant="icon" light onClick={onClose} aria-label="Close manual winner order">
            <X size={20} />
          </Button>
        </div>

        <Alert>{tally.judgingDescription}</Alert>

        <div className="manual-winner-form">
          {[1, 2, 3].map((rank) => (
            <label key={rank}>
              {rank === 1 ? "First place" : rank === 2 ? "Second place" : "Third place"}
              <select value={winnerIds[rank - 1]} onChange={(event) => updateWinner(rank, event.target.value)}>
                {candidates.map((candidate) => (
                  <option key={candidate.registration.id} value={candidate.registration.id}>
                    #{candidate.registration.entryNumber.toString().padStart(3, "0")} {vehicleName(candidate.registration)} -{" "}
                    {candidate.judgePoints} pts
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Reason
            <textarea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} />
          </label>
          {uniqueWinnerCount !== 3 ? <Alert variant="danger">Choose three different vehicles.</Alert> : null}
          <Button
            disabled={!canSave || saving}
            onClick={() =>
              onSave(
                winnerIds.map((vehicleEntryId, index) => ({ vehicleEntryId, rank: index + 1 })),
                reason,
              )
            }
          >
            <Save size={20} />
            {saving ? "Saving..." : "Save Final Order"}
          </Button>
        </div>

        <div className="ranking-table">
          {candidates.map((candidate) => (
            <div className="ranking-row" key={candidate.registration.id}>
              <span>{candidate.rank}</span>
              <strong>{vehicleName(candidate.registration)}</strong>
              <b>{candidate.judgePoints}</b>
              <small>{candidate.tieBreakSummary}</small>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

