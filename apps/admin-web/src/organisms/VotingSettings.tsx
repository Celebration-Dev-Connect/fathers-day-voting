import { ClipboardList, RefreshCw } from "lucide-react";
import {
  Alert,
  Button,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
  type CategoryVotingTally,
  type JudgeCategoryCompletion,
  type Registration,
  type StaffUser,
  type SpecialAwardVotingTally,
  type VotingSettings as VotingSettingsType,
} from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import {
  getJudgeCompletion,
  getVotingSettings,
  getVotingTallies,
  initializeEvent,
  publishVotingResults,
  unpublishVotingResults,
  updateCategoryWinners,
  updateVotingSettings,
} from "../api";
import { EventStatusBanner } from "./voting/EventStatusBanner";
import { JudgeCompletionPanel } from "./voting/JudgeCompletionPanel";
import { JudgingGuideDrawer } from "./voting/JudgingGuideDrawer";
import { ManualWinnersDrawer } from "./voting/ManualWinnersDrawer";
import { TallyGrid } from "./voting/TallyGrid";
import { VotingControls } from "./voting/VotingControls";
import { WinnerDrawer } from "./voting/WinnerDrawer";

const ceremonyRefreshChannelName = "carshow-ceremony-refresh";
const ceremonyRefreshStorageKey = "carshow:ceremony-refresh";

