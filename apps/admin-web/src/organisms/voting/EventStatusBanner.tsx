import { Eye, Gavel, Lock, Unlock } from "lucide-react";
import type { VotingSettings } from "@carshow/carshow-components";

export function EventStatusBanner({ settings }: { settings: VotingSettings }) {
  const phase = getEventPhase(settings);

  return (
    <div className={`event-status-banner ${phase.tone}`}>
      <div>
        <p className="eyebrow">Event Status</p>
        <h2>{phase.label}</h2>
        <span>{phase.description}</span>
      </div>
      <div className="event-status-flags" aria-label="Current event controls">
        <StatusFlag active={settings.registrationOpen} activeLabel="Registration open" inactiveLabel="Registration closed" />
        <StatusFlag active={settings.votingOpen} activeLabel="People's choice open" inactiveLabel="People's choice closed" />
        <StatusFlag active={settings.publicPhotoUploadsOpen} activeLabel="Public photos open" inactiveLabel="Public photos closed" />
        <StatusFlag
          active={settings.judgesVotingEnabled}
          activeLabel="Judge voting enabled"
          inactiveLabel="Judge voting disabled"
          icon="judge"
        />
        <StatusFlag active={settings.judgingOpen} activeLabel="Judging open" inactiveLabel="Judging closed" icon="judge" />
        <StatusFlag active={settings.resultsPublished} activeLabel="Results published" inactiveLabel="Results hidden" icon="results" />
      </div>
    </div>
  );
}

function StatusFlag({
  active,
  activeLabel,
  inactiveLabel,
  icon,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  icon?: "judge" | "results";
}) {
  const Icon = icon === "judge" ? Gavel : icon === "results" ? Eye : active ? Unlock : Lock;

  return (
    <span className={active ? "active" : ""}>
      <Icon size={16} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function getEventPhase(settings: VotingSettings) {
  if (settings.resultsPublished) {
    return {
      label: "Results Published",
      description: "Public results are visible. Keep registration and judging closed unless you need an admin correction.",
      tone: "published",
    };
  }

  if (settings.judgesVotingEnabled && settings.judgingOpen) {
    return {
      label: "Judging In Progress",
      description: "Judges can submit rankings. Results remain hidden until published.",
      tone: "judging",
    };
  }

  if (settings.registrationOpen || settings.votingOpen) {
    return {
      label: "Event Intake Open",
      description: "Registration or People's Choice voting is still open.",
      tone: "open",
    };
  }

  return {
    label: "Event Locked",
    description: "Registration, voting, and judging are closed. Results are not published.",
    tone: "locked",
  };
}
