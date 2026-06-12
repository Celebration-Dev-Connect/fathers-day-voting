export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const pages = buildPageList(page, pageCount);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div>
      <div className="pagination">
        <button className="pagination-btn" disabled={page === 0} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <div className="pagination-pages">
          {pages.map((entry, index) =>
            entry === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="pagination-ellipsis">…</span>
            ) : (
              <button
                key={entry}
                className={`pagination-page${entry === page ? " active" : ""}`}
                onClick={() => onChange(entry)}
              >
                {entry + 1}
              </button>
            ),
          )}
        </div>
        <button className="pagination-btn" disabled={page === pageCount - 1} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
      <p className="pagination-summary">
        {start}–{end} of {total}
      </p>
    </div>
  );
}

function buildPageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);

  const pages = new Set<number>();
  pages.add(0);
  pages.add(total - 1);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) pages.add(i);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(sorted[i]);
  }
  return result;
}
