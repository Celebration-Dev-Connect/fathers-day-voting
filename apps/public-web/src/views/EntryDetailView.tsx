import { Alert, VehicleProfileCard } from "@carshow/carshow-components";
import type { PublicVehicle } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getEntryByNumber } from "../api";
import { EntrySearch } from "../components/EntrySearch";
import { PhotoUploadModal } from "../components/PhotoUploadModal";
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

function SpecialAwardVoteSections({ vehicle }: { vehicle: PublicVehicle }) {
  const {
    votingOpen,
    cutoffPassed,
    specialAwards,
    specialAwardDrafts,
    specialAwardSubmitted,
    selectSpecialAward,
    openPanel,
  } = useVoting();

  if (!votingOpen || cutoffPassed || !specialAwards.length) return null;

  return (
    <section className="special-award-vote-sections">
      <p className="eyebrow">Special Awards</p>
      {specialAwards.map((award) => {
        const draft = specialAwardDrafts[award.id];
        const submittedPick = specialAwardSubmitted[award.id];
        const isThisCarDraft = draft?.vehicleId === vehicle.id;
        const isThisCarSubmitted = submittedPick?.vehicleId === vehicle.id;

        function handleSelect() {
          selectSpecialAward({
            vehicleId: vehicle.id,
            entryNumber: vehicle.entryNumber,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            nickname: vehicle.nickname,
            specialAwardId: award.id,
            specialAwardName: award.name,
          });
          openPanel();
        }

        return (
          <div className="vote-section special-award-vote-section" key={award.id}>
            <div>
              <p className="vote-section-category">{award.name}</p>
              {award.description ? <p className="special-award-description">{award.description}</p> : null}
            </div>
            {isThisCarSubmitted ? (
              <div className="vote-section-voted">
                <span className="vote-section-check">✓</span>
                <span>You voted for this car!</span>
              </div>
            ) : submittedPick ? (
              <p className="vote-section-other">You already voted for a different car.</p>
            ) : isThisCarDraft ? (
              <div className="vote-section-selected">
                <span className="vote-section-selected-label">✓ Your current pick</span>
                <button className="vote-section-open-btn" onClick={openPanel}>
                  Open Ballot →
                </button>
              </div>
            ) : (
              <button className="vote-section-pick-btn" onClick={handleSelect}>
                Vote for {award.name}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function EntryDetailView() {
  const { entryNumber = "" } = useParams<{ entryNumber: string }>();
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
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
        onUploadPhoto={() => setUploadOpen(true)}
      />
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
