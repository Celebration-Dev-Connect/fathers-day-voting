import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Alert, Button, PageHeader, Pagination, formatDateTime } from "@carshow/carshow-components";
import type { PhotoReviewItem } from "@carshow/carshow-components";
import { useCallback, useEffect, useState } from "react";
import { listPhotoReviews, type PhotoReviewQueue, updatePhotoReviewStatus } from "../api";
import {
  PhotoPreview,
  PhotoReviewDrawer,
  photoReviewOwnerName,
  photoReviewStatusLabel,
  photoReviewStatusTone,
  photoReviewVehicleTitle,
} from "../organisms/PhotoReviewDrawer";

const QUEUES: Array<{ key: PhotoReviewQueue; label: string }> = [
  { key: "needs-review", label: "Needs Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

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
            <span className={`photo-status ${photoReviewStatusTone(photo.moderationStatus)}`}>{photoReviewStatusLabel(photo.moderationStatus)}</span>
            <span>{photo.source}</span>
          </div>
          <strong>#{photo.vehicleEntry.entryNumber} {photoReviewVehicleTitle(photo)}</strong>
          <span>{photo.vehicleEntry.category.name} | {photoReviewOwnerName(photo)}</span>
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

  const loadPhotos = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    return listPhotoReviews(queue, page, PAGE_SIZE)
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
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }, [page, queue]);

  useEffect(() => {
    void loadPhotos(true);
  }, [loadPhotos, refreshKey]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadPhotos(false), 10_000);
    return () => window.clearInterval(interval);
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
