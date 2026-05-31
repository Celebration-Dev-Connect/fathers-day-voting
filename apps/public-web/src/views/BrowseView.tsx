import { Alert } from "@carshow/carshow-components";
import type { PublicCategory } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPublicEvent } from "../api";
import { EntrySearch } from "../components/EntrySearch";

export function BrowseView() {
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

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
      <EntrySearch onSearch={(num) => navigate(`/browse/entry/${num}`)} />
      <h1 className="public-page-title">Browse by Category</h1>
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
