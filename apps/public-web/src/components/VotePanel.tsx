import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useVoting } from "../context/VotingContext";

export function VotePanel({ onClose }: { onClose: () => void }) {
  const {
    categories,
    specialAwards,
    submitted,
    specialAwardSubmitted,
    changeVote,
    changeSpecialAward,
  } = useVoting();
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function browse(slug: string) {
    navigate(`/browse/${slug}`);
    onClose();
  }

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
                : "Browse cars and tap Vote to record your picks"}
            </p>
          </div>
          <button className="vote-panel-close" onClick={onClose} aria-label="Close ballot">✕</button>
        </div>

        <ul className="vote-panel-list">
          {categories.map((cat) => {
            const submittedPick = submitted[cat.id];
            const isSubmitted = Boolean(submittedPick);

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
