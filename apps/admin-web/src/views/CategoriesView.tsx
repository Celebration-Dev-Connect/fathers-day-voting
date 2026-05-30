import { Plus } from "lucide-react";
import { Alert, Button, CategoryCard, PageHeader } from "@carshow/carshow-components";
import type { Category, StaffUser } from "@carshow/carshow-components";
import { FormEvent, useState } from "react";
import { createCategory, updateCategory } from "../api";

export function CategoriesView({
  staff,
  categories,
  onRefresh,
}: {
  staff: StaffUser;
  categories: Category[];
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
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
          />
        ))}
      </div>
    </section>
  );
}
