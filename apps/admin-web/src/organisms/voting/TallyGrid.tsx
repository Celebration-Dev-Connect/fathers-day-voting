import { ClipboardList, Clock, Trophy } from "lucide-react";
import { Button, vehicleName, type CategoryVotingTally, type Registration } from "@carshow/carshow-components";

export function TallyGrid({
  tallies,
  judgesVotingEnabled,
  canManage,
  onSelectWinner,
  onFinalizeWinners,
}: {
  tallies: CategoryVotingTally[];
  judgesVotingEnabled: boolean;
  canManage: boolean;
  onSelectWinner: (registration: Registration) => void;
  onFinalizeWinners: (tally: CategoryVotingTally) => void;
}) {
  return (
    <div className="tally-grid">
      {tallies.map((tally) => (
        <article className="tally-card" key={tally.category.id}>
          <div className="tally-card-header">
            <div>
              <p className="eyebrow">Category</p>
              <h2>{tally.category.name}</h2>
            </div>
          </div>

          <PeopleChoiceSection tally={tally} onSelectWinner={onSelectWinner} />
          {judgesVotingEnabled ? (
            <>
              <JudgeTop3Section
                tally={tally}
                canManage={canManage}
                onSelectWinner={onSelectWinner}
                onFinalizeWinners={onFinalizeWinners}
              />
              <JudgingRankingSection tally={tally} onSelectWinner={onSelectWinner} />
            </>
          ) : (
            <p className="muted-copy">Judge voting is disabled. Results use People's Choice votes only.</p>
          )}
        </article>
      ))}
    </div>
  );
}

function PeopleChoiceSection({
  tally,
  onSelectWinner,
}: {
  tally: CategoryVotingTally;
  onSelectWinner: (registration: Registration) => void;
}) {
  return (
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
              onClick={() => onSelectWinner(item.registration)}
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
  );
}

function JudgeTop3Section({
  tally,
  canManage,
  onSelectWinner,
  onFinalizeWinners,
}: {
  tally: CategoryVotingTally;
  canManage: boolean;
  onSelectWinner: (registration: Registration) => void;
  onFinalizeWinners: (tally: CategoryVotingTally) => void;
}) {
  return (
    <section className="tally-section">
      <div className="section-title">
        <Clock size={18} />
        <strong>Judge Top 3</strong>
      </div>
      {canManage && tally.judgeRanking.length >= 3 ? (
        <Button variant="secondary" onClick={() => onFinalizeWinners(tally)}>
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
              onClick={() => onSelectWinner(pick.registration)}
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
  );
}

function JudgingRankingSection({
  tally,
  onSelectWinner,
}: {
  tally: CategoryVotingTally;
  onSelectWinner: (registration: Registration) => void;
}) {
  if (!tally.judgeRanking.length) return null;

  return (
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
            onClick={() => onSelectWinner(pick.registration)}
          >
            <span>{pick.rank}</span>
            <strong>{vehicleName(pick.registration)}</strong>
            <b>{pick.judgePoints}</b>
            <small>{pick.tieBreakSummary}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
