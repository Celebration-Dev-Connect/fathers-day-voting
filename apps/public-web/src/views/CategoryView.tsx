import { Alert, EntryCard } from "@carshow/carshow-components";
import type { PublicCategory, PublicEntry } from "@carshow/carshow-components";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { searchCategoryEntries, type Pagination } from "../api";
import { EntrySearch } from "../components/EntrySearch";

export function CategoryView() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<PublicCategory | null>(null);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
    setVehicleSearch("");
    setDebouncedSearch("");
  }, [slug]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(vehicleSearch.trim());
      setPage(1);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [vehicleSearch]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    searchCategoryEntries(slug, page, debouncedSearch)
      .then(({ category, entries, pagination }) => {
        setCategory(category);
        setEntries(entries);
        setPagination(pagination);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, page, debouncedSearch]);

  function goToPage(next: number) {
    setPage(next);
  }

  return (
    <div className="public-content" ref={topRef}>
      <Link to="/browse" className="back-link">← Back to browse</Link>
      <EntrySearch
        onSearch={(num) => navigate(`/browse/entry/${num}`)}
        onTextSearch={setVehicleSearch}
        placeholder="Find by entry #, owner, make, or model"
        value={vehicleSearch}
      />
      {category ? <h1 className="public-page-title">{category.name}</h1> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      {loading ? (
        <p className="muted-copy">Loading…</p>
      ) : entries.length === 0 && !error ? (
        <p className="muted-copy">
          {debouncedSearch ? `No entries found for “${debouncedSearch}”.` : "No entries checked in yet."}
        </p>
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
        <nav className="pagination" aria-label="Page navigation">
          <button
            className="pagination-btn"
            onClick={() => goToPage(pagination.page - 1)}
            disabled={!pagination.hasPrev || loading}
            aria-label="Previous page"
          >
            ← Prev
          </button>

          <div className="pagination-pages">
            {buildPageNumbers(pagination.page, pagination.totalPages).map((item, i) =>
              item === "…" ? (
                <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
              ) : (
                <button
                  key={item}
                  className={`pagination-page${item === pagination.page ? " active" : ""}`}
                  onClick={() => goToPage(item as number)}
                  disabled={loading}
                  aria-current={item === pagination.page ? "page" : undefined}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <button
            className="pagination-btn"
            onClick={() => goToPage(pagination.page + 1)}
            disabled={!pagination.hasNext || loading}
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
    </div>
  );
}

function buildPageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: Array<number | "…"> = [];
  const addPage = (n: number) => pages.push(n);
  const addEllipsis = () => {
    if (pages[pages.length - 1] !== "…") pages.push("…");
  };

  addPage(1);
  if (current > 3) addEllipsis();
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) addPage(p);
  if (current < total - 2) addEllipsis();
  addPage(total);

  return pages;
}
