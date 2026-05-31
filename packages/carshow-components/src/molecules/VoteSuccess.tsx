export function VoteSuccess({ categoryName }: { categoryName: string }) {
  return (
    <div className="vote-success">
      <div className="vote-success-icon" aria-hidden="true">✓</div>
      <p className="vote-success-heading">Vote recorded!</p>
      <p className="muted-copy">Your vote in <strong>{categoryName}</strong> has been counted.</p>
    </div>
  );
}
