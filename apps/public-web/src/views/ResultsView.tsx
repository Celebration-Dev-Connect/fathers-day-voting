import { Alert, type PublishedResultEntry, type PublishedResultsSnapshot } from "@carshow/carshow-components";
import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublishedResults } from "../api";

export function ResultsView() {
  const [results, setResults] = useState<PublishedResultsSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getPublishedResults()
      .then(({ results }) => setResults(results))
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  if (error) return <div className="public-content"><Alert variant="danger">{error}</Alert></div>;
  if (!results) return <div className="public-content"><p className="muted-copy">Loading results…</p></div>;

  return (
    <div className="public-content public-results">
      <div className="public-results-hero">
        <Trophy size={34} />
        <p className="eyebrow">Father's Day Car Show</p>
        <h1 className="public-page-title">Voting Results</h1>
        <p>Congratulations to this year&apos;s winners.</p>
        <Link to="/browse" className="public-results-browse">Browse all vehicles</Link>
      </div>

      {results.categories.map((category) => (
        <section className="public-results-section" key={category.category.id}>
          <h2>{category.category.name}</h2>
          <div className="public-results-grid">
            {results.judgesVotingEnabled ? (
              <ResultList title="Official Judged Results" entries={category.official} scoreLabel="judge pts" />
            ) : null}
            <ResultList title="People's Choice" entries={category.peopleChoice} scoreLabel="votes" />
          </div>
        </section>
      ))}

      <section className="public-results-section">
        <h2>Special Awards</h2>
        <div className="public-results-grid">
          {results.specialAwards.map((award) => (
            <ResultList
              key={award.specialAward.id}
              title={award.specialAward.name}
              entries={award.results}
              scoreLabel="votes"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultList({
  title,
  entries,
  scoreLabel,
}: {
  title: string;
  entries: PublishedResultEntry[];
  scoreLabel: string;
}) {
  return (
    <article className="public-result-card">
      <h3>{title}</h3>
      {entries.length ? (
        <ol>
          {entries.map((entry) => (
            <li key={entry.vehicle.id}>
              <Link to={`/browse/entry/${entry.vehicle.entryNumber}`}>
                <span className="public-result-rank">{entry.rank}</span>
                <span>
                  <strong>{entry.vehicle.year} {entry.vehicle.make} {entry.vehicle.model}</strong>
                  <small>Entry #{entry.vehicle.entryNumber.toString().padStart(4, "0")}</small>
                </span>
                <b>{entry.votes ?? entry.judgePoints ?? 0} {scoreLabel}</b>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted-copy">No results recorded.</p>
      )}
    </article>
  );
}
