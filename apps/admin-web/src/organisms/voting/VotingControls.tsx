import { CalendarClock, CheckCircle2, Gavel, Save, Trophy } from "lucide-react";
import {
  Button,
  formatDateTime,
  type VotingSettings as VotingSettingsType,
} from "@carshow/carshow-components";

type EventControlKey = "registrationOpen" | "votingOpen" | "judgingOpen" | "resultsPublished";

export function VotingControls({
  settings,
  cutoff,
  canManage,
  saving,
  onCutoffChange,
  onSettingChange,
  onSave,
}: {
  settings: VotingSettingsType | null;
  cutoff: string;
  canManage: boolean;
  saving: boolean;
  onCutoffChange: (value: string) => void;
  onSettingChange: <Key extends EventControlKey>(key: Key, value: VotingSettingsType[Key]) => void;
  onSave: () => void;
}) {
  return (
    <div className="voting-settings">
      <div>
        <p className="eyebrow">Event Controls</p>
        <h2>{settings?.resultsPublished ? "Results Live" : "Results Hidden"}</h2>
        <span>People's Choice cutoff: {formatDateTime(settings?.peopleChoiceCutoff)}</span>
      </div>
      <label className="control-field">
        <CalendarClock size={18} />
        <span>Cutoff time</span>
        <input
          type="datetime-local"
          value={cutoff}
          disabled={!canManage || !settings}
          onChange={(event) => onCutoffChange(event.target.value)}
        />
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings?.registrationOpen ?? false}
          disabled={!canManage || !settings}
          onChange={(event) => onSettingChange("registrationOpen", event.target.checked)}
        />
        Registration open
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings?.votingOpen ?? false}
          disabled={!canManage || !settings}
          onChange={(event) => onSettingChange("votingOpen", event.target.checked)}
        />
        <Trophy size={18} />
        People's choice open
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings?.judgingOpen ?? false}
          disabled={!canManage || !settings}
          onChange={(event) => onSettingChange("judgingOpen", event.target.checked)}
        />
        <Gavel size={18} />
        Judging open
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings?.resultsPublished ?? false}
          disabled={!canManage || !settings}
          onChange={(event) => onSettingChange("resultsPublished", event.target.checked)}
        />
        <CheckCircle2 size={18} />
        Results published
      </label>
      <Button onClick={onSave} disabled={!canManage || saving || !settings}>
        <Save size={20} />
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
