import { ExternalLink, RefreshCw, X } from "lucide-react";
import { Button, Pagination, vehicleName, type Registration, type VehiclePhoto } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import {
  createResultExclusion,
  deleteResultExclusion,
  getVehicleVoteReview,
  updateVoteExclusion,
  type VoteReview,
  type VoteReviewContext,
  type VoteReviewVote,
} from "../../api";

type PhotoWithUrl = VehiclePhoto & { url: string };
type VoteFilter = "all" | "flagged" | "excluded";
const voteReviewPageSize = 25;

function hasPhotoUrl(photo: VehiclePhoto): photo is PhotoWithUrl {
  return Boolean(photo.url);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function flagIsSuspicious(flag: string) {
  return flag !== "Church Wi-Fi IP";
}

export function WinnerDrawer({
  registration,
  context,
  canManage,
  onOpenRegistration,
  onVotesChanged,
  onClose,
}: {
  registration: Registration;
  context: VoteReviewContext;
  canManage: boolean;
  onOpenRegistration: () => void;
  onVotesChanged: () => void | Promise<void>;
  onClose: () => void;
}) {
  const photos = (registration.photos ?? []).filter(hasPhotoUrl);
  const [review, setReview] = useState<VoteReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<VoteFilter>("all");
  const [page, setPage] = useState(0);
  const [savingVoteId, setSavingVoteId] = useState<string | null>(null);
  const [savingResultExclusion, setSavingResultExclusion] = useState(false);
  const [expandedVoteId, setExpandedVoteId] = useState<string | null>(null);
  const resultContext =
    context.kind === "special-award" && context.specialAwardId
      ? { contextType: "SPECIAL_AWARD" as const, contextId: context.specialAwardId }
      : context.kind === "people-choice" && context.categoryId
        ? { contextType: "PEOPLE_CHOICE_CATEGORY" as const, contextId: context.categoryId }
        : null;

  async function loadReview(targetPage = page) {
    setLoading(true);
    setError("");
    try {
      setReview(await getVehicleVoteReview(registration.id, context, {
        filter,
        page: targetPage,
        pageSize: voteReviewPageSize,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load vote review");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReview();
  }, [registration.id, context.categoryId, context.specialAwardId, filter, page]);

  async function toggleVote(vote: VoteReviewVote) {
    setSavingVoteId(vote.id);
    setError("");
    try {
      await updateVoteExclusion(
        vote.kind,
        vote.id,
        !vote.excludedAt,
        vote.excludedAt ? undefined : "Removed during winner review",
      );
      await loadReview(page);
      await onVotesChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update vote");
    } finally {
      setSavingVoteId(null);
    }
  }

  async function toggleResultExclusion() {
    if (!review || !resultContext) return;
    setSavingResultExclusion(true);
    setError("");
    try {
      if (review.resultExclusion) {
        if (!window.confirm("Restore this vehicle to this result? It can win again after tallies refresh.")) return;
        await deleteResultExclusion(review.resultExclusion.id);
      } else {
        if (
          !window.confirm(
            "Exclude this vehicle from this result? Votes remain stored, but the next eligible vehicle will move up.",
          )
        ) {
          return;
        }
        await createResultExclusion({
          vehicleEntryId: registration.id,
          ...resultContext,
          reason: "Removed from this result during winner review",
        });
      }
      await loadReview(page);
      await onVotesChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update result exclusion");
    } finally {
      setSavingResultExclusion(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="winner-drawer winner-review-drawer" aria-label="Winner vote review">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Winner Review</p>
            <h2>{vehicleName(registration)}</h2>
            <p className="muted-copy">{context.label}</p>
          </div>
          <Button variant="icon" light onClick={onClose} aria-label="Close winner details">
            <X size={20} />
          </Button>
        </div>

        <div className="winner-review-layout">
          <section className="winner-review-profile">
            <Button variant="secondary" onClick={onOpenRegistration}>
              <ExternalLink size={18} />
              Open Registration
            </Button>

            <div className="winner-photo-grid">
              {photos.length ? (
                photos.map((photo) => (
                  <img key={photo.id} src={photo.url} alt={photo.altText ?? vehicleName(registration)} />
                ))
              ) : (
                <div className="photo-empty">No photos loaded.</div>
              )}
            </div>

            <div className="winner-detail-grid">
              <div>
                <span>Entry</span>
                <strong>#{registration.entryNumber.toString().padStart(3, "0")}</strong>
              </div>
              <div>
                <span>Category</span>
                <strong>{registration.category.name}</strong>
              </div>
              <div>
                <span>Owner</span>
                <strong>
                  {registration.owner.firstName} {registration.owner.lastName}
                </strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{registration.owner.phone}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{registration.owner.email ?? "Not provided"}</strong>
              </div>
              <div>
                <span>QR</span>
                <strong>{registration.qrCard?.visibleCode ?? "No QR assigned"}</strong>
              </div>
            </div>

            {registration.nickname ? <div className="drawer-note">{registration.nickname}</div> : null}
            {registration.internalNotes ? <div className="drawer-note muted">{registration.internalNotes}</div> : null}
          </section>

          <section className="vote-review-panel">
            <div className="vote-review-header">
              <div>
                <p className="eyebrow">Vote Review</p>
                <h3>{review ? `${review.summary.included} included votes` : "Loading votes"}</h3>
                {review?.resultsPublished ? (
                  <p className="muted-copy">Republish results after changes to update the public snapshot.</p>
                ) : null}
              </div>
              <div className="vote-review-actions">
                {canManage && resultContext && review ? (
                  <Button
                    variant={review.resultExclusion ? "secondary" : "primary"}
                    onClick={toggleResultExclusion}
                    disabled={savingResultExclusion}
                  >
                    {review.resultExclusion ? "Restore Vehicle To This Result" : "Exclude Vehicle From This Result"}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => loadReview()} disabled={loading}>
                  <RefreshCw size={18} />
                  Refresh
                </Button>
              </div>
            </div>

            {review?.resultExclusion ? (
              <div className="result-exclusion-notice">
                <strong>Vehicle excluded from this result.</strong>
                <span>
                  {review.resultExclusion.reason ?? "No reason provided"}
                  {review.resultExclusion.excludedBy ? ` · ${review.resultExclusion.excludedBy}` : ""}
                </span>
              </div>
            ) : null}

            {review ? (
              <div className="vote-review-summary">
                <div>
                  <span>Total</span>
                  <strong>{review.summary.total}</strong>
                </div>
                <div>
                  <span>Flagged</span>
                  <strong>{review.summary.flagged}</strong>
                </div>
                <div>
                  <span>Excluded</span>
                  <strong>{review.summary.excluded}</strong>
                </div>
              </div>
            ) : null}

            <div className="vote-review-filters" role="tablist" aria-label="Vote review filters">
              {(["all", "flagged", "excluded"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? "active" : ""}
                  onClick={() => {
                    setPage(0);
                    setExpandedVoteId(null);
                    setFilter(value);
                  }}
                >
                  {value}
                </button>
              ))}
            </div>

            {error ? <div className="vote-review-error">{error}</div> : null}
            {loading ? <div className="empty-state">Loading vote review...</div> : null}

            {!loading && !review?.votes.length ? (
              <div className="empty-state">No votes match this review filter.</div>
            ) : null}

            {!loading && review?.votes.length ? (
              <div className="vote-review-list">
                {review.votes.map((vote) => (
                  <article className={vote.excludedAt ? "vote-review-row excluded" : "vote-review-row"} key={vote.id}>
                    <div className="vote-review-row-main">
                      <div>
                        <strong>{vote.label}</strong>
                        <span>
                          {formatDate(vote.createdAt)} · {vote.voterKey}
                        </span>
                      </div>
                      {vote.flags.length ? (
                        <div className="vote-flag-list compact">
                          {vote.flags.slice(0, 3).map((flag) => (
                            <button
                              type="button"
                              className={flagIsSuspicious(flag) ? "vote-flag suspicious" : "vote-flag"}
                              key={flag}
                              onClick={() => setExpandedVoteId(expandedVoteId === vote.id ? null : vote.id)}
                            >
                              {flag}
                            </button>
                          ))}
                          {vote.flags.length > 3 ? <span className="vote-flag-more">+{vote.flags.length - 3}</span> : null}
                        </div>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant={vote.excludedAt ? "secondary" : "primary"}
                          onClick={() => toggleVote(vote)}
                          disabled={savingVoteId === vote.id}
                        >
                          {vote.excludedAt ? "Restore" : "Exclude"}
                        </Button>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="vote-detail-toggle"
                      onClick={() => setExpandedVoteId(expandedVoteId === vote.id ? null : vote.id)}
                    >
                      {expandedVoteId === vote.id ? "Hide details" : "Show details"}
                    </button>

                    {expandedVoteId === vote.id ? (
                      <div className="vote-review-expanded">
                        <dl className="vote-review-meta">
                          <div>
                            <dt>IP</dt>
                            <dd>{vote.ipAddress ?? "Unavailable"}</dd>
                          </div>
                          <div>
                            <dt>Browser</dt>
                            <dd>{vote.userAgent ?? "Unavailable"}</dd>
                          </div>
                        </dl>
                        {vote.flags.length ? (
                          <div className="vote-flag-list">
                            {vote.flags.map((flag) => (
                              <span
                                className={flagIsSuspicious(flag) ? "vote-flag suspicious" : "vote-flag"}
                                key={flag}
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {vote.flagDetails.length ? (
                          <div className="vote-flag-detail">
                            {vote.flagDetails.map((detail) => (
                              <div key={detail.flag}>
                                <strong>{detail.flag}</strong>
                                <p>{detail.detail}</p>
                                {detail.ballots?.length ? (
                                  <div className="vote-ballot-tags">
                                    {detail.ballots.map((ballot) => (
                                      <span key={ballot}>{ballot}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {vote.excludedAt ? (
                      <p className="vote-excluded-note">
                        Excluded {formatDate(vote.excludedAt)}
                        {vote.excludedBy ? ` by ${vote.excludedBy}` : ""}. {vote.excludedReason}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}

            {review?.pagination ? (
              <Pagination
                page={review.pagination.page}
                pageCount={review.pagination.pageCount}
                total={review.pagination.total}
                pageSize={review.pagination.pageSize}
                onChange={(nextPage) => {
                  setExpandedVoteId(null);
                  setPage(nextPage);
                }}
              />
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}
