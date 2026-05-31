import { Alert } from "@carshow/carshow-components";
import type { PublicCategory } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicEvent } from "../api";

export function BrowseView() {
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getPublicEvent()
      .then(({ categories }) => setCategories(categories))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="public-content">
        <p className="muted-copy">Loading…</p>
      </div>
    );
  }

  return (
    <div className="public-content">
      <h2 className="section-title">Browse by Category</h2>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <nav className="category-list">
        {categories.map((cat) => (
          <Link key={cat.id} to={`/browse/${cat.slug}`} className="category-list-item">
            {cat.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
