import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, CategoryCard, PageHeader } from "@carshow/carshow-components";
import type { Category, SpecialAward, StaffUser } from "@carshow/carshow-components";
import { FormEvent, useState } from "react";
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
            onToggleActive={async () => {
              await updateCategory(category.id, { active: !category.active });
              onRefresh();
            }}
            onDelete={() => removeCategory(category)}
          />
        ))}
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

function SpecialAwardCard({
  specialAward,
  canEdit,
  onToggleActive,
  onDelete,
}: {
  specialAward: SpecialAward;
  canEdit: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="category-card">
      <div>
        <strong>{specialAward.name}</strong>
        {specialAward.description ? <span>{specialAward.description}</span> : null}
        <span>{specialAward._count?.votes ?? 0} votes</span>
      </div>
      <div className="card-actions">
        <Button variant="secondary" disabled={!canEdit} onClick={onToggleActive}>
          {specialAward.active ? "Active" : "Inactive"}
        </Button>
        <Button variant="secondary" disabled={!canEdit || Boolean(specialAward._count?.votes)} onClick={onDelete}>
          <Trash2 size={18} />
        </Button>
      </div>
    </article>
  );
}
