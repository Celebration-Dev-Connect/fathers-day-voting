import { Plus } from "lucide-react";
import { Button, PageHeader, RegistrationRow, SearchBox } from "@carshow/carshow-components";
import type { Category, Registration } from "@carshow/carshow-components";
import { RegistrationEditor } from "../organisms/RegistrationEditor";

export function RegistrationsView({
  categories,
  registrations,
  search,
  selected,
  onSearch,
  onSelect,
  onRefresh,
}: {
  categories: Category[];
  registrations: Registration[];
  search: string;
  selected: Registration | null;
  onSearch: (value: string) => void;
  onSelect: (registration: Registration | null) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="registrations-layout">
      <div className="list-panel">
        <PageHeader
          eyebrow="Registration Table"
          title="Staff Registrations"
          compact
          actions={
            <Button onClick={() => onSelect(null)}>
              <Plus size={20} />
              New
            </Button>
          }
        />
        <SearchBox
          value={search}
          placeholder="Search owner, phone, plate, entry, QR..."
          onChange={onSearch}
        />
        <div className="registration-list">
          {registrations.map((registration) => (
            <RegistrationRow
              key={registration.id}
              registration={registration}
              selected={selected?.id === registration.id}
              onClick={() => onSelect(registration)}
            />
          ))}
          {!registrations.length ? <div className="empty-state">No registrations found.</div> : null}
        </div>
      </div>
      <RegistrationEditor
        key={selected?.id ?? "new"}
        categories={categories}
        registration={selected}
        onSaved={(registration) => {
          onSelect(registration);
          onRefresh();
        }}
      />
    </section>
  );
}
