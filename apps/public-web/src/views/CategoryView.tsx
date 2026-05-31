import { Alert, EntryCard } from "@carshow/carshow-components";
import type { PublicCategory, PublicEntry } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getCategoryEntries } from "../api";

export function CategoryView() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<PublicCategory | null>(null);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    getCategoryEntries(slug)
      .then(({ category, entries }) => {
        setCategory(category);
        setEntries(entries);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="public-content">
        <p className="muted-copy">Loading…</p>
      </div>
    );
  }

  return (
    <div className="public-content">
      {category ? <h2 className="section-title">{category.name}</h2> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {entries.length === 0 && !error ? (
        <p className="muted-copy">No entries checked in yet.</p>
      ) : (
        <div className="entry-grid">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
