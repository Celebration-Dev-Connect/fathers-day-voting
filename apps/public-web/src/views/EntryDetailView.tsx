import { Alert, VehicleProfileCard } from "@carshow/carshow-components";
import type { PublishedVehiclePlacement, PublicVehicle } from "@carshow/carshow-components";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getEntryByNumber } from "../api";
import { EntrySearch } from "../components/EntrySearch";
import { PhotoUploadModal } from "../components/PhotoUploadModal";
import { useVoting } from "../context/VotingContext";

function VoteSection({ vehicle }: { vehicle: PublicVehicle }) {
  const { votingOpen, cutoffPassed, submitted, submitVoteDirect, openPanel } = useVoting();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!votingOpen || cutoffPassed) return null;

  const submittedPick = submitted[vehicle.category.id];
  const isThisCarSubmitted = submittedPick?.vehicleId === vehicle.id;

  async function handleVote() {
    setSubmitting(true);
    setError("");
    try {
      await submitVoteDirect({
        vehicleId: vehicle.id,
        entryNumber: vehicle.entryNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        nickname: vehicle.nickname,
        categoryId: vehicle.category.id,
        categoryName: vehicle.category.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="vote-section">
      <p className="vote-section-category">{vehicle.category.name}</p>

      {isThisCarSubmitted ? (
        <div className="vote-section-voted">
          <span className="vote-section-check">✓</span>
          <span>You voted for this car!</span>
          <button className="vote-section-open-btn" onClick={openPanel}>Change →</button>
        </div>
      ) : submittedPick ? (
        <button className="vote-section-change-btn" onClick={openPanel}>
          Already voted · Change
        </button>
      ) : (
        <>
          <button className="vote-section-pick-btn" onClick={handleVote} disabled={submitting}>
            {submitting ? "Submitting…" : "Vote for this car"}
          </button>
          {error && <p className="vote-section-other">{error}</p>}
        </>
      )}
    </div>
  );
}

function SpecialAwardVoteSections({ vehicle }: { vehicle: PublicVehicle }) {
  const {
    votingOpen,
    cutoffPassed,
    specialAwards,
    specialAwardSubmitted,
    submitSpecialAwardDirect,
    openPanel,
  } = useVoting();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!votingOpen || cutoffPassed || !specialAwards.length) return null;

  const votedCount = specialAwards.filter(
    (award) => specialAwardSubmitted[award.id]?.vehicleId === vehicle.id,
  ).length;

  async function handleVote(awardId: string, awardName: string) {
    setSubmitting(awardId);
    setErrors((prev) => { const n = { ...prev }; delete n[awardId]; return n; });
    try {
      await submitSpecialAwardDirect({
        vehicleId: vehicle.id,
        entryNumber: vehicle.entryNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        nickname: vehicle.nickname,
        specialAwardId: awardId,
        specialAwardName: awardName,
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [awardId]: err instanceof Error ? err.message : "Failed to submit",
      }));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="special-awards-table">
      <div className="special-awards-table-header">
        <div>
          <p className="special-awards-table-eyebrow">Special Awards</p>
          <p className="special-awards-table-subtitle">Nominate this car for any category</p>
        </div>
        {votedCount > 0 && (
          <span className="special-awards-table-count">
            {votedCount} vote{votedCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <ul className="special-awards-table-list">
        {specialAwards.map((award) => {
          const submittedPick = specialAwardSubmitted[award.id];
          const isThisCarSubmitted = submittedPick?.vehicleId === vehicle.id;
          const isOtherCarSubmitted = Boolean(submittedPick) && !isThisCarSubmitted;
          const isSubmitting = submitting === award.id;

          return (
            <li
              key={award.id}
              className={`special-awards-table-row${isThisCarSubmitted ? " voted" : ""}`}
            >
              <span className={`special-awards-table-indicator${isThisCarSubmitted ? " checked" : ""}`}>
                {isThisCarSubmitted && "✓"}
              </span>
              <span className="special-awards-table-name">
                {award.name}
              </span>
              {errors[award.id] && (
                <span className="special-awards-table-error">{errors[award.id]}</span>
              )}
              {isThisCarSubmitted ? (
                <button className="special-awards-table-btn voted" onClick={openPanel}>
                  Voted ✓
                </button>
              ) : isOtherCarSubmitted ? (
                <button className="special-awards-table-btn change" onClick={openPanel}>
                  Change vote
                </button>
              ) : (
                <button
                  className="special-awards-table-btn"
                  onClick={() => handleVote(award.id, award.name)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "…" : "Vote"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="special-awards-table-footer">
        You can vote for this car in multiple categories
      </p>
    </section>
  );
}

export function EntryDetailView() {
  const { publicPhotoUploadsOpen } = useVoting();
  const { entryNumber = "" } = useParams<{ entryNumber: string }>();
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null);
  const [placements, setPlacements] = useState<PublishedVehiclePlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const navigate = useNavigate();

  const loadEntry = useCallback((showLoading = false) => {
    const num = parseInt(entryNumber, 10);
    if (!num) return Promise.resolve();
    if (showLoading) setLoading(true);
    setError("");
    setNotFound(false);
    return getEntryByNumber(num)
      .then(({ vehicle, placements = [] }) => {
        setVehicle(vehicle);
        setPlacements(placements);
      })
      .catch((err: Error) => {
        if (err.message.toLowerCase().includes("not found")) {
          setNotFound(true);
        } else {
          setError(err.message);
        }
      })
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }, [entryNumber]);

  useEffect(() => {
    void loadEntry(true);
  }, [loadEntry]);

  if (loading) {
    return (
      <div className="public-content">
        <p className="muted-copy">Loading…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="public-content">
        <div className="not-found-card">
          <p className="not-found-icon">🔍</p>
          <h1 className="not-found-title">Entry Not Found</h1>
          <p className="not-found-body">
            We couldn't find an entry with number <strong>#{entryNumber}</strong>.
            Double-check the number on the vehicle's card — it's a 4-digit number
            printed in large text (e.g. <strong>1001</strong>, <strong>1042</strong>).
          </p>
          <div className="not-found-search">
            <p className="not-found-search-label">Try another entry number:</p>
            <EntrySearch onSearch={(num) => navigate(`/browse/entry/${num}`)} />
          </div>
          <Link to="/browse" className="not-found-browse-link">← Back to Browse</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-content">
        <Alert variant="danger">{error}</Alert>
        <Link to="/browse" className="back-link">← Back to browse</Link>
      </div>
    );
  }

  if (!vehicle) return null;

  const vehicleTitle = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <div className="public-content">
      <Link to="/browse" className="back-link">← Back to browse</Link>
      <VehicleProfileCard
        vehicle={vehicle}
        showVoting={false}
        onUploadPhoto={publicPhotoUploadsOpen ? () => setUploadOpen(true) : undefined}
      />
      {placements.length ? (
        <section className="published-placements">
          <p className="eyebrow">Published Results</p>
          <h2>Awards &amp; Placements</h2>
          <div className="published-placement-list">
            {placements.map((placement) => (
              <div key={`${placement.kind}-${placement.label}`}>
                <strong>#{placement.rank}</strong>
                <span>
                  {placement.kind === "OFFICIAL"
                    ? `${placement.label} - Official Judged Results`
                    : placement.kind === "PEOPLE_CHOICE"
                      ? `${placement.label} - People's Choice`
                      : placement.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <VoteSection vehicle={vehicle} />
      <SpecialAwardVoteSections vehicle={vehicle} />
      {uploadOpen && (
        <PhotoUploadModal
          vehicleId={vehicle.id}
          vehicleTitle={vehicleTitle}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </div>
  );
}
