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
  type VotingSettings as VotingSettingsType,
} from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import {
  getJudgeCompletion,
  getVotingSettings,
  getVotingTallies,
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

export function VotingSettings({ staff }: { staff: StaffUser }) {
  const [settings, setSettings] = useState<VotingSettingsType | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [tallies, setTallies] = useState<CategoryVotingTally[]>([]);
  const [judgeCompletion, setJudgeCompletion] = useState<JudgeCategoryCompletion[]>([]);
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
      const [settingsResult, tallyResult, completionResult] = await Promise.all([
        getVotingSettings(),
        getVotingTallies(),
        getJudgeCompletion(),
      ]);
      setSettings(settingsResult.event);
      setCutoff(toDateTimeLocalValue(settingsResult.event.peopleChoiceCutoff));
      setTallies(tallyResult.categories);
      setJudgeCompletion(completionResult.categories);
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
        registrationOpen: settings.registrationOpen,
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

  function updateSetting<
    Key extends keyof Pick<VotingSettingsType, "registrationOpen" | "votingOpen" | "judgingOpen" | "resultsPublished">,
  >(key: Key, value: VotingSettingsType[Key]) {
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
      {settings ? <EventStatusBanner settings={settings} /> : null}

      <VotingControls
        settings={settings}
        cutoff={cutoff}
        canManage={canManage}
        saving={saving}
        onCutoffChange={setCutoff}
        onSettingChange={updateSetting}
        onSave={saveSettings}
      />

      {!loading ? <JudgeCompletionPanel categories={judgeCompletion} /> : null}

      {loading ? <div className="empty-state">Loading voting tallies...</div> : null}
      {!loading ? (
        <TallyGrid
          tallies={tallies}
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
