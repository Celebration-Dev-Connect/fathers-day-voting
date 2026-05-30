import { Clock, Trophy } from "lucide-react";
import { Badge } from "../atoms/Badge.js";
import type { CategoryVotingTally } from "../types.js";
import { vehicleName } from "../utils.js";

export function TallyCard({ tally }: { tally: CategoryVotingTally }) {
  return (
    <article className="tally-card">
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
              <div className="rank-row" key={item.registration.id}>
                <Badge variant="rank">{index + 1}</Badge>
                <div>
                  <strong>{vehicleName(item.registration)}</strong>
                  <span>
                    #{item.registration.entryNumber.toString().padStart(3, "0")} — {item.votes} votes
                  </span>
                </div>
              </div>
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
        {tally.judgeTop3.length ? (
          <div className="rank-list">
            {tally.judgeTop3.map((pick) => (
              <div className="rank-row" key={pick.registration.id}>
                <Badge variant="rank">{pick.rank}</Badge>
                <div>
                  <strong>{vehicleName(pick.registration)}</strong>
                  <span>
                    #{pick.registration.entryNumber.toString().padStart(3, "0")} - {pick.judgePoints} judge pts
                    {pick.manualOverride ? " - Manual" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No judge picks recorded yet.</p>
        )}
      </section>
    </article>
  );
}
