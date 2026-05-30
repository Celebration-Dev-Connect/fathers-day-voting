import { Button } from "../atoms/Button.js";
import type { Category } from "../types.js";

export function CategoryCard({
  category,
  canEdit,
  onToggleActive,
}: {
  category: Category;
  canEdit: boolean;
  onToggleActive: () => void;
}) {
  return (
    <article className="category-card">
      <div>
        <strong>{category.name}</strong>
        <span>{category._count?.vehicleEntries ?? 0} registrations</span>
      </div>
      <Button variant="secondary" disabled={!canEdit} onClick={onToggleActive}>
        {category.active ? "Active" : "Inactive"}
      </Button>
    </article>
  );
}
