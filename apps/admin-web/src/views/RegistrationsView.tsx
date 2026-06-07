import { AlertTriangle, Check, Plus, Upload, X } from "lucide-react";
import { Alert, Button, PageHeader, RegistrationRow, SearchBox } from "@carshow/carshow-components";
import type { Category, Registration } from "@carshow/carshow-components";
import { useRef, useState } from "react";
import { importRegistrationsCsv, previewRegistrationsCsv, type RegistrationCsvPreviewRow } from "../api";
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
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<RegistrationCsvPreviewRow[]>([]);
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectRegistration(registration: Registration) {
    setShowNewEditor(false);
    onSelect(selected?.id === registration.id ? null : registration);
  }

  async function previewCsv(file: File | null) {
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    setImportError("");
    try {
      const csvText = await file.text();
      const result = await previewRegistrationsCsv(csvText);
      setImportCsvText(csvText);
      setPreviewRows(result.rows);
      setCategoryAssignments(
        Object.fromEntries(
          result.rows
            .filter((row) => row.matchedCategoryIds.length === 1)
            .map((row) => [String(row.entryNumber), row.matchedCategoryIds[0]]),
        ),
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not preview CSV");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function closePreview() {
    setShowImportGuide(false);
    setImportCsvText("");
    setPreviewRows([]);
    setCategoryAssignments({});
  }

  async function confirmImport() {
    if (!importCsvText || previewRows.some((row) => !categoryAssignments[String(row.entryNumber)])) return;
    setImporting(true);
    setImportError("");
    try {
      const result = await importRegistrationsCsv(importCsvText, categoryAssignments);
      closePreview();
      setShowNewEditor(false);
      onSelect(null);
      onRefresh();
      setImportMessage(result.message);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import CSV");
    } finally {
      setImporting(false);
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
                onChange={(event) => void previewCsv(event.target.files?.[0] ?? null)}
              />
              <Button variant="secondary" disabled={importing} onClick={() => setShowImportGuide(true)}>
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
        {showImportGuide && !previewRows.length ? (
          <CsvImportGuide
            categories={categories}
            onCancel={() => setShowImportGuide(false)}
            onChooseFile={() => fileInputRef.current?.click()}
          />
        ) : null}
        {previewRows.length ? (
          <CsvImportPreview
            categories={categories}
            rows={previewRows}
            assignments={categoryAssignments}
            importing={importing}
            onAssign={(entryNumber, categoryId) =>
              setCategoryAssignments((current) => ({ ...current, [String(entryNumber)]: categoryId }))
            }
            onCancel={closePreview}
            onConfirm={() => void confirmImport()}
          />
        ) : null}
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

function CsvImportGuide({
  categories,
  onCancel,
  onChooseFile,
}: {
  categories: Category[];
  onCancel: () => void;
  onChooseFile: () => void;
}) {
  const mappedCategories = categories.filter((category) => category.importIdentifier);
  return (
    <section className="csv-preview">
      <div className="csv-preview-header">
        <div>
          <p className="eyebrow">Before Importing</p>
          <h2>Category Mapping Decision</h2>
          <span>CSV rows are previewed first. Nothing is saved until you confirm the reviewed assignments.</span>
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={onCancel}>
            <X size={18} />
            Cancel
          </Button>
          <Button onClick={onChooseFile}>
            <Upload size={18} />
            Choose CSV
          </Button>
        </div>
      </div>
      <div className="csv-import-guide">
        <div>
          <strong>How a category is chosen</strong>
          <p>
            Each CSV vehicle type is matched against the Category Matching Rules. For car categories, the year range
            decides whether a vehicle is Antique, Classic, Modern, or another configured category.
          </p>
        </div>
        <div>
          <strong>What happens after upload</strong>
          <p>
            The preview marks each row as matched, unmatched, or conflicting. Any row without a clear match must be
            assigned by an admin before the import can continue.
          </p>
        </div>
        <div>
          <strong>Current matching rules</strong>
          {mappedCategories.length ? (
            <div className="csv-rule-summary">
              {mappedCategories.map((category) => (
                <span key={category.id}>
                  {category.name}: {category.importIdentifier}
                  {category.importYearMin || category.importYearMax
                    ? `, ${category.importYearMin ?? "any"}-${category.importYearMax ?? "any"}`
                    : ""}
                </span>
              ))}
            </div>
          ) : (
            <p>No category matching rules are configured yet. Add them on the Categories page before importing.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function CsvImportPreview({
  categories,
  rows,
  assignments,
  importing,
  onAssign,
  onCancel,
  onConfirm,
}: {
  categories: Category[];
  rows: RegistrationCsvPreviewRow[];
  assignments: Record<string, string>;
  importing: boolean;
  onAssign: (entryNumber: number, categoryId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const unresolved = rows.filter((row) => !assignments[String(row.entryNumber)]).length;
  return (
    <section className="csv-preview">
      <div className="csv-preview-header">
        <div>
          <p className="eyebrow">Import Preview</p>
          <h2>{rows.length} registrations</h2>
          <span>{unresolved ? `${unresolved} need a category` : "All registrations are ready"}</span>
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={onCancel}>
            <X size={18} />
            Cancel
          </Button>
          <Button disabled={Boolean(unresolved) || importing} onClick={onConfirm}>
            <Check size={18} />
            {importing ? "Importing" : "Confirm Import"}
          </Button>
        </div>
      </div>
      <div className="csv-preview-table-wrap">
        <table className="csv-preview-table">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Vehicle</th>
              <th>CSV Identifier</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const assignment = assignments[String(row.entryNumber)] ?? "";
              return (
                <tr key={row.entryNumber} className={!assignment ? "csv-row-unresolved" : undefined}>
                  <td>#{row.entryNumber}</td>
                  <td>
                    <strong>{row.vehicleName}</strong>
                    <span>{row.ownerName}</span>
                  </td>
                  <td>
                    <strong>{row.vehicleType}</strong>
                    <span>{row.year}</span>
                  </td>
                  <td>
                    <label className="csv-category-select">
                      {!assignment ? <AlertTriangle size={16} /> : null}
                      <select value={assignment} onChange={(event) => onAssign(row.entryNumber, event.target.value)}>
                        <option value="">Choose category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
