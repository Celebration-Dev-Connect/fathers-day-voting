import { ClipboardList, Clock, RefreshCw, Save, Trophy, X } from "lucide-react";
import {
  Alert,
  Button,
  formatDateTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
  vehicleName,
} from "@carshow/carshow-components";
import type {
  CategoryVotingTally,
  Registration,
  StaffUser,
  VotingSettings as VotingSettingsType,
} from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { getVotingSettings, getVotingTallies, updateCategoryWinners, updateVotingSettings } from "../api";

export function VotingSettings({ staff }: { staff: StaffUser }) {
  const [settings, setSettings] = useState<VotingSettingsType | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [tallies, setTallies] = useState<CategoryVotingTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedWinner, setSelectedWinner] = useState<Registration | null>(null);
  const [manualCategory, setManualCategory] = useState<CategoryVotingTally | null>(null);
  const [showJudgingGuide, setShowJudgingGuide] = useState(false);
  const canManage = staff.role === "ADMIN";

  async function refreshVoting() {
    setLoading(true);
    setError("");
    try {
      const [settingsResult, tallyResult] = await Promise.all([getVotingSettings(), getVotingTallies()]);
      setSettings(settingsResult.event);
      setCutoff(toDateTimeLocalValue(settingsResult.event.peopleChoiceCutoff));
      setTallies(tallyResult.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load voting results");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshVoting();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await updateVotingSettings({
        votingOpen: settings.votingOpen,
        judgingOpen: settings.judgingOpen,
        resultsPublished: settings.resultsPublished,
        peopleChoiceCutoff: fromDateTimeLocalValue(cutoff),
      });
      setSettings(result.event);
      setCutoff(toDateTimeLocalValue(result.event.peopleChoiceCutoff));
      await refreshVoting();
      setMessage("Voting settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save voting settings");
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<Key extends keyof Pick<VotingSettingsType, "votingOpen" | "judgingOpen" | "resultsPublished">>(
    key: Key,
    value: VotingSettingsType[Key],
  ) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveManualWinners(
    tally: CategoryVotingTally,
    winners: Array<{ vehicleEntryId: string; rank: number }>,
    reason: string,
  ) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateCategoryWinners(tally.category.id, winners, reason);
      setManualCategory(null);
      await refreshVoting();
      setMessage(`${tally.category.name} winners finalized.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save manual winners");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Voting Control</p>
          <h1>People's Choice &amp; Judging</h1>
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={() => setShowJudgingGuide(true)}>
            <ClipboardList size={20} />
            Judging Rules
          </Button>
          <Button variant="secondary" onClick={refreshVoting} disabled={loading}>
            <RefreshCw size={20} />
            Refresh
          </Button>
        </div>
      </div>

      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {!canManage ? <Alert>Registrar accounts can view voting tallies but cannot edit settings.</Alert> : null}

      <div className="voting-settings">
        <div>
          <p className="eyebrow">People's Choice Cutoff</p>
          <h2>{formatDateTime(settings?.peopleChoiceCutoff)}</h2>
        </div>
        <label>
          Cutoff time
          <input
            type="datetime-local"
            value={cutoff}
            disabled={!canManage || !settings}
            onChange={(event) => setCutoff(event.target.value)}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.votingOpen ?? false}
            disabled={!canManage || !settings}
            onChange={(event) => updateSetting("votingOpen", event.target.checked)}
          />
          People's choice open
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.judgingOpen ?? false}
            disabled={!canManage || !settings}
            onChange={(event) => updateSetting("judgingOpen", event.target.checked)}
          />
          Judging open
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.resultsPublished ?? false}
            disabled={!canManage || !settings}
            onChange={(event) => updateSetting("resultsPublished", event.target.checked)}
          />
          Results published
        </label>
        <Button onClick={saveSettings} disabled={!canManage || saving || !settings}>
          <Save size={20} />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {loading ? <div className="empty-state">Loading voting tallies...</div> : null}
      {!loading ? (
        <div className="tally-grid">
          {tallies.map((tally) => (
            <article className="tally-card" key={tally.category.id}>
              <div className="tally-card-header">
                <div>
                  <p className="eyebrow">Category</p>
                  <h2>{tally.category.name}</h2>
                </div>
              </div>

              <section className="tally-section">
                <div className="section-title">
                  <Trophy size={18} />
                  <strong>People's Choice</strong>
                </div>
                {tally.peopleChoice.length ? (
                  <div className="rank-list">
                    {tally.peopleChoice.map((item, index) => (
                      <button
                        type="button"
                        className="rank-row winner-row"
                        key={item.registration.id}
                        onClick={() => setSelectedWinner(item.registration)}
                      >
                        <span className="rank-badge">{index + 1}</span>
                        <div>
                          <strong>{vehicleName(item.registration)}</strong>
                          <span>
                            #{item.registration.entryNumber.toString().padStart(3, "0")} - {item.votes} votes
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No people's choice votes yet.</p>
                )}
              </section>

              <section className="tally-section">
                <div className="section-title">
                  <Clock size={18} />
                  <strong>Judge Top 3</strong>
                </div>
                {canManage && tally.judgeRanking.length >= 3 ? (
                  <Button variant="secondary" onClick={() => setManualCategory(tally)}>
                    Finalize Winners
                  </Button>
                ) : null}
                {tally.judgeTop3.length ? (
                  <div className="rank-list">
                    {tally.judgeTop3.map((pick) => (
                      <button
                        type="button"
                        className="rank-row winner-row"
                        key={pick.registration.id}
                        onClick={() => setSelectedWinner(pick.registration)}
                      >
                        <span className="rank-badge">{pick.rank}</span>
                        <div>
                          <strong>{vehicleName(pick.registration)}</strong>
                          <span>
                            #{pick.registration.entryNumber.toString().padStart(3, "0")} - {pick.judgePoints} judge pts
                            {pick.manualOverride ? " - Manual" : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">No judge picks recorded yet.</p>
                )}
              </section>

              {tally.judgeRanking.length ? (
                <section className="tally-section">
                  <div className="section-title">
                    <ClipboardList size={18} />
                    <strong>Judging Ranking</strong>
                  </div>
                  <div className="ranking-table">
                    {tally.judgeRanking.slice(0, 10).map((pick) => (
                      <button
                        type="button"
                        className="ranking-row winner-row"
                        key={`ranking-${pick.registration.id}`}
                        onClick={() => setSelectedWinner(pick.registration)}
                      >
                        <span>{pick.rank}</span>
                        <strong>{vehicleName(pick.registration)}</strong>
                        <b>{pick.judgePoints}</b>
                        <small>{pick.tieBreakSummary}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {selectedWinner ? <WinnerDrawer registration={selectedWinner} onClose={() => setSelectedWinner(null)} /> : null}
      {manualCategory ? (
        <ManualWinnersDrawer
          tally={manualCategory}
          saving={saving}
          onClose={() => setManualCategory(null)}
          onSave={(winners, reason) => saveManualWinners(manualCategory, winners, reason)}
        />
      ) : null}
      {showJudgingGuide ? <JudgingGuideDrawer onClose={() => setShowJudgingGuide(false)} /> : null}
    </section>
  );
}

function JudgingGuideDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="winner-drawer" aria-label="Judging ranking process">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Judging Rules</p>
            <h2>Ranking Process</h2>
          </div>
          <Button variant="icon" light onClick={onClose} aria-label="Close judging rules">
            <X size={20} />
          </Button>
        </div>

        <GuideSection
          title="Judge Ballots"
          items={[
            "Each judge ranks up to 10 vehicles in each category.",
            "Rank 1 is the strongest judge selection.",
            "Rank 10 is still counted, but carries the fewest points.",
          ]}
        />
        <GuideSection
          title="Point Scoring"
          items={[
            "1st place = 10 points.",
            "2nd place = 9 points.",
            "3rd place = 8 points.",
            "Scoring continues down to 10th place = 1 point.",
          ]}
        />
        <GuideSection
          title="Tie Breaks"
          items={[
            "Highest total judge points wins.",
            "If tied, the vehicle with more judge first-place rankings wins.",
            "If still tied, People's Choice top-10 tie-break points are used.",
            "If still tied, judge second-place counts are compared, then third-place counts, down through tenth.",
            "If still tied, an admin manually finalizes the category order.",
          ]}
        />
        <GuideSection
          title="People's Choice Tie-Break Points"
          items={[
            "People's Choice 1st place = 10 tie-break points.",
            "People's Choice 2nd place = 9 tie-break points.",
            "Scoring continues down to People's Choice 10th place = 1 tie-break point.",
            "People's Choice only affects judged awards when a judge-score tie needs to be broken.",
          ]}
        />
      </aside>
    </div>
  );
}

function GuideSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="guide-section">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ManualWinnersDrawer({
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

function WinnerDrawer({ registration, onClose }: { registration: Registration; onClose: () => void }) {
  const photos = registration.photos ?? [];

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="winner-drawer" aria-label="Winner vehicle details">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Winner Detail</p>
            <h2>{vehicleName(registration)}</h2>
          </div>
          <Button variant="icon" light onClick={onClose} aria-label="Close winner details">
            <X size={20} />
          </Button>
        </div>

        <div className="winner-photo-grid">
          {photos.length ? (
            photos.map((photo) => (
              <img key={photo.id} src={photo.url} alt={photo.altText ?? vehicleName(registration)} />
            ))
          ) : (
            <div className="photo-empty">No photos loaded.</div>
          )}
        </div>

        <div className="winner-detail-grid">
          <div>
            <span>Entry</span>
            <strong>#{registration.entryNumber.toString().padStart(3, "0")}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{registration.category.name}</strong>
          </div>
          <div>
            <span>Owner</span>
            <strong>
              {registration.owner.firstName} {registration.owner.lastName}
            </strong>
          </div>
          <div>
            <span>Phone</span>
            <strong>{registration.owner.phone}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{registration.owner.email ?? "Not provided"}</strong>
          </div>
          <div>
            <span>QR</span>
            <strong>{registration.qrCard?.visibleCode ?? "No QR assigned"}</strong>
          </div>
          <div>
            <span>Color</span>
            <strong>{registration.exteriorColor ?? "Not set"}</strong>
          </div>
          <div>
            <span>Plate</span>
            <strong>{registration.plateNumber ?? "Not set"}</strong>
          </div>
        </div>

        {registration.nickname ? <div className="drawer-note">{registration.nickname}</div> : null}
        {registration.internalNotes ? <div className="drawer-note muted">{registration.internalNotes}</div> : null}
      </aside>
    </div>
  );
}
