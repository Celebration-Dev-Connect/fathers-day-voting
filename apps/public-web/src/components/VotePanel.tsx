import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVoting } from "../context/VotingContext";

export function VotePanel({ onClose }: { onClose: () => void }) {
  const {
    categories,
    specialAwards,
    drafts,
    submitted,
    specialAwardSubmitted,
    submitVote,
    clearSelection,
    changeVote,
    changeSpecialAward,
  } = useVoting();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  async function handleSubmit(categoryId: string) {
    setSubmitting(categoryId);
    setErrors((prev) => { const n = { ...prev }; delete n[categoryId]; return n; });
    try {
      await submitVote(categoryId);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [categoryId]: err instanceof Error ? err.message : "Failed to submit",
      }));
    } finally {
      setSubmitting(null);
    }
  }

  function browse(slug: string) {
    navigate(`/browse/${slug}`);
    onClose();
  }

  const pendingCount = categories.filter((category) => drafts[category.id] && !submitted[category.id]).length;
  const submittedCount = Object.keys(submitted).length + Object.keys(specialAwardSubmitted).length;
  const totalItems = categories.length + specialAwards.length;

  return (
    <>
      <div className="vote-panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="vote-panel" role="dialog" aria-label="Your ballot">
        <div className="vote-panel-header">
          <div>
            <h2 className="vote-panel-title">Your Ballot</h2>
            <p className="vote-panel-sub">
              {submittedCount > 0
                ? `${submittedCount} of ${totalItems} votes submitted`
                : "Select category and special award picks, then submit here"}
            </p>
          </div>
          <button className="vote-panel-close" onClick={onClose} aria-label="Close ballot">✕</button>
        </div>

        {pendingCount > 0 && (
          <p className="vote-panel-hint">
            You have {pendingCount} pending pick{pendingCount > 1 ? "s" : ""} — submit each to record your vote.
          </p>
        )}

        <ul className="vote-panel-list">
          {categories.map((cat) => {
            const draft = drafts[cat.id];
            const submittedPick = submitted[cat.id];
            const isSubmitted = Boolean(submittedPick);
            const isSubmitting = submitting === cat.id;

            return (
              <li key={cat.id} className={`vote-panel-item${isSubmitted ? " submitted" : ""}`}>
                <p className="vote-panel-category">{cat.name}</p>

                {isSubmitted ? (
                  <div className="vote-panel-locked">
                    <div className="vote-panel-locked-left">
                      <span className="vote-panel-check">✓</span>
                      <span className="vote-panel-locked-label">Vote submitted</span>
                    </div>
                    <div className="vote-panel-locked-actions">
                      <button
                        className="vote-panel-clear-btn"
                        onClick={() => changeVote(cat.id)}
                      >
                        Change
                      </button>
                      <button
                        className="vote-panel-browse-btn"
                        onClick={() => { if (submittedPick?.entryNumber) navigate(`/browse/entry/${submittedPick.entryNumber}`); onClose(); }}
                      >
                        View →
                      </button>
                    </div>
                  </div>
                ) : draft ? (
                  <div className="vote-panel-draft">
                    <p className="vote-panel-pick">
                      <span className="vote-panel-entry">#{draft.entryNumber}</span>
                      {" "}{draft.year} {draft.make} {draft.model}
                      {draft.nickname ? ` — "${draft.nickname}"` : ""}
                    </p>
                    <div className="vote-panel-row">
                      <button
                        className="vote-panel-submit-btn"
                        onClick={() => handleSubmit(cat.id)}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Submitting…" : "Submit Vote"}
                      </button>
                      <button
                        className="vote-panel-clear-btn"
                        onClick={() => clearSelection(cat.id)}
                        disabled={isSubmitting}
                      >
                        Clear
                      </button>
                    </div>
                    {errors[cat.id] && <p className="vote-panel-error">{errors[cat.id]}</p>}
                  </div>
                ) : (
                  <div className="vote-panel-empty">
                    <span className="vote-panel-empty-label">No car selected yet</span>
                    <button className="vote-panel-browse-btn" onClick={() => browse(cat.slug)}>
                      Browse →
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {specialAwards.map((award) => {
            const submittedPick = specialAwardSubmitted[award.id];
            const isSubmitted = Boolean(submittedPick);

            return (
              <li key={award.id} className={`vote-panel-item special-award${isSubmitted ? " submitted" : ""}`}>
                <p className="vote-panel-category">{award.name}</p>

                {isSubmitted ? (
                  <div className="vote-panel-locked">
                    <div className="vote-panel-locked-left">
                      <span className="vote-panel-check">✓</span>
                      <span className="vote-panel-locked-label">Vote submitted</span>
                    </div>
                    <div className="vote-panel-locked-actions">
                      <button
                        className="vote-panel-clear-btn"
                        onClick={() => changeSpecialAward(award.id)}
                      >
                        Change
                      </button>
                      <button
                        className="vote-panel-browse-btn"
                        onClick={() => {
                          if (submittedPick?.entryNumber) navigate(`/browse/entry/${submittedPick.entryNumber}`);
                          onClose();
                        }}
                      >
                        View →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="vote-panel-empty">
                    <span className="vote-panel-empty-label">No car selected yet</span>
                    <button
                      className="vote-panel-browse-btn"
                      onClick={() => {
                        navigate("/browse");
                        onClose();
                      }}
                    >
                      Browse →
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
