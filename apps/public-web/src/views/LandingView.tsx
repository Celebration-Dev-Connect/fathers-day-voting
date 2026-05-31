import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHeroPhotos, type HeroPhoto } from "../api";
import { EntrySearch } from "../components/EntrySearch";

export function LandingView() {
  const [photos, setPhotos] = useState<HeroPhoto[]>([]);
  const [current, setCurrent] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    getHeroPhotos()
      .then(({ photos }) => setPhotos(photos))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setCurrent((i) => (i + 1) % photos.length), 5000);
    return () => clearInterval(id);
  }, [photos.length]);

  function markHeroLoaded(url: string) {
    setLoadedUrls((prev) => new Set([...prev, url]));
  }

  return (
    <div className="hero-carousel">
      {photos.map((photo, i) => (
        <div
          key={`${photo.url}-${i}`}
          className={`hero-slide${i === current ? " active" : ""}${loadedUrls.has(photo.url) ? " loaded" : ""}`}
          aria-hidden={i !== current}
        >
          <img
            className="hero-slide-img"
            src={photo.url}
            alt={`${photo.year} ${photo.make} ${photo.model}`}
            onLoad={() => markHeroLoaded(photo.url)}
          />
        </div>
      ))}

      <div className="hero-overlay">
        <p className="hero-brand">Celebration Church Presents</p>
        <h1 className="hero-title">Father's Day<br />Car Show</h1>
        <p className="hero-date">Show &amp; Shine · June 21, 2026</p>
        <p className="hero-tagline">Browse the entries, discover amazing cars,<br />and vote for your favourites!</p>
        <div className="hero-actions">
          <button className="hero-browse-btn" onClick={() => navigate("/browse")}>
            Browse Entries
          </button>
        </div>
        <div className="hero-search">
          <EntrySearch onSearch={(num) => navigate(`/browse/entry/${num}`)} />
        </div>
      </div>

      {photos.length > 1 ? (
        <div className="hero-dots">
          {photos.map((_, i) => (
            <button
              key={i}
              className={`hero-dot${i === current ? " active" : ""}`}
              onClick={() => setCurrent(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
