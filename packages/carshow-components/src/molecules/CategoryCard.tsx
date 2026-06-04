import { Button } from "../atoms/Button.js";
import type { Category } from "../types.js";
import { Trash2 } from "lucide-react";

export function CategoryCard({
  category,
  canEdit,
  onToggleActive,
  onDelete,
}: {
  category: Category;
  canEdit: boolean;
  onToggleActive: () => void;
  onDelete?: () => void;
}) {
  const usageCount =
    (category._count?.vehicleEntries ?? 0) +
    (category._count?.judgeCategoryPicks ?? 0) +
    (category._count?.peopleChoiceVotes ?? 0) +
    (category._count?.winnerOverrides ?? 0);

  return (
    <article className="category-card">
      <div>
        <strong>{category.name}</strong>
        <span>{category._count?.vehicleEntries ?? 0} registrations</span>
      </div>
      <div className="card-actions">
        <Button variant="secondary" disabled={!canEdit} onClick={onToggleActive}>
          {category.active ? "Active" : "Inactive"}
        </Button>
        {onDelete ? (
          <Button variant="secondary" disabled={!canEdit || usageCount > 0} onClick={onDelete}>
            <Trash2 size={18} />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
