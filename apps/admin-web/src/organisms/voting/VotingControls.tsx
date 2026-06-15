import { CalendarClock, Gavel, Save, Send, EyeOff, Trophy } from "lucide-react";
import {
  Button,
  formatDateTime,
  type VotingSettings as VotingSettingsType,
} from "@carshow/carshow-components";

type EventControlKey =
  | "registrationOpen"
  | "votingOpen"
  | "judgesVotingEnabled"
  | "judgingOpen";

export function VotingControls({
  settings,
  cutoff,
  canManage,
  saving,
  onCutoffChange,
  onSettingChange,
  onSave,
  onPublish,
  onUnpublish,
  publishDisabledReason,
}: {
  settings: VotingSettingsType | null;
  cutoff: string;
  canManage: boolean;
  saving: boolean;
  onCutoffChange: (value: string) => void;
  onSettingChange: <Key extends EventControlKey>(key: Key, value: VotingSettingsType[Key]) => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  publishDisabledReason: string;
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
          checked={settings?.judgesVotingEnabled ?? false}
          disabled={!canManage || !settings}
          onChange={(event) => onSettingChange("judgesVotingEnabled", event.target.checked)}
        />
        <Gavel size={18} />
        Use judge voting in results
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings?.judgingOpen ?? false}
          disabled={!canManage || !settings || !settings.judgesVotingEnabled}
          onChange={(event) => onSettingChange("judgingOpen", event.target.checked)}
        />
        <Gavel size={18} />
        Judging open
      </label>
      <Button onClick={onSave} disabled={!canManage || saving || !settings}>
        <Save size={20} />
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button
        variant="secondary"
        onClick={onPublish}
        disabled={!canManage || saving || !settings || Boolean(publishDisabledReason)}
      >
        <Send size={20} />
        {settings?.resultsPublished ? "Republish Results" : "Publish Results"}
      </Button>
      {settings?.resultsPublished ? (
        <Button
          variant="secondary"
          onClick={onUnpublish}
          disabled={!canManage || saving}
        >
          <EyeOff size={20} />
          Unpublish Results
        </Button>
      ) : null}
      {canManage && publishDisabledReason ? <span className="muted-copy">{publishDisabledReason}</span> : null}
    </div>
  );
}
