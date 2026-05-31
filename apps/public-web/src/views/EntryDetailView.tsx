import { Alert, VehicleProfileCard } from "@carshow/carshow-components";
import type { PublicVehicle } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getEntryByNumber } from "../api";
import { EntrySearch } from "../components/EntrySearch";
import { useVoting } from "../context/VotingContext";

function VoteSection({ vehicle }: { vehicle: PublicVehicle }) {
  const { votingOpen, cutoffPassed, drafts, submitted, select, openPanel } = useVoting();

  if (!votingOpen || cutoffPassed) return null;

  const categoryId = vehicle.category.id;
  const draft = drafts[categoryId];
  const submittedPick = submitted[categoryId];
  const isThisCategorySubmitted = Boolean(submittedPick);
  const isThisCarDraft = draft?.vehicleId === vehicle.id;
  const isThisCarSubmitted = submittedPick?.vehicleId === vehicle.id;

  function handleSelect() {
    select({
      vehicleId: vehicle.id,
      entryNumber: vehicle.entryNumber,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      nickname: vehicle.nickname,
      categoryId: vehicle.category.id,
      categoryName: vehicle.category.name,
    });
    openPanel();
  }

  return (
    <div className="vote-section">
      <p className="vote-section-category">{vehicle.category.name}</p>

      {isThisCarSubmitted ? (
        <div className="vote-section-voted">
          <span className="vote-section-check">✓</span>
          <span>You voted for this car!</span>
        </div>
      ) : isThisCategorySubmitted ? (
        <p className="vote-section-other">
          You already voted in the {vehicle.category.name} category for a different car.
        </p>
      ) : isThisCarDraft ? (
        <div className="vote-section-selected">
          <span className="vote-section-selected-label">✓ Your current pick</span>
          <button className="vote-section-open-btn" onClick={openPanel}>
            Open Ballot →
          </button>
        </div>
      ) : (
        <button className="vote-section-pick-btn" onClick={handleSelect}>
          Vote for this car
        </button>
      )}
    </div>
  );
}

export function EntryDetailView() {
  const { entryNumber = "" } = useParams<{ entryNumber: string }>();
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const num = parseInt(entryNumber, 10);
    if (!num) return;
    setLoading(true);
    setError("");
    setNotFound(false);
    getEntryByNumber(num)
      .then(({ vehicle }) => setVehicle(vehicle))
      .catch((err: Error) => {
        if (err.message.toLowerCase().includes("not found")) {
          setNotFound(true);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [entryNumber]);

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
        <button className="back-link" onClick={() => navigate(-1)}>← Back</button>
      </div>
    );
  }

  if (!vehicle) return null;

  return (
    <div className="public-content">
      <button className="back-link" onClick={() => navigate(-1)}>← Back</button>
      <VehicleProfileCard vehicle={vehicle} showVoting={false} />
      <VoteSection vehicle={vehicle} />
    </div>
  );
}
