import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Alert, Button, CategoryCard, PageHeader } from "@carshow/carshow-components";
import type { Category, SpecialAward, StaffUser } from "@carshow/carshow-components";
import { FormEvent, useEffect, useState } from "react";
import {
  createCategory,
  createSpecialAward,
  deleteCategory,
  deleteSpecialAward,
  updateCategory,
  updateSpecialAward,
} from "../api";

export function CategoriesView({
  staff,
  categories,
  specialAwards,
  onRefresh,
}: {
  staff: StaffUser;
  categories: Category[];
  specialAwards: SpecialAward[];
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [specialAwardName, setSpecialAwardName] = useState("");
  const [specialAwardDescription, setSpecialAwardDescription] = useState("");
  const [error, setError] = useState("");

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createCategory(name);
      setName("");
      onRefresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create category");
    }
  }

  async function addSpecialAward(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createSpecialAward({
        name: specialAwardName,
        description: specialAwardDescription.trim() || undefined,
      });
      setSpecialAwardName("");
      setSpecialAwardDescription("");
      onRefresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create special award");
    }
  }

  async function removeCategory(category: Category) {
    setError("");
    try {
      await deleteCategory(category.id);
      onRefresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete category");
    }
  }

  async function removeSpecialAward(specialAward: SpecialAward) {
    setError("");
    try {
      await deleteSpecialAward(specialAward.id);
      onRefresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete special award");
    }
  }

  function ceremonyOrderConflict(ceremonyOrder: number | null, currentId: string) {
    if (ceremonyOrder === null) return null;
    const category = categories.find((item) => item.id !== currentId && item.ceremonyOrder === ceremonyOrder);
    if (category) return `Ceremony #${ceremonyOrder} is already used by category "${category.name}".`;
    const specialAward = specialAwards.find((item) => item.id !== currentId && item.ceremonyOrder === ceremonyOrder);
    if (specialAward) return `Ceremony #${ceremonyOrder} is already used by special award "${specialAward.name}".`;
    return null;
  }

  return (
    <section>
      <PageHeader eyebrow="Admin Setup" title="Categories" />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {staff.role === "ADMIN" ? (
        <form className="inline-form" onSubmit={addCategory}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category name" />
          <Button type="submit">
            <Plus size={20} />
            Add Category
          </Button>
        </form>
      ) : (
        <Alert>Registrar accounts can view categories but cannot edit setup.</Alert>
      )}
      <div className="category-grid">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            canEdit={staff.role === "ADMIN"}
            onRename={async (categoryName) => {
              await updateCategory(category.id, { name: categoryName });
              onRefresh();
            }}
            onCeremonyOrderChange={async (ceremonyOrder) => {
              const conflict = ceremonyOrderConflict(ceremonyOrder, category.id);
              if (conflict) throw new Error(conflict);
              await updateCategory(category.id, { ceremonyOrder });
              onRefresh();
            }}
            onToggleActive={async () => {
              await updateCategory(category.id, { active: !category.active });
              onRefresh();
            }}
            onDelete={() => removeCategory(category)}
          />
        ))}
      </div>
      <div className="setup-section">
        <PageHeader eyebrow="CSV Registration Import" title="Category Matching Rules" compact />
        <p className="setup-description">
          Match the CSV vehicle type identifier and optional inclusive year range to a category. Year ranges for the
          same identifier cannot overlap.
        </p>
        <datalist id="csv-vehicle-identifiers">
          <option value="car" />
          <option value="truck" />
          <option value="bike" />
          <option value="van-suv" />
          <option value="custom" />
        </datalist>
        <div className="import-rule-grid">
          {categories.map((category) => (
            <CategoryImportRule
              key={category.id}
              category={category}
              canEdit={staff.role === "ADMIN"}
              onSaved={onRefresh}
              onError={setError}
            />
          ))}
        </div>
      </div>
      <div className="setup-section">
        <PageHeader eyebrow="Event-Wide Voting" title="Special Awards" />
        {staff.role === "ADMIN" ? (
          <form className="inline-form inline-form-stacked" onSubmit={addSpecialAward}>
            <input
              value={specialAwardName}
              onChange={(event) => setSpecialAwardName(event.target.value)}
              placeholder="New special award name"
            />
            <input
              value={specialAwardDescription}
              onChange={(event) => setSpecialAwardDescription(event.target.value)}
              placeholder="Optional description"
            />
            <Button type="submit">
              <Plus size={20} />
              Add Special Award
            </Button>
          </form>
        ) : null}
        <div className="category-grid">
          {specialAwards.map((specialAward) => (
            <SpecialAwardCard
              key={specialAward.id}
              specialAward={specialAward}
              canEdit={staff.role === "ADMIN"}
              onRename={async (specialAwardName) => {
                await updateSpecialAward(specialAward.id, { name: specialAwardName });
                onRefresh();
              }}
              onCeremonyOrderChange={async (ceremonyOrder) => {
                const conflict = ceremonyOrderConflict(ceremonyOrder, specialAward.id);
                if (conflict) throw new Error(conflict);
                await updateSpecialAward(specialAward.id, { ceremonyOrder });
                onRefresh();
              }}
              onToggleActive={async () => {
                await updateSpecialAward(specialAward.id, { active: !specialAward.active });
                onRefresh();
              }}
              onDelete={() => removeSpecialAward(specialAward)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryImportRule({
  category,
  canEdit,
  onSaved,
  onError,
}: {
  category: Category;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [identifier, setIdentifier] = useState(category.importIdentifier ?? "");
  const [yearMin, setYearMin] = useState(category.importYearMin?.toString() ?? "");
  const [yearMax, setYearMax] = useState(category.importYearMax?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function saveRule() {
    setSaving(true);
    onError("");
    try {
      await updateCategory(category.id, {
        importIdentifier: identifier.trim().toLowerCase() || null,
        importYearMin: yearMin ? Number(yearMin) : null,
        importYearMax: yearMax ? Number(yearMax) : null,
      });
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save import rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="import-rule-card">
      <strong>{category.name}</strong>
      <label>
        CSV identifier
        <input
          list="csv-vehicle-identifiers"
          value={identifier}
          disabled={!canEdit}
          placeholder="Not matched"
          onChange={(event) => setIdentifier(event.target.value)}
        />
      </label>
      <div className="import-year-range">
        <label>
          Minimum year
          <input
            type="number"
            min="1900"
            max="2100"
            value={yearMin}
            disabled={!canEdit}
            placeholder="Any"
            onChange={(event) => setYearMin(event.target.value)}
          />
        </label>
        <label>
          Maximum year
          <input
            type="number"
            min="1900"
            max="2100"
            value={yearMax}
            disabled={!canEdit}
            placeholder="Any"
            onChange={(event) => setYearMax(event.target.value)}
          />
        </label>
      </div>
      <Button variant="secondary" disabled={!canEdit || saving} onClick={() => void saveRule()}>
        <Save size={18} />
        {saving ? "Saving" : "Save Rule"}
      </Button>
    </article>
  );
}

function SpecialAwardCard({
  specialAward,
  canEdit,
  onRename,
  onCeremonyOrderChange,
  onToggleActive,
  onDelete,
}: {
  specialAward: SpecialAward;
  canEdit: boolean;
  onRename: (name: string) => Promise<void>;
  onCeremonyOrderChange: (ceremonyOrder: number | null) => Promise<void>;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(specialAward.name);
  const [ceremonyOrder, setCeremonyOrder] = useState(specialAward.ceremonyOrder?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");

  useEffect(() => {
    if (!editing) setName(specialAward.name);
  }, [editing, specialAward.name]);

  useEffect(() => {
    setCeremonyOrder(specialAward.ceremonyOrder?.toString() ?? "");
  }, [specialAward.ceremonyOrder]);

  function cancelEditing() {
    setName(specialAward.name);
    setRenameError("");
    setEditing(false);
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setRenameError("Special award name is required.");
      return;
    }
    if (trimmedName === specialAward.name) {
      cancelEditing();
      return;
    }

    setSaving(true);
    setRenameError("");
    try {
      await onRename(trimmedName);
      setEditing(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Could not rename special award");
    } finally {
      setSaving(false);
    }
  }

  async function saveCeremonyOrder() {
    const trimmedOrder = ceremonyOrder.trim();
    const nextOrder = trimmedOrder ? Number(trimmedOrder) : null;
    if (nextOrder !== null && (!Number.isInteger(nextOrder) || nextOrder < 1)) {
      setRenameError("Ceremony order must be a whole number.");
      setCeremonyOrder(specialAward.ceremonyOrder?.toString() ?? "");
      return;
    }
    if ((specialAward.ceremonyOrder ?? null) === nextOrder) return;

    setSaving(true);
    setRenameError("");
    try {
      await onCeremonyOrderChange(nextOrder);
    } catch (error) {
      setCeremonyOrder(specialAward.ceremonyOrder?.toString() ?? "");
      setRenameError(error instanceof Error ? error.message : "Could not save ceremony order");
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
              aria-label={`Special award name for ${specialAward.name}`}
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
          <strong>{specialAward.name}</strong>
        )}
        {specialAward.description ? <span>{specialAward.description}</span> : null}
        <span>{specialAward._count?.votes ?? 0} votes</span>
        {canEdit ? (
          <label className="category-ceremony-order">
            <span>Ceremony #</span>
            <input
              type="number"
              min="1"
              max="999"
              value={ceremonyOrder}
              disabled={editing || saving}
              aria-label={`Ceremony order for ${specialAward.name}`}
              onChange={(event) => setCeremonyOrder(event.target.value)}
              onBlur={() => void saveCeremonyOrder()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setCeremonyOrder(specialAward.ceremonyOrder?.toString() ?? "");
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
        ) : specialAward.ceremonyOrder ? (
          <span>Ceremony #{specialAward.ceremonyOrder}</span>
        ) : null}
        {renameError ? <span className="form-error">{renameError}</span> : null}
      </div>
      <div className="card-actions">
        {canEdit ? (
          <Button
            variant="secondary"
            disabled={editing || saving}
            onClick={() => {
              setRenameError("");
              setEditing(true);
            }}
          >
            <Pencil size={18} />
            Edit
          </Button>
        ) : null}
        <Button variant="secondary" disabled={!canEdit || editing || saving} onClick={onToggleActive}>
          {specialAward.active ? "Active" : "Inactive"}
        </Button>
        <Button
          variant="secondary"
          disabled={!canEdit || editing || saving || Boolean(specialAward._count?.votes)}
          onClick={onDelete}
        >
          <Trash2 size={18} />
        </Button>
      </div>
    </article>
  );
}