export function VotingSettings({ staff }: { staff: StaffUser }) {
  const [settings, setSettings] = useState<VotingSettingsType | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [tallies, setTallies] = useState<CategoryVotingTally[]>([]);
  const [specialAwards, setSpecialAwards] = useState<SpecialAwardVotingTally[]>([]);
  const [judgeCompletion, setJudgeCompletion] = useState<JudgeCategoryCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [eventMissing, setEventMissing] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<Registration | null>(null);
  const [manualCategory, setManualCategory] = useState<CategoryVotingTally | null>(null);
  const [showJudgingGuide, setShowJudgingGuide] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const canManage = staff.role === "ADMIN";

  async function refreshVoting() {
    setLoading(true);
    setError("");
    setEventMissing(false);
    try {
      const [settingsResult, tallyResult, completionResult] = await Promise.all([
        getVotingSettings(),
        getVotingTallies(),
        getJudgeCompletion(),
      ]);
      setSettings(settingsResult.event);
      setCutoff(toDateTimeLocalValue(settingsResult.event.peopleChoiceCutoff));
      setTallies(tallyResult.categories);
      setSpecialAwards(tallyResult.specialAwards);
      setJudgeCompletion(completionResult.categories);
    } catch (loadError) {
      const msg = loadError instanceof Error ? loadError.message : "";
      if (msg.toLowerCase().includes("event not found")) {
        setEventMissing(true);
      } else {
        setError(msg || "Could not load voting results");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleInitializeEvent() {
    setSaving(true);
    setError("");
    try {
      const result = await initializeEvent();
      setSettings(result.event);
      setCutoff(toDateTimeLocalValue(result.event.peopleChoiceCutoff));
      setEventMissing(false);
      await refreshVoting();
      setMessage("Event created. You can now configure voting settings.");
    } catch (initError) {
      setError(initError instanceof Error ? initError.message : "Could not create event");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void refreshVoting();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await updateVotingSettings({
        registrationOpen: settings.registrationOpen,
        votingOpen: settings.votingOpen,
        judgesVotingEnabled: settings.judgesVotingEnabled,
        judgingOpen: settings.judgingOpen,
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

  function updateSetting<
    Key extends keyof Pick<
      VotingSettingsType,
      "registrationOpen" | "votingOpen" | "judgesVotingEnabled" | "judgingOpen"
    >,
  >(key: Key, value: VotingSettingsType[Key]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function publishResults() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await publishVotingResults();
      setSettings(result.event);
      await refreshVoting();
      notifyCeremonyRefresh();
      setMessage(result.event.resultsPublished ? "Results published to the public site." : "Results updated.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Could not publish results");
    } finally {
      setSaving(false);
    }
  }

  async function unpublishResults() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await unpublishVotingResults();
      setSettings(result.event);
      await refreshVoting();
      setMessage("Results hidden from the public site.");
    } catch (unpublishError) {
      setError(unpublishError instanceof Error ? unpublishError.message : "Could not unpublish results");
    } finally {
      setSaving(false);
    }
  }

  const publishDisabledReason = !settings?.peopleChoiceCutoff
    ? "Set a voting cutoff before publishing."
    : now < new Date(settings.peopleChoiceCutoff).getTime()
      ? "Results can be published after the voting cutoff."
      : settings.judgesVotingEnabled && settings.judgingOpen
        ? "Close judging before publishing results."
        : "";

  const ceremonyDisabledReason = !settings?.peopleChoiceCutoff
    ? "Set a voting cutoff before opening the ceremony page."
    : now < new Date(settings.peopleChoiceCutoff).getTime()
      ? "Ceremony page opens after the voting cutoff."
      : "";

  function openCeremonyPage() {
    const basePath = window.location.pathname.startsWith("/admin") ? "/admin" : "";
    window.open(`${window.location.origin}${basePath}/ceremony`, "_blank", "noopener,noreferrer");
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

      {eventMissing ? (
        <div className="empty-state">
          <p>No event record found. Create the event to enable registration and voting.</p>
          {canManage ? (
            <Button onClick={handleInitializeEvent} disabled={saving}>
              {saving ? "Creating…" : "Create Event"}
            </Button>
          ) : (
            <p className="muted-copy">Ask an admin to initialize the event.</p>
          )}
        </div>
      ) : null}

      {settings ? <EventStatusBanner settings={settings} /> : null}

      <VotingControls
        settings={settings}
        cutoff={cutoff}
        canManage={canManage}
        saving={saving}
        onCutoffChange={setCutoff}
        onSettingChange={updateSetting}
        onSave={saveSettings}
        onPublish={publishResults}
        onUnpublish={unpublishResults}
        onOpenCeremony={openCeremonyPage}
        publishDisabledReason={publishDisabledReason}
        ceremonyDisabledReason={ceremonyDisabledReason}
      />

      {!loading && settings?.judgesVotingEnabled ? <JudgeCompletionPanel categories={judgeCompletion} /> : null}

      {loading ? <div className="empty-state">Loading voting tallies...</div> : null}
      {!loading ? (
        <SpecialAwardsResults specialAwards={specialAwards} onSelectWinner={setSelectedWinner} />
      ) : null}
      {!loading ? (
        <TallyGrid
          tallies={tallies}
          judgesVotingEnabled={settings?.judgesVotingEnabled ?? true}
          canManage={canManage}
          onSelectWinner={setSelectedWinner}
          onFinalizeWinners={setManualCategory}
        />
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

function notifyCeremonyRefresh() {
  const payload = Date.now().toString();
  window.localStorage.setItem(ceremonyRefreshStorageKey, payload);
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(ceremonyRefreshChannelName);
    channel.postMessage({ type: "refresh", payload });
    channel.close();
  }
}

function SpecialAwardsResults({
  specialAwards,
  onSelectWinner,
}: {
  specialAwards: SpecialAwardVotingTally[];
  onSelectWinner: (registration: Registration) => void;
}) {
  if (!specialAwards.length) return null;

  return (
    <section className="special-awards-results">
      <div className="tally-card-header">
        <div>
          <p className="eyebrow">Event-Wide Ballot</p>
          <h2>Special Awards</h2>
        </div>
      </div>
      <div className="tally-grid">
        {specialAwards.map((award) => (
          <article className="tally-card" key={award.specialAward.id}>
            <div className="tally-card-header">
              <div>
                <p className="eyebrow">{award.specialAward.active ? "Active" : "Inactive"}</p>
                <h2>{award.specialAward.name}</h2>
              </div>
            </div>
            {award.specialAward.description ? (
              <p className="muted-copy">{award.specialAward.description}</p>
            ) : null}
            {award.results.length ? (
              <div className="rank-list">
                {award.results.slice(0, 10).map((item) => (
                  <button
                    type="button"
                    className="rank-row winner-row"
                    key={item.registration.id}
                    onClick={() => onSelectWinner(item.registration)}
                  >
                    <span className="rank-badge">{item.rank}</span>
                    <div>
                      <strong>
                        {item.registration.year} {item.registration.make} {item.registration.model}
                      </strong>
                      <span>
                        #{item.registration.entryNumber.toString().padStart(3, "0")} - {item.votes} votes
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted-copy">No special award votes yet.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
