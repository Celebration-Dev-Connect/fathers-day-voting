import { Plus, Upload } from "lucide-react";
import { Alert, Button, PageHeader, RegistrationRow, SearchBox } from "@carshow/carshow-components";
import type { Category, Registration } from "@carshow/carshow-components";
import { useRef, useState } from "react";
import { importRegistrationsCsv } from "../api";
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
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectRegistration(registration: Registration) {
    setShowNewEditor(false);
    onSelect(selected?.id === registration.id ? null : registration);
  }

  async function importCsv(file: File | null) {
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    setImportError("");
    try {
      const result = await importRegistrationsCsv(file);
      setShowNewEditor(false);
      onSelect(null);
      onRefresh();
      setImportMessage(result.message);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import CSV");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="registrations-layout">
      <div className="list-panel">
        <PageHeader
          eyebrow="Registration Table"
          title="Staff Registrations"
          compact
          actions={
            <div className="header-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="visually-hidden"
                onChange={(event) => void importCsv(event.target.files?.[0] ?? null)}
              />
              <Button variant="secondary" disabled={importing} onClick={() => fileInputRef.current?.click()}>
                <Upload size={20} />
                {importing ? "Importing" : "Import CSV"}
              </Button>
              <Button
                onClick={() => {
                  onSelect(null);
                  setShowNewEditor(true);
                }}
              >
                <Plus size={20} />
                New
              </Button>
            </div>
          }
        />
        {importMessage ? <Alert variant="success">{importMessage}</Alert> : null}
        {importError ? <Alert variant="danger">{importError}</Alert> : null}
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
                onCancel={() => {
                  setShowNewEditor(false);
                  onSelect(null);
                }}
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
                    onCancel={() => onSelect(null)}
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
