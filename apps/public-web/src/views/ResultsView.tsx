import { Alert, type PublishedResultEntry, type PublishedResultsSnapshot, type PublicPhoto } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logoHero from "../assets/logo-hero.png";
import { getPublishedResults } from "../api";

type WinnerSlide = {
  label: string;
  entry: PublishedResultEntry;
  photo: PublicPhoto;
};

function heroPhoto(entry: PublishedResultEntry) {
  return entry.vehicle.photos.find((photo) => photo.isPrimary) ?? entry.vehicle.photos[0];
}

function photoUrl(photo: PublicPhoto) {
  return photo.url ?? photo.mediumUrl;
}

function winnerSlides(results: PublishedResultsSnapshot) {
  const winners = [
    ...results.categories.map((category) => ({
      label: category.category.name,
      entry: (results.judgesVotingEnabled ? category.official[0] : null) ?? category.peopleChoice[0],
    })),
    ...results.specialAwards.map((award) => ({
      label: award.specialAward.name,
      entry: award.results[0],
    })),
  ];
  return winners.flatMap(({ label, entry }) => {
    if (!entry) return [];
    const photo = heroPhoto(entry);
    if (!photo || !photoUrl(photo)) return [];
    return [{ label, entry, photo }];
  });
}

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
    <div className="public-results">
      <ResultsCarousel slides={winnerSlides(results)} />

      <div className="public-content public-results-content">
        <div className="public-results-intro">
          <p className="eyebrow">2026 Father&apos;s Day Car Show</p>
          <h1 className="public-page-title">Category Winners</h1>
          <p>Congratulations to this year&apos;s winners and their owners.</p>
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
    </div>
  );
}

function ResultsCarousel({ slides }: { slides: WinnerSlide[] }) {
  const [current, setCurrent] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const activeSlide = slides[current];

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => setCurrent((index) => (index + 1) % slides.length), 5000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    if (current >= slides.length) setCurrent(0);
  }, [current, slides.length]);

  return (
    <section className="results-carousel">
      {slides.map((slide, index) => {
        const src = photoUrl(slide.photo);
        if (!src) return null;
        return (
          <div
            key={`${slide.label}-${slide.entry.vehicle.id}`}
            className={`results-carousel-slide${index === current ? " active" : ""}${loadedUrls.has(src) ? " loaded" : ""}`}
            aria-hidden={index !== current}
          >
            <img
              src={src}
              alt={slide.photo.altText ?? `${slide.entry.vehicle.year} ${slide.entry.vehicle.make} ${slide.entry.vehicle.model}`}
              onLoad={() => setLoadedUrls((previous) => new Set([...previous, src]))}
            />
          </div>
        );
      })}

      <div className="results-carousel-overlay">
        <img src={logoHero} alt="Father's Day Car Show" className="results-carousel-logo" />
        <p className="results-carousel-kicker">2026 Voting Results</p>
        {activeSlide ? (
          <Link to={`/browse/entry/${activeSlide.entry.vehicle.entryNumber}`} className="results-carousel-winner">
            <span>{activeSlide.label} Winner</span>
            <strong>
              {activeSlide.entry.vehicle.year} {activeSlide.entry.vehicle.make} {activeSlide.entry.vehicle.model}
            </strong>
            {activeSlide.entry.vehicle.ownerName ? <small>Owned by {activeSlide.entry.vehicle.ownerName}</small> : null}
          </Link>
        ) : (
          <p className="results-carousel-fallback">Congratulations to this year&apos;s winners.</p>
        )}
        <Link to="/browse" className="public-results-browse">Browse all vehicles</Link>
      </div>

      {slides.length > 1 ? (
        <div className="results-carousel-dots">
          {slides.map((slide, index) => (
            <button
              key={`${slide.label}-${slide.entry.vehicle.id}`}
              className={`hero-dot${index === current ? " active" : ""}`}
              onClick={() => setCurrent(index)}
              aria-label={`Show ${slide.label} winner`}
            />
          ))}
        </div>
      ) : null}
    </section>
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
          {entries.map((entry) => {
            const photo = heroPhoto(entry);
            const thumbnail = photo ? photo.thumbUrl ?? photo.mediumUrl ?? photo.url : null;
            return (
              <li key={entry.vehicle.id}>
                <Link to={`/browse/entry/${entry.vehicle.entryNumber}`}>
                  <span className="public-result-thumbnail">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={photo?.altText ?? `${entry.vehicle.year} ${entry.vehicle.make} ${entry.vehicle.model}`}
                        loading="lazy"
                      />
                    ) : null}
                    <b className="public-result-rank">{entry.rank}</b>
                  </span>
                  <span className="public-result-details">
                    <strong>{entry.vehicle.year} {entry.vehicle.make} {entry.vehicle.model}</strong>
                    {entry.vehicle.ownerName ? <small className="public-result-owner">Owned by {entry.vehicle.ownerName}</small> : null}
                    <small>Entry #{entry.vehicle.entryNumber.toString().padStart(4, "0")}</small>
                  </span>
                  <b className="public-result-score">{entry.votes ?? entry.judgePoints ?? 0} {scoreLabel}</b>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted-copy">No results recorded.</p>
      )}
    </article>
  );
}
