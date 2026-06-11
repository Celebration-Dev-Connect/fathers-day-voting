import { Button } from "../atoms/Button.js";
import type { Category } from "../types.js";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export function CategoryCard({
  category,
  canEdit,
  onRename,
  onToggleActive,
  onDelete,
}: {
  category: Category;
  canEdit: boolean;
  onRename?: (name: string) => Promise<void>;
  onToggleActive: () => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const usageCount =
    (category._count?.vehicleEntries ?? 0) +
    (category._count?.judgeCategoryPicks ?? 0) +
    (category._count?.peopleChoiceVotes ?? 0) +
    (category._count?.winnerOverrides ?? 0);

  useEffect(() => {
    if (!editing) setName(category.name);
  }, [category.name, editing]);

  function cancelEditing() {
    setName(category.name);
    setError("");
    setEditing(false);
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Category name is required.");
      return;
    }
    if (!onRename || trimmedName === category.name) {
      cancelEditing();
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onRename(trimmedName);
      setEditing(false);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="category-card">
      <div className="category-card-details">
        {editing ? (
          <form className="category-name-form" onSubmit={(event) => void saveName(event)}>
            <input
              autoFocus
              value={name}
              disabled={saving}
              aria-label={`Category name for ${category.name}`}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="card-actions">
              <Button type="submit" disabled={saving || !name.trim()}>
                <Save size={18} />
                {saving ? "Saving" : "Save"}
              </Button>
              <Button variant="secondary" disabled={saving} onClick={cancelEditing}>
                <X size={18} />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <strong>{category.name}</strong>
        )}
        <span>{category._count?.vehicleEntries ?? 0} registrations</span>
        {error ? <span className="form-error">{error}</span> : null}
      </div>
      <div className="card-actions">
        {canEdit && onRename ? (
          <Button
            variant="secondary"
            disabled={!canEdit || editing || saving}
            onClick={() => {
              setError("");
              setEditing(true);
            }}
          >
            <Pencil size={18} />
            Edit
          </Button>
        ) : null}
        <Button variant="secondary" disabled={!canEdit || editing || saving} onClick={onToggleActive}>
          {category.active ? "Active" : "Inactive"}
        </Button>
        {onDelete ? (
          <Button variant="secondary" disabled={!canEdit || editing || saving || usageCount > 0} onClick={onDelete}>
            <Trash2 size={18} />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
