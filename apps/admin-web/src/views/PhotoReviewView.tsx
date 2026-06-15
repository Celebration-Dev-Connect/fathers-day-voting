import { ArrowLeft, Check, ImageOff, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Alert, Button, PageHeader, Pagination, formatDateTime } from "@carshow/carshow-components";
import type { PhotoModerationStatus, PhotoReviewItem } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { getPhotoReviewImageUrl, listPhotoReviews, type PhotoReviewQueue, updatePhotoReviewStatus } from "../api";

const QUEUES: Array<{ key: PhotoReviewQueue; label: string }> = [
  { key: "needs-review", label: "Needs Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function vehicleTitle(photo: PhotoReviewItem) {
  const vehicle = photo.vehicleEntry;
  const nickname = vehicle.nickname ? ` - "${vehicle.nickname}"` : "";
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}${nickname}`;
}

function ownerName(photo: PhotoReviewItem) {
  return `${photo.vehicleEntry.owner.firstName} ${photo.vehicleEntry.owner.lastName}`;
}

function statusLabel(status: PhotoModerationStatus) {
  return status.replace("_", " ");
}

function statusTone(status: PhotoModerationStatus) {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "HUMAN_REVIEW" || status === "FAILED") return "review";
  return "pending";
}

function labelSummary(labels: unknown) {
  if (!labels) return "No AI labels recorded";
  if (typeof labels !== "object") return String(labels);
  const value = labels as {
    moderation?: Array<{ name?: string; confidence?: number }>;
    vehicle?: Array<{ name?: string; confidence?: number }>;
    error?: string;
  };
  if (value.error) return value.error;
  const moderation = value.moderation?.slice(0, 3).map((item) => item.name).filter(Boolean) ?? [];
  const vehicle = value.vehicle?.slice(0, 3).map((item) => item.name).filter(Boolean) ?? [];
  const parts = [
    moderation.length ? `Moderation: ${moderation.join(", ")}` : "",
    vehicle.length ? `Vehicle: ${vehicle.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "No AI labels recorded";
}

function PhotoPreview({ photo, large = false }: { photo: PhotoReviewItem; large?: boolean }) {
  // Prefer the original public URL when it exists. Generated variants are
  // smaller, but older variants may not have EXIF orientation baked in.
  const directUrl = photo.url ?? (large ? photo.mediumUrl : photo.thumbUrl ?? photo.mediumUrl);
  const [previewUrl, setPreviewUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    let nextUrl = "";
    setFailed(false);
    setPreviewUrl("");

    if (directUrl) {
      setPreviewUrl(directUrl);
    } else {
      getPhotoReviewImageUrl(photo.id)
        .then((url) => {
          nextUrl = url;
          if (!ignore) setPreviewUrl(url);
        })
        .catch(() => {
          if (!ignore) setFailed(true);
        });
    }

    return () => {
      ignore = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [directUrl, photo.id]);

  async function handleImageError() {
    if (!directUrl || previewUrl.startsWith("blob:")) {
      setFailed(true);
      return;
    }
    try {
      setPreviewUrl(await getPhotoReviewImageUrl(photo.id));
    } catch {
      setFailed(true);
    }
  }

  if (failed) {
    return (
      <div className={`photo-review-preview ${large ? "large" : ""} is-empty`}>
        <ImageOff size={large ? 42 : 28} />
        <span>No preview</span>
      </div>
    );
  }

  if (!previewUrl) {
    return <div className={`photo-review-preview ${large ? "large" : ""} is-loading`}>Loading photo...</div>;
  }

  return (
    <div className={`photo-review-preview ${large ? "large" : ""}`}>
      <div className="photo-review-preview-bg" aria-hidden="true" style={{ backgroundImage: `url(${previewUrl})` }} />
      <img src={previewUrl} alt={photo.altText ?? vehicleTitle(photo)} onError={handleImageError} />
    </div>
  );
}

function PhotoReviewCard({
  photo,
  selected,
  onSelect,
  onStatus,
  busy,
}: {
  photo: PhotoReviewItem;
  selected: boolean;
  onSelect: (photo: PhotoReviewItem) => void;
  onStatus: (photo: PhotoReviewItem, status: "APPROVED" | "REJECTED") => void;
  busy: boolean;
}) {
  return (
    <article className={`photo-review-card ${selected ? "selected" : ""}`}>
      <button type="button" className="photo-review-open" onClick={() => onSelect(photo)}>
        <PhotoPreview photo={photo} />
        <div className="photo-review-card-body">
          <div className="photo-review-meta-row">
            <span className={`photo-status ${statusTone(photo.moderationStatus)}`}>{statusLabel(photo.moderationStatus)}</span>
            <span>{photo.source}</span>
          </div>
          <strong>#{photo.vehicleEntry.entryNumber} {vehicleTitle(photo)}</strong>
          <span>{photo.vehicleEntry.category.name} | {ownerName(photo)}</span>
          <small>{formatDateTime(photo.createdAt)}</small>
        </div>
      </button>
      <div className="photo-review-actions">
        <Button variant="secondary" disabled={busy || photo.moderationStatus === "REJECTED"} onClick={() => onStatus(photo, "REJECTED")}>
          <X size={18} />
          Reject
        </Button>
        <Button disabled={busy || photo.moderationStatus === "APPROVED"} onClick={() => onStatus(photo, "APPROVED")}>
          <Check size={18} />
          Approve
        </Button>
      </div>
    </article>
  );
}

function PhotoReviewDrawer({
  photo,
  busy,
  onClose,
  onStatus,
}: {
  photo: PhotoReviewItem | null;
  busy: boolean;
  onClose: () => void;
  onStatus: (photo: PhotoReviewItem, status: "APPROVED" | "REJECTED") => void;
}) {
  if (!photo) return null;
  return (
    <div className="photo-review-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="photo-review-drawer" aria-label="Photo review detail" onClick={(event) => event.stopPropagation()}>
        <div className="photo-review-top-banner">
          <div>
            <p>Celebration Church</p>
            <strong>Father's Day Car Show</strong>
          </div>
          <span>Review</span>
        </div>

        <div className="photo-review-toolbar">
          <button className="back-link" type="button" onClick={onClose}>
            <ArrowLeft size={18} />
            Back
          </button>
          <Button variant="icon" onClick={onClose} aria-label="Close photo detail">
            <X size={20} />
          </Button>
        </div>

        <div className="photo-review-entry-heading">
          <p className="eyebrow">Photo Review</p>
          <h2>Entry #{photo.vehicleEntry.entryNumber}</h2>
        </div>

        <PhotoPreview photo={photo} large />

        <section className="photo-review-detail-section">
          <div className="photo-review-meta-row">
            <span className={`photo-status ${statusTone(photo.moderationStatus)}`}>{statusLabel(photo.moderationStatus)}</span>
            <span>{photo.source}</span>
          </div>
          <h3>{vehicleTitle(photo)}</h3>
          <p>{photo.vehicleEntry.category.name} | {photo.vehicleEntry.exteriorColor ?? "No color listed"}</p>
        </section>

        <dl className="photo-review-facts">
          <div className="wide">
            <dt>Photo ID</dt>
            <dd>{photo.id}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{ownerName(photo)}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{photo.vehicleEntry.owner.phone}</dd>
          </div>
          <div>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(photo.createdAt)}</dd>
          </div>
          <div>
            <dt>Processed</dt>
            <dd>{formatDateTime(photo.processedAt)}</dd>
          </div>
          <div className="wide">
            <dt>AI Labels</dt>
            <dd>{labelSummary(photo.moderationLabels)}</dd>
          </div>
        </dl>

        <div className="photo-review-drawer-actions">
          <Button variant="secondary" disabled={busy || photo.moderationStatus === "REJECTED"} onClick={() => onStatus(photo, "REJECTED")}>
            <X size={18} />
            Reject Photo
          </Button>
          <Button disabled={busy || photo.moderationStatus === "APPROVED"} onClick={() => onStatus(photo, "APPROVED")}>
            <Check size={18} />
            Approve Photo
          </Button>
        </div>
      </aside>
    </div>
  );
}

export function PhotoReviewView() {
  const PAGE_SIZE = 20;
  const [queue, setQueue] = useState<PhotoReviewQueue>("needs-review");
  const [page, setPage] = useState(0);
  const [photos, setPhotos] = useState<PhotoReviewItem[]>([]);
  const [pagination, setPagination] = useState({ page: 0, pageSize: PAGE_SIZE, total: 0, pageCount: 0 });
  const [selected, setSelected] = useState<PhotoReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    listPhotoReviews(queue, page, PAGE_SIZE)
      .then(({ photos, pagination }) => {
        if (!photos.length && page > 0 && pagination.total > 0) {
          setPage(Math.max(0, pagination.pageCount - 1));
          return;
        }
        setPhotos(photos);
        setPagination(pagination);
        setSelected((current) => current ? photos.find((photo) => photo.id === current.id) ?? null : null);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load photos"))
      .finally(() => setLoading(false));
  }, [page, queue, refreshKey]);

  async function changeStatus(photo: PhotoReviewItem, status: "APPROVED" | "REJECTED") {
    setBusyId(photo.id);
    setError("");
    try {
      await updatePhotoReviewStatus(photo.id, status);
      setRefreshKey((value) => value + 1);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Photo update failed");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="photo-review-view">
      <PageHeader
        eyebrow="Moderation Queue"
        title="Photo Review"
        actions={
          <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw size={18} />
            Refresh
          </Button>
        }
      />

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="photo-review-tabs" role="tablist" aria-label="Photo queues">
        {QUEUES.map((item) => (
          <button
            key={item.key}
            className={queue === item.key ? "active" : ""}
            type="button"
            onClick={() => {
              setQueue(item.key);
              setPage(0);
              setSelected(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="photo-review-summary">
        <span><ShieldCheck size={18} /> Latest uploads first</span>
        <span>{pagination.total} photos</span>
      </div>

      {loading ? <div className="empty-state">Loading photos...</div> : null}
      {!loading && !photos.length ? <div className="empty-state">No photos in this queue.</div> : null}

      <div className="photo-review-grid">
        {photos.map((photo) => (
          <PhotoReviewCard
            key={photo.id}
            photo={photo}
            selected={selected?.id === photo.id}
            onSelect={setSelected}
            onStatus={changeStatus}
            busy={busyId === photo.id}
          />
        ))}
      </div>

      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        total={pagination.total}
        pageSize={pagination.pageSize}
        onChange={setPage}
      />

      <PhotoReviewDrawer
        photo={selected}
        busy={Boolean(busyId)}
        onClose={() => setSelected(null)}
        onStatus={changeStatus}
      />
    </section>
  );
}
