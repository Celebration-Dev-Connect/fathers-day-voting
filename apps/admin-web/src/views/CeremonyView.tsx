import type { CeremonyData, CeremonyPhotoSlide, CeremonyWinnerSlide, PublicPhoto } from "@carshow/carshow-components";
import { useCallback, useEffect, useState } from "react";
import { getCeremonyData } from "../api";
import logoHero from "../../../../packages/carshow-components/src/assets/fathers-day-car-show-logo.png";

const PRE_PUBLISH_PHOTO_MS = 5_000;
const HERO_PHOTO_MS = 10_000;
const SECONDARY_PHOTO_MS = 5_000;
const REFRESH_MS = 30_000;
const ceremonyRefreshChannelName = "carshow-ceremony-refresh";
const ceremonyRefreshStorageKey = "carshow:ceremony-refresh";

function shufflePhotos(photos: CeremonyPhotoSlide[]) {
  const shuffled = [...photos];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function samePhotoSet(first: CeremonyPhotoSlide[], second: CeremonyPhotoSlide[]) {
  if (first.length !== second.length) return false;
  const firstIds = first.map((photo) => photo.id).sort().join("|");
  const secondIds = second.map((photo) => photo.id).sort().join("|");
  return firstIds === secondIds;
}

function photoSource(photo: PublicPhoto | CeremonyPhotoSlide | null | undefined) {
  if (!photo) return null;
  return photo.url ?? photo.mediumUrl ?? photo.thumbUrl;
}

function vehicleName(vehicle: CeremonyWinnerSlide["vehicle"] | CeremonyPhotoSlide["vehicle"]) {
  const model = vehicle.model.trim().split(/\s+/)[0] ?? vehicle.model;
  return `${vehicle.year} ${vehicle.make} ${model}`;
}

export function CeremonyView() {
  const [data, setData] = useState<CeremonyData | null>(null);
  const [photoSlides, setPhotoSlides] = useState<CeremonyPhotoSlide[]>([]);
  const [prePublishIndex, setPrePublishIndex] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState(-1);
  const [winnerPhotoIndex, setWinnerPhotoIndex] = useState(0);
  const [error, setError] = useState("");

  const loadCeremony = useCallback(async () => {
    try {
      const result = await getCeremonyData();
      setData((previous) => {
        if (!previous?.event.resultsPublished && result.event.resultsPublished) {
          setWinnerIndex(-1);
          setWinnerPhotoIndex(0);
        }
        return result;
      });
      setPhotoSlides((current) => (samePhotoSet(current, result.photoSlides) ? current : shufflePhotos(result.photoSlides)));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load ceremony page");
    }
  }, []);

  useEffect(() => {
    void loadCeremony();
    const refresh = window.setInterval(() => void loadCeremony(), REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [loadCeremony]);

  useEffect(() => {
    const refreshCeremony = () => void loadCeremony();
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(ceremonyRefreshChannelName) : null;
    channel?.addEventListener("message", refreshCeremony);

    function handleStorage(event: StorageEvent) {
      if (event.key === ceremonyRefreshStorageKey) refreshCeremony();
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      channel?.removeEventListener("message", refreshCeremony);
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadCeremony]);

  useEffect(() => {
    if (data?.event.resultsPublished || photoSlides.length <= 1) return;
    const timer = window.setTimeout(() => {
      setPrePublishIndex((index) => (index + 1) % photoSlides.length);
    }, PRE_PUBLISH_PHOTO_MS);
    return () => window.clearTimeout(timer);
  }, [data?.event.resultsPublished, photoSlides.length, prePublishIndex]);

  useEffect(() => {
    if (!data?.event.resultsPublished || winnerIndex < 0 || !data.winnerSlides[winnerIndex]) return;
    const photos = data.winnerSlides[winnerIndex].vehicle.photos;
    if (photos.length <= 1) return;
    const currentPhoto = photos[winnerPhotoIndex] ?? photos[0];
    const timer = window.setTimeout(() => {
      setWinnerPhotoIndex((index) => (index + 1) % photos.length);
    }, currentPhoto?.isPrimary || winnerPhotoIndex === 0 ? HERO_PHOTO_MS : SECONDARY_PHOTO_MS);
    return () => window.clearTimeout(timer);
  }, [data, winnerIndex, winnerPhotoIndex]);

  useEffect(() => {
    setWinnerPhotoIndex(0);
  }, [winnerIndex]);

  const advanceWinner = useCallback(() => {
    setWinnerIndex((index) => {
      const totalWinners = data?.winnerSlides.length ?? 0;
      if (!totalWinners) return -1;
      return index >= totalWinners - 1 ? -1 : index + 1;
    });
  }, [data?.winnerSlides.length]);

  const previousWinner = useCallback(() => {
    setWinnerIndex((index) => {
      const totalWinners = data?.winnerSlides.length ?? 0;
      if (!totalWinners) return -1;
      return index <= -1 ? totalWinners - 1 : index - 1;
    });
  }, [data?.winnerSlides.length]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!data?.event.resultsPublished) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        advanceWinner();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousWinner();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [advanceWinner, data?.event.resultsPublished, previousWinner]);

  const currentWinner = winnerIndex >= 0 ? data?.winnerSlides[winnerIndex] : null;
  const prePublishPhoto = photoSlides[prePublishIndex % Math.max(photoSlides.length, 1)];

  return (
    <main className="ceremony-page">
      <section className="ceremony-stage" onClick={data?.event.resultsPublished ? advanceWinner : undefined}>
        {error ? <CeremonyNotice title="Ceremony unavailable" message={error} /> : null}
        {!error && !data ? <CeremonyNotice title="Loading ceremony" message="Preparing the broadcast view..." /> : null}
        {!error && data && !data.event.resultsPublished ? (
          <PrePublishSlide photo={prePublishPhoto} />
        ) : null}
        {!error && data?.event.resultsPublished && !currentWinner ? (
          <LogoSlide winnerCount={data.winnerSlides.length} />
        ) : null}
        {!error && currentWinner ? (
          <WinnerSlide
            slide={currentWinner}
            photoIndex={winnerPhotoIndex}
          />
        ) : null}
      </section>
    </main>
  );
}

function CeremonyNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="ceremony-notice">
      <img src={logoHero} alt="Father's Day Car Show" />
      <p>{title}</p>
      <h1>{message}</h1>
    </div>
  );
}

function PrePublishSlide({ photo }: { photo: CeremonyPhotoSlide | undefined }) {
  const src = photoSource(photo);
  if (!photo || !src) {
    return <CeremonyNotice title="Results coming soon" message="Waiting for approved vehicle photos." />;
  }

  return (
    <div className="ceremony-photo-slide">
      <BroadcastImage src={src} alt={photo.altText ?? vehicleName(photo.vehicle)} />
      <div className="ceremony-prepublish-overlay">
        <img src={logoHero} alt="Father's Day Car Show" />
        <div>
          <p>Results coming soon</p>
          <h1>{vehicleName(photo.vehicle)}</h1>
          <span>
            Entry #{photo.vehicle.entryNumber.toString().padStart(4, "0")}
            {photo.vehicle.ownerName ? ` / Owner: ${photo.vehicle.ownerName}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function LogoSlide({ winnerCount }: { winnerCount: number }) {
  return (
    <div className="ceremony-logo-slide">
      <img src={logoHero} alt="Father's Day Car Show" />
      <p>2026 Voting Results</p>
      <h1>Category &amp; Special Award Winners</h1>
      <span>{winnerCount ? "Click, press space, or use arrow keys to advance." : "No published winners yet."}</span>
    </div>
  );
}

function WinnerSlide({
  slide,
  photoIndex,
}: {
  slide: CeremonyWinnerSlide;
  photoIndex: number;
}) {
  const photo = slide.vehicle.photos[photoIndex] ?? slide.vehicle.photos[0];
  const src = photoSource(photo);

  return (
    <div className="ceremony-winner-slide">
      {src ? (
        <BroadcastImage src={src} alt={photo?.altText ?? vehicleName(slide.vehicle)} />
      ) : (
        <div className="ceremony-missing-photo">Photo coming soon</div>
      )}
      <div className="ceremony-prepublish-overlay ceremony-winner-banner">
        <img src={logoHero} alt="Father's Day Car Show" />
        <div>
          <p>{slide.label} / {slide.resultLabel}</p>
          <h1>{vehicleName(slide.vehicle)}</h1>
          <span>
            Entry #{slide.vehicle.entryNumber.toString().padStart(4, "0")}
            {slide.vehicle.ownerName ? ` / Owner: ${slide.vehicle.ownerName}` : ""}
            {slide.vehicle.category.name ? ` / ${slide.vehicle.category.name}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function BroadcastImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="ceremony-broadcast-image">
      <img className="ceremony-broadcast-backdrop" src={src} alt="" aria-hidden="true" />
      <img className="ceremony-broadcast-foreground" src={src} alt={alt} />
    </div>
  );
}
