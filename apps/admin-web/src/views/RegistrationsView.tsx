import { Plus } from "lucide-react";
import { Button, PageHeader, RegistrationRow, SearchBox } from "@carshow/carshow-components";
import type { Category, Registration } from "@carshow/carshow-components";
import { useState } from "react";
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
  const [showNewEditor, setShowNewEditor] = useState(false);

  function selectRegistration(registration: Registration) {
    setShowNewEditor(false);
    onSelect(registration);
  }

  return (
    <section className="registrations-layout">
      <div className="list-panel">
        <PageHeader
          eyebrow="Registration Table"
          title="Staff Registrations"
          compact
          actions={
            <Button
              onClick={() => {
                onSelect(null);
                setShowNewEditor(true);
              }}
            >
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
          {showNewEditor ? (
            <div className="registration-detail-row">
              <RegistrationEditor
                key="new"
                categories={categories}
                registration={null}
                onSaved={(registration) => {
                  setShowNewEditor(false);
                  onSelect(registration);
                  onRefresh();
                }}
              />
            </div>
          ) : null}
          {registrations.map((registration) => (
            <div className="registration-list-item" key={registration.id}>
              <RegistrationRow
                registration={registration}
                selected={selected?.id === registration.id}
                onClick={() => selectRegistration(registration)}
              />
              {selected?.id === registration.id ? (
                <div className="registration-detail-row">
                  <RegistrationEditor
                    key={selected.id}
                    categories={categories}
                    registration={selected}
                    onSaved={(savedRegistration) => {
                      setShowNewEditor(false);
                      onSelect(savedRegistration);
                      onRefresh();
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
          {!registrations.length ? <div className="empty-state">No registrations found.</div> : null}
        </div>
      </div>
    </section>
  );
}
