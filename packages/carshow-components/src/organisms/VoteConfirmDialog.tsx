import { Button } from "../atoms/Button.js";

type Props = {
  categoryName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function VoteConfirmDialog({ categoryName, onConfirm, onCancel }: Props) {
  return (
    <div className="vote-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="vote-confirm-title">
      <div className="vote-confirm">
        <h2 id="vote-confirm-title" className="vote-confirm-title">Confirm your vote</h2>
        <p className="vote-confirm-body">
          You can only vote once in the <strong>{categoryName}</strong> category. This cannot be changed.
        </p>
        <div className="vote-confirm-actions">
          <Button variant="primary" onClick={onConfirm}>Yes, cast my vote</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
