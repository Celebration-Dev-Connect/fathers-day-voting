import { useState } from "react";
import type { PublicEntry } from "../types.js";

export function EntryCard({ entry }: { entry: PublicEntry }) {
  const [loaded, setLoaded] = useState(false);
  const photo = entry.photos[0];
  const label = entry.nickname
    ? `${entry.year} ${entry.make} ${entry.model} — "${entry.nickname}"`
    : `${entry.year} ${entry.make} ${entry.model}`;

  return (
    <article className="entry-card">
      <div className="entry-card-photo">
        {photo ? (
          <>
            {!loaded && <div className="img-shimmer" aria-hidden="true" />}
            <img
              src={photo.url}
              alt={photo.altText ?? label}
              loading="lazy"
              style={{ opacity: loaded ? 1 : 0 }}
              onLoad={() => setLoaded(true)}
            />
          </>
        ) : (
          <div className="entry-card-photo-empty" />
        )}
      </div>
      <div className="entry-card-body">
        <span className="eyebrow">#{entry.entryNumber}</span>
        <p className="entry-card-title">{label}</p>
        {entry.ownerName ? <p className="muted-copy">{entry.ownerName}</p> : null}
        {entry.exteriorColor ? <p className="muted-copy">{entry.exteriorColor}</p> : null}
      </div>
    </article>
  );
}
