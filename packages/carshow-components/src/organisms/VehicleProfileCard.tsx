import { Camera } from "lucide-react";
import { Button } from "../atoms/Button.js";
import { VoteSuccess } from "../molecules/VoteSuccess.js";
import type { PublicVehicle } from "../types.js";
import { VehiclePhotoViewer } from "./VehiclePhotoViewer.js";

type Props = {
  vehicle: PublicVehicle;
  votingOpen?: boolean;
  cutoffPassed?: boolean;
  alreadyVoted?: boolean;
  onVote?: () => void;
  voting?: boolean;
  showVoting?: boolean;
  onUploadPhoto?: () => void;
};

export function VehicleProfileCard({
  vehicle,
  votingOpen = false,
  cutoffPassed = false,
  alreadyVoted = false,
  onVote,
  voting = false,
  showVoting = true,
  onUploadPhoto,
}: Props) {
  const photos = vehicle.photos;
  const showThumbStrip = photos.length > 1 || onUploadPhoto !== undefined;

  const title = vehicle.nickname
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model} — "${vehicle.nickname}"`
    : `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <article className="vehicle-profile">
      <VehiclePhotoViewer
        photos={photos}
        title={title}
        autoAdvance
        showThumbnails={showThumbStrip}
        uploadButton={onUploadPhoto && (
          <button
            className="vehicle-profile-thumb vehicle-profile-upload-btn"
            onClick={onUploadPhoto}
            aria-label="Add your photo"
            type="button"
          >
            <Camera size={22} />
          </button>
        )}
      />

      <div className="vehicle-profile-body">
        <div className="vehicle-profile-meta">
          <span className="vehicle-profile-category">{vehicle.category.name}</span>
          <span className="eyebrow">Entry #{vehicle.entryNumber}</span>
        </div>
        <h1 className="vehicle-profile-title">{title}</h1>
        {vehicle.ownerName ? <p className="muted-copy">{vehicle.ownerName}</p> : null}

        <div className="vehicle-profile-specs">
          <div className="vehicle-profile-spec">
            <span className="vehicle-profile-spec-label">Year</span>
            <span className="vehicle-profile-spec-value">{vehicle.year}</span>
          </div>
          <div className="vehicle-profile-spec">
            <span className="vehicle-profile-spec-label">Make</span>
            <span className="vehicle-profile-spec-value">{vehicle.make}</span>
          </div>
          <div className="vehicle-profile-spec">
            <span className="vehicle-profile-spec-label">Model</span>
            <span className="vehicle-profile-spec-value">{vehicle.model}</span>
          </div>
          {vehicle.exteriorColor ? (
            <div className="vehicle-profile-spec">
              <span className="vehicle-profile-spec-label">Color</span>
              <span className="vehicle-profile-spec-value">{vehicle.exteriorColor}</span>
            </div>
          ) : null}
        </div>

        {vehicle.buildStory ? (
          <section className="vehicle-profile-story">
            <p className="vehicle-profile-story-heading">About This Car</p>
            <p className="vehicle-profile-story-text">{vehicle.buildStory}</p>
          </section>
        ) : null}
      </div>

      {showVoting ? (
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
      ) : null}
    </article>
  );
}
