import { Alert, EntryCard } from "@carshow/carshow-components";
import type { PublicCategory, PublicEntry } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPublicEvent, searchPublicEntries, type Pagination } from "../api";
import { EntrySearch } from "../components/EntrySearch";

export function BrowseView() {
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getPublicEvent()
      .then(({ categories }) => setCategories(categories))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(vehicleSearch.trim());
      setPage(1);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [vehicleSearch]);

  useEffect(() => {
    if (!debouncedSearch) {
      setEntries([]);
      setPagination(null);
      return;
    }

    setSearchLoading(true);
    setError("");
    searchPublicEntries(page, debouncedSearch)
      .then(({ entries, pagination }) => {
        setEntries(entries);
        setPagination(pagination);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch, page]);

  if (loading) {
    return (
      <div className="public-content">
        <p className="muted-copy">Loading…</p>
      </div>
    );
  }

  return (
    <div className="public-content">
      <EntrySearch
        onSearch={(num) => navigate(`/browse/entry/${num}`)}
        onTextSearch={setVehicleSearch}
        placeholder="Find by entry #, owner, make, or model"
        value={vehicleSearch}
      />
      <h1 className="public-page-title">Browse by Category</h1>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {debouncedSearch ? (
        <>
          {searchLoading ? (
            <p className="muted-copy">Searching…</p>
          ) : entries.length === 0 ? (
            <p className="muted-copy">{`No vehicles found for “${debouncedSearch}”.`}</p>
          ) : (
            <div className="entry-grid">
              {entries.map((entry) => (
                <Link
                  key={entry.id}
                  to={`/browse/entry/${entry.entryNumber}`}
                  className="entry-card-link"
                >
                  <EntryCard entry={entry} />
                </Link>
              ))}
            </div>
          )}

          {pagination && pagination.totalPages > 1 ? (
            <nav className="pagination" aria-label="Search result page navigation">
              <button
                className="pagination-btn"
                onClick={() => setPage(pagination.page - 1)}
                disabled={!pagination.hasPrev || searchLoading}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <span className="pagination-ellipsis">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="pagination-btn"
                onClick={() => setPage(pagination.page + 1)}
                disabled={!pagination.hasNext || searchLoading}
                aria-label="Next page"
              >
                Next →
              </button>
            </nav>
          ) : null}

          {pagination && pagination.total > 0 ? (
            <p className="pagination-summary">
              Showing {(pagination.page - 1) * pagination.pageSize + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} entries
            </p>
          ) : null}
        </>
      ) : (
        <nav className="category-list">
          {categories.map((cat) => (
            <Link key={cat.id} to={`/browse/${cat.slug}`} className="category-list-item">
              {cat.name}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
