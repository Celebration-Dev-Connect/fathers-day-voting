import { X } from "lucide-react";
import { Button } from "@carshow/carshow-components";

export function JudgingGuideDrawer({ onClose }: { onClose: () => void }) {
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

