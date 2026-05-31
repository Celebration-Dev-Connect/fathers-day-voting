import { useState } from "react";
import { Button } from "../atoms/Button.js";
import { VoteSuccess } from "../molecules/VoteSuccess.js";
import type { PublicVehicle } from "../types.js";

type Props = {
  vehicle: PublicVehicle;
  votingOpen: boolean;
  cutoffPassed: boolean;
  alreadyVoted: boolean;
  onVote: () => void;
  voting: boolean;
};

export function VehicleProfileCard({ vehicle, votingOpen, cutoffPassed, alreadyVoted, onVote, voting }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = vehicle.photos;
  const currentPhoto = photos[photoIndex];

  const title = vehicle.nickname
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model} — "${vehicle.nickname}"`
    : `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <article className="vehicle-profile">
      {photos.length > 0 ? (
        <div className="vehicle-profile-photos">
          <img
            className="vehicle-profile-main-photo"
            src={currentPhoto.url}
            alt={currentPhoto.altText ?? title}
          />
          {photos.length > 1 ? (
            <div className="vehicle-profile-thumbs">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  className={`vehicle-profile-thumb${i === photoIndex ? " active" : ""}`}
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Photo ${i + 1}`}
                >
                  <img src={p.url} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="vehicle-profile-no-photo" />
      )}

      <div className="vehicle-profile-body">
        <div className="vehicle-profile-meta">
          <span className="vehicle-profile-category">{vehicle.category.name}</span>
          <span className="eyebrow">Entry #{vehicle.entryNumber}</span>
        </div>
        <h1 className="vehicle-profile-title">{title}</h1>
        {vehicle.ownerName ? <p className="muted-copy">{vehicle.ownerName}</p> : null}
        {vehicle.exteriorColor ? <p className="muted-copy">{vehicle.exteriorColor}</p> : null}
      </div>

      <div className="vehicle-profile-vote">
        {alreadyVoted ? (
          <VoteSuccess categoryName={vehicle.category.name} />
        ) : !votingOpen || cutoffPassed ? (
          <p className="muted-copy vote-closed-msg">Voting is not currently open.</p>
        ) : (
          <Button variant="primary" disabled={voting} onClick={onVote}>
            {voting ? "Submitting…" : `Vote for this ${vehicle.category.name}`}
          </Button>
        )}
      </div>
    </article>
  );
}
