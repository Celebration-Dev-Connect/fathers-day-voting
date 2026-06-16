import { ExternalLink, RefreshCw, X } from "lucide-react";
import { Button, vehicleName, type Registration, type VehiclePhoto } from "@carshow/carshow-components";
import { useEffect, useMemo, useState } from "react";
import {
  getVehicleVoteReview,
  updateVoteExclusion,
  type VoteReview,
  type VoteReviewContext,
  type VoteReviewVote,
} from "../../api";

type PhotoWithUrl = VehiclePhoto & { url: string };
type VoteFilter = "all" | "flagged" | "excluded";

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
  const [savingVoteId, setSavingVoteId] = useState<string | null>(null);
  const [expandedVoteId, setExpandedVoteId] = useState<string | null>(null);

  async function loadReview() {
    setLoading(true);
    setError("");
    try {
      setReview(await getVehicleVoteReview(registration.id, context));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load vote review");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReview();
  }, [registration.id, context.categoryId, context.specialAwardId]);

  const filteredVotes = useMemo(() => {
    const votes = review?.votes ?? [];
    if (filter === "flagged") {
      return votes.filter((vote) => vote.flags.some(flagIsSuspicious));
    }
    if (filter === "excluded") return votes.filter((vote) => vote.excludedAt);
    return votes;
  }, [filter, review]);

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
      await loadReview();
      await onVotesChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update vote");
    } finally {
      setSavingVoteId(null);
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
              <Button variant="secondary" onClick={loadReview} disabled={loading}>
                <RefreshCw size={18} />
                Refresh
              </Button>
            </div>

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
                  onClick={() => setFilter(value)}
                >
                  {value}
                </button>
              ))}
            </div>

            {error ? <div className="vote-review-error">{error}</div> : null}
            {loading ? <div className="empty-state">Loading vote review...</div> : null}

            {!loading && !filteredVotes.length ? (
              <div className="empty-state">No votes match this review filter.</div>
            ) : null}

            {!loading && filteredVotes.length ? (
              <div className="vote-review-list">
                {filteredVotes.map((vote) => (
                  <article className={vote.excludedAt ? "vote-review-row excluded" : "vote-review-row"} key={vote.id}>
                    <div className="vote-review-row-main">
                      <div>
                        <strong>{vote.label}</strong>
                        <span>
                          {formatDate(vote.createdAt)} · {vote.voterKey}
                        </span>
                      </div>
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
                          <button
                            type="button"
                            className={flagIsSuspicious(flag) ? "vote-flag suspicious" : "vote-flag"}
                            key={flag}
                            onClick={() => setExpandedVoteId(expandedVoteId === vote.id ? null : vote.id)}
                          >
                            {flag}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {expandedVoteId === vote.id ? (
                      <div className="vote-flag-detail">
                        {vote.flagDetails.length ? (
                          vote.flagDetails.map((detail) => (
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
                          ))
                        ) : (
                          <p>No extra detail is available for this flag yet.</p>
                        )}
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
          </section>
        </div>
      </aside>
    </div>
  );
}
