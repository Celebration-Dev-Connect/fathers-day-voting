import { AlertTriangle, Check, Mail, Plus, RefreshCw, Upload, X } from "lucide-react";
import { Alert, Button, PageHeader, Pagination, RegistrationRow, SearchBox } from "@carshow/carshow-components";
import type { Category, Registration, StaffUser } from "@carshow/carshow-components";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  getLatestRegistrationImport,
  getRegistrationImport,
  importRegistrationsCsv,
  previewRegistrationsCsv,
  retryFailedRegistrationImport,
  sendBulkOwnerInviteEmails,
  type RegistrationCsvPreviewRow,
  type RegistrationImportJob,
  type RegistrationImportItemStatus,
} from "../api";
import { RegistrationEditor } from "../organisms/RegistrationEditor";

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
  staff,
  categories,
  registrations,
  search,
  selected,
  onSearch,
  onSelect,
  onRefresh,
}: {
  staff: StaffUser;
  categories: Category[];
  registrations: Registration[];
  search: string;
  selected: Registration | null;
  onSearch: (value: string) => void;
  onSelect: (registration: Registration | null) => void;
  onRefresh: () => void;
}) {
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [showNewEditor, setShowNewEditor] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<RegistrationCsvPreviewRow[]>([]);
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, string>>({});
  const [ownerGroupAssignments, setOwnerGroupAssignments] = useState<Record<string, string>>({});
  const [activeImport, setActiveImport] = useState<RegistrationImportJob | null>(null);
  const [showImportProgress, setShowImportProgress] = useState(false);
  const [sendingBulkEmail, setSendingBulkEmail] = useState(false);
  const [showSendAllConfirm, setShowSendAllConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPage(0);
  }, [registrations]);

  useEffect(() => {
    if (staff.role !== "ADMIN") return;
    getLatestRegistrationImport()
      .then(({ job }) => {
        setActiveImport(job);
        setShowImportProgress(Boolean(job && ["PENDING", "PROCESSING"].includes(job.status)));
      })
      .catch(() => {});
  }, [staff.role]);

  useEffect(() => {
    if (!activeImport || !["PENDING", "PROCESSING"].includes(activeImport.status)) return;
    const interval = window.setInterval(() => {
      getRegistrationImport(activeImport.id)
        .then(({ job }) => {
          setActiveImport(job);
          if (!["PENDING", "PROCESSING"].includes(job.status)) onRefresh();
        })
        .catch((error) => setImportError(error instanceof Error ? error.message : "Could not refresh import status"));
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeImport?.id, activeImport?.status, onRefresh]);

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
    setCopyFeedback("");
    try {
      const csvText = await file.text();
      const result = await previewRegistrationsCsv(csvText);
      setImportCsvText(csvText);
      setImportFileName(file.name);
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
    setImportFileName("");
    setPreviewRows([]);
    setCategoryAssignments({});
    setOwnerGroupAssignments({});
  }

  async function confirmImport() {
    if (!importCsvText || previewRows.some((row) => !categoryAssignments[String(row.entryNumber)])) return;
    setImporting(true);
    setImportError("");
    setImportErrorDetails([]);
    setCopyFeedback("");
    try {
      const result = await importRegistrationsCsv(
        importCsvText,
        categoryAssignments,
        ownerGroupAssignments,
        importFileName,
      );
      closePreview();
      setShowNewEditor(false);
      onSelect(null);
      onRefresh();
      setImportMessage("Import started. You can leave this page while it continues.");
      setActiveImport(result.job);
      setShowImportProgress(true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import CSV");
      setImportErrorDetails(extractCsvIssues(error));
    } finally {
      setImporting(false);
    }
  }

  async function sendAllEmails() {
    setSendingBulkEmail(true);
    setImportMessage("");
    setImportError("");
    try {
      const result = await sendBulkOwnerInviteEmails();
      const parts = [`${result.sent} email${result.sent === 1 ? "" : "s"} sent`];
      if (result.alreadySent) parts.push(`${result.alreadySent} already sent`);
      if (result.skipped) parts.push(`${result.skipped} skipped (no email)`);
      if (result.errors) parts.push(`${result.errors} failed`);
      setImportMessage(parts.join(" · "));
    } catch (emailError) {
      setImportError(emailError instanceof Error ? emailError.message : "Bulk email failed");
    } finally {
      setSendingBulkEmail(false);
    }
  }

  const pageCount = Math.ceil(registrations.length / PAGE_SIZE);
  const pagedRegistrations = registrations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
              <Button
                variant="secondary"
                disabled={sendingBulkEmail || staff.role !== "ADMIN"}
                onClick={() => setShowSendAllConfirm(true)}
              >
                <Mail size={20} />
                {sendingBulkEmail ? "Sending..." : "Send All Emails"}
              </Button>
              <Button
                variant="secondary"
                disabled={importing || staff.role !== "ADMIN"}
                onClick={() => setShowImportGuide(true)}
              >
                <Upload size={20} />
                {importing ? "Importing" : "Import CSV"}
              </Button>
              {activeImport && !showImportProgress ? (
                <Button variant="secondary" onClick={() => setShowImportProgress(true)}>
                  Import Status
                </Button>
              ) : null}
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
        {activeImport && showImportProgress ? (
          <RegistrationImportStatus
            job={activeImport}
            retrying={importing}
            onClose={() => setShowImportProgress(false)}
            onRetry={() => {
              setImporting(true);
              retryFailedRegistrationImport(activeImport.id)
                .then(({ job }) => setActiveImport(job))
                .catch((error) => setImportError(error instanceof Error ? error.message : "Could not retry import"))
                .finally(() => setImporting(false));
            }}
          />
        ) : null}
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
          {pagedRegistrations.map((registration) => (
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
          <Pagination
            page={page}
            pageCount={pageCount}
            total={registrations.length}
            pageSize={PAGE_SIZE}
            onChange={(p) => { setPage(p); onSelect(null); }}
          />
        </div>
      </div>
      {showSendAllConfirm ? (
        <div className="import-status-overlay" role="presentation" onClick={() => setShowSendAllConfirm(false)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm send all emails"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="confirm-dialog-title">Send All Access Code Emails?</h2>
            <p className="confirm-dialog-body">
              This will send the owner access code email to every owner who has an email address on file and hasn't received one yet. This cannot be undone.
            </p>
            <div className="confirm-dialog-actions">
              <Button variant="secondary" onClick={() => setShowSendAllConfirm(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowSendAllConfirm(false);
                  void sendAllEmails();
                }}
              >
                <Mail size={18} />
                Send All Emails
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function importStatusLabel(status: RegistrationImportItemStatus) {
  return status.toLowerCase().replace("_", " ");
}

function RegistrationImportStatus({
  job,
  retrying,
  onClose,
  onRetry,
}: {
  job: RegistrationImportJob;
  retrying: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const finishedRegistrations = job.counts.registrationsCompleted + job.counts.registrationsFailed;
  const finishedPhotos = job.counts.photosCompleted + job.counts.photosFailed + job.counts.photosSkipped;
  const totalSteps = job.totalItems * 2;
  const percent = totalSteps ? Math.round(((finishedRegistrations + finishedPhotos) / totalSteps) * 100) : 0;
  const hasFailures = job.counts.registrationsFailed > 0 || job.counts.photosFailed > 0;
  const canRetry = hasFailures || job.status === "FAILED";

  return (
    <div className="import-status-overlay" role="presentation" onClick={onClose}>
      <section
        className="csv-preview import-status-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Registration import status"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="csv-preview-header">
          <div>
            <p className="eyebrow">Import Status</p>
            <h2>{job.sourceFileName || `${job.totalItems} registrations`}</h2>
            <span>
              {job.status.toLowerCase().replaceAll("_", " ")} · {percent}% complete
            </span>
          </div>
          <div className="header-actions">
            {canRetry && !["PENDING", "PROCESSING"].includes(job.status) ? (
              <Button variant="secondary" disabled={retrying} onClick={onRetry}>
                <RefreshCw size={18} />
                Retry failed items
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              <X size={18} />
              Close
            </Button>
          </div>
        </div>
        <div className="import-progress-track" aria-label={`${percent}% complete`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="import-status-summary">
          <span>Registrations: {job.counts.registrationsCompleted}/{job.totalItems}</span>
          <span>Photos imported: {job.counts.photosCompleted}</span>
          <span>Photos skipped: {job.counts.photosSkipped}</span>
          <span>Failures: {job.counts.registrationsFailed + job.counts.photosFailed}</span>
        </div>
        {job.errorMessage ? <Alert variant="danger">{job.errorMessage}</Alert> : null}
        <div className="csv-preview-table-wrap">
          <table className="csv-preview-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Registration</th>
                <th>Photo</th>
              </tr>
            </thead>
            <tbody>
              {job.items.map((item) => (
                <tr key={item.id}>
                  <td>#{item.entryNumber}</td>
                  <td>
                    <strong className={`import-item-status ${item.registrationStatus.toLowerCase()}`}>
                      {importStatusLabel(item.registrationStatus)}
                    </strong>
                    <span>{item.registrationMessage || "Waiting"}</span>
                  </td>
                  <td>
                    <strong className={`import-item-status ${item.photoStatus.toLowerCase()}`}>
                      {importStatusLabel(item.photoStatus)}
                    </strong>
                    <span>{item.photoMessage || "Waiting"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
