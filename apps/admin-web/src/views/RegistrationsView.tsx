import { AlertTriangle, Check, Plus, Upload, X } from "lucide-react";
import { Alert, Button, PageHeader, RegistrationRow, SearchBox } from "@carshow/carshow-components";
import type { Category, Registration } from "@carshow/carshow-components";
import { useRef, useState } from "react";
import { ApiError, importRegistrationsCsv, previewRegistrationsCsv, type RegistrationCsvPreviewRow } from "../api";
import { RegistrationEditor } from "../organisms/RegistrationEditor";

type CsvImportIssue = {
  entryNumber?: number;
  reason: string;
};

type CsvImportDetails = {
  photosAttempted: number;
  photosImported: number;
  photosFailed: number;
  issues: CsvImportIssue[];
};

async function copyLinesToClipboard(lines: string[]) {
  const text = lines.join("\n");
  await navigator.clipboard.writeText(text);
}

function extractCsvIssues(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details;
  if (!details || typeof details !== "object") return [];

  const list: string[] = [];
  const asRecord = details as Record<string, unknown>;

  const photoFailures = asRecord.photoFailures;
  if (Array.isArray(photoFailures)) {
    for (const failure of photoFailures) {
      if (!failure || typeof failure !== "object") continue;
      const entryNumber = (failure as Record<string, unknown>).entryNumber;
      const reason = (failure as Record<string, unknown>).reason;
      if (typeof reason === "string") {
        list.push(typeof entryNumber === "number" ? `Entry ${entryNumber}: ${reason}` : reason);
      }
    }
  }

  const issues = asRecord.issues;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (!issue || typeof issue !== "object") continue;
      const path = (issue as Record<string, unknown>).path;
      const message = (issue as Record<string, unknown>).message;
      if (typeof message === "string") {
        const prefix = Array.isArray(path) && path.length ? `${path.join(".")}: ` : "";
        list.push(`${prefix}${message}`);
      }
    }
  }

  return list;
}

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
  const [importDetails, setImportDetails] = useState<CsvImportDetails | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<RegistrationCsvPreviewRow[]>([]);
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, string>>({});
  const [ownerGroupAssignments, setOwnerGroupAssignments] = useState<Record<string, string>>({});
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
    setImportErrorDetails([]);
    setImportDetails(null);
    setCopyFeedback("");
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
      setOwnerGroupAssignments(
        Object.fromEntries(result.rows.map((row) => [String(row.entryNumber), row.suggestedOwnerGroup])),
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not preview CSV");
      setImportErrorDetails(extractCsvIssues(error));
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
    setOwnerGroupAssignments({});
  }

  async function confirmImport() {
    if (!importCsvText || previewRows.some((row) => !categoryAssignments[String(row.entryNumber)])) return;
    setImporting(true);
    setImportError("");
    setImportErrorDetails([]);
    setImportDetails(null);
    setCopyFeedback("");
    try {
      const result = await importRegistrationsCsv(importCsvText, categoryAssignments, ownerGroupAssignments);
      closePreview();
      setShowNewEditor(false);
      onSelect(null);
      onRefresh();
      setImportMessage(result.message);
      setImportDetails({
        photosAttempted: result.photosAttempted,
        photosImported: result.photosImported,
        photosFailed: result.photosFailed,
        issues: result.photoFailures.map((failure) => ({
          entryNumber: failure.entryNumber,
          reason: failure.reason,
        })),
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import CSV");
      setImportErrorDetails(extractCsvIssues(error));
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
        {importDetails && (importDetails.photosAttempted > 0 || importDetails.issues.length > 0) ? (
          <Alert variant={importDetails.photosFailed > 0 ? "danger" : "success"}>
            <strong>Imported photo links</strong>
            <div>
              {importDetails.photosImported} of {importDetails.photosAttempted} were imported and set as primary.
            </div>
            {importDetails.issues.length ? (
              <>
                <div className="header-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void copyLinesToClipboard(
                        importDetails.issues.map((issue) =>
                          issue.entryNumber ? `Entry ${issue.entryNumber}: ${issue.reason}` : issue.reason,
                        ),
                      )
                        .then(() => setCopyFeedback("Photo errors copied"))
                        .catch(() => setCopyFeedback("Could not copy photo errors"));
                    }}
                  >
                    Copy errors
                  </Button>
                </div>
                <ul>
                  {importDetails.issues.map((issue, index) => (
                    <li key={`${issue.entryNumber ?? "issue"}-${index}`}>
                      {issue.entryNumber ? `Entry ${issue.entryNumber}: ` : ""}
                      {issue.reason}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Alert>
        ) : null}
        {importError ? <Alert variant="danger">{importError}</Alert> : null}
        {importErrorDetails.length ? (
          <Alert variant="danger">
            <strong>CSV import details</strong>
            <div className="header-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  void copyLinesToClipboard(importErrorDetails)
                    .then(() => setCopyFeedback("CSV errors copied"))
                    .catch(() => setCopyFeedback("Could not copy CSV errors"));
                }}
              >
                Copy errors
              </Button>
            </div>
            <ul>
              {importErrorDetails.map((detail, index) => (
                <li key={`${detail}-${index}`}>{detail}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {copyFeedback ? <Alert variant="info">{copyFeedback}</Alert> : null}
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
            ownerGroupAssignments={ownerGroupAssignments}
            importing={importing}
            onAssign={(entryNumber, categoryId) =>
              setCategoryAssignments((current) => ({ ...current, [String(entryNumber)]: categoryId }))
            }
            onToggleSeparateOwner={(row, separate) =>
              setOwnerGroupAssignments((current) => ({
                ...current,
                [String(row.entryNumber)]: separate ? `entry:${row.entryNumber}` : row.suggestedOwnerGroup,
              }))
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
            assigned by an admin before the import can continue. Existing owner and vehicle details are preserved.
            A WebGuide photo is imported and set as primary only when that vehicle does not already have a photo.
          </p>
        </div>
        <div>
          <strong>How owners are grouped</strong>
          <p>
            Rows are linked to one owner only when both normalized email and phone match. Names are never used for
            matching. Multi-vehicle groups appear in the preview and can be split before import.
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
  ownerGroupAssignments,
  importing,
  onAssign,
  onToggleSeparateOwner,
  onCancel,
  onConfirm,
}: {
  categories: Category[];
  rows: RegistrationCsvPreviewRow[];
  assignments: Record<string, string>;
  ownerGroupAssignments: Record<string, string>;
  importing: boolean;
  onAssign: (entryNumber: number, categoryId: string) => void;
  onToggleSeparateOwner: (row: RegistrationCsvPreviewRow, separate: boolean) => void;
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
              <th>Owner grouping</th>
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
                    <strong>{row.ownerName}</strong>
                    <span>{row.ownerEmail || "No email"} · {row.ownerPhone}</span>
                    {row.existingOwner ? (
                      <span>
                        Will join {row.existingOwner.name} ({row.existingOwner.vehicleCount} existing vehicle
                        {row.existingOwner.vehicleCount === 1 ? "" : "s"})
                      </span>
                    ) : row.suggestedOwnerGroupSize > 1 ? (
                      <span>Grouped with {row.suggestedOwnerGroupSize - 1} other CSV vehicle(s)</span>
                    ) : null}
                    {row.suggestedOwnerGroupSize > 1 || row.existingOwner ? (
                      <label className="csv-owner-split">
                        <input
                          type="checkbox"
                          checked={ownerGroupAssignments[String(row.entryNumber)] === `entry:${row.entryNumber}`}
                          onChange={(event) => onToggleSeparateOwner(row, event.target.checked)}
                        />
                        Keep as separate owner
                      </label>
                    ) : (
                      <span>New separate owner</span>
                    )}
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
