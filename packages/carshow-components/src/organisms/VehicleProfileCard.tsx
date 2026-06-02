import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "../atoms/Button.js";
import { VoteSuccess } from "../molecules/VoteSuccess.js";
import type { PublicVehicle } from "../types.js";

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
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const photos = vehicle.photos;
  const currentPhoto = photos[photoIndex];
  const currentLoaded = loadedIds.has(currentPhoto?.id ?? "");
  const showThumbStrip = photos.length > 1 || onUploadPhoto !== undefined;

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setPhotoIndex((i) => (i + 1) % photos.length), 5000);
    return () => clearInterval(id);
  }, [photos.length]);

  function markLoaded(id: string) {
    setLoadedIds((prev) => new Set([...prev, id]));
  }

  const title = vehicle.nickname
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model} — "${vehicle.nickname}"`
    : `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <article className="vehicle-profile">
      <div className="vehicle-profile-photos">
        {photos.length > 0 && currentPhoto ? (
          <div className="vehicle-profile-photo-wrap">
            {!currentLoaded && <div className="img-shimmer" aria-hidden="true" />}
            <img
              key={currentPhoto.id}
              className="vehicle-profile-main-photo"
              src={currentPhoto.url}
              alt={currentPhoto.altText ?? title}
              style={{ opacity: currentLoaded ? 1 : 0, transition: "opacity 0.3s ease" }}
              onLoad={() => markLoaded(currentPhoto.id)}
            />
          </div>
        ) : (
          <div className="vehicle-profile-no-photo" />
        )}
        {showThumbStrip && (
          <div className="vehicle-profile-thumbs">
            {photos.map((p, i) => (
              <button
                key={p.id}
                className={`vehicle-profile-thumb${i === photoIndex ? " active" : ""}`}
                onClick={() => setPhotoIndex(i)}
                aria-label={`Photo ${i + 1}`}
              >
                {!loadedIds.has(p.id) && <div className="img-shimmer" aria-hidden="true" />}
                <img
                  src={p.thumbUrl ?? p.url}
                  alt=""
                  style={{ opacity: loadedIds.has(p.id) ? 1 : 0, transition: "opacity 0.25s ease" }}
                  onLoad={() => markLoaded(p.id)}
                />
              </button>
            ))}
            {onUploadPhoto && (
              <button
                className="vehicle-profile-thumb vehicle-profile-upload-btn"
                onClick={onUploadPhoto}
                aria-label="Add your photo"
                type="button"
              >
                <Camera size={22} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="vehicle-profile-body">
        <div className="vehicle-profile-meta">
          <span className="vehicle-profile-category">{vehicle.category.name}</span>
          <span className="eyebrow">Entry #{vehicle.entryNumber}</span>
        </div>
        <h1 className="vehicle-profile-title">{title}</h1>
        {vehicle.ownerName ? <p className="muted-copy">{vehicle.ownerName}</p> : null}
        {vehicle.exteriorColor ? <p className="muted-copy">{vehicle.exteriorColor}</p> : null}
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
