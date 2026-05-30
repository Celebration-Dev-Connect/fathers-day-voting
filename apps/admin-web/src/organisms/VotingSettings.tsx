import { RefreshCw, Save } from "lucide-react";
import { Alert, Button, TallyCard, formatDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from "@carshow/carshow-components";
import type { CategoryVotingTally, StaffUser, VotingSettings as VotingSettingsType } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { getVotingSettings, getVotingTallies, updateVotingSettings } from "../api";

export function VotingSettings({ staff }: { staff: StaffUser }) {
  const [settings, setSettings] = useState<VotingSettingsType | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [tallies, setTallies] = useState<CategoryVotingTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Voting Control</p>
          <h1>People's Choice &amp; Judging</h1>
        </div>
        <Button variant="secondary" onClick={refreshVoting} disabled={loading}>
          <RefreshCw size={20} />
          Refresh
        </Button>
      </div>

      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {!canManage ? (
        <Alert>Registrar accounts can view voting tallies but cannot edit settings.</Alert>
      ) : null}

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
            <TallyCard key={tally.category.id} tally={tally} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
