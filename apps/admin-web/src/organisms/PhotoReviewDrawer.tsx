import { ArrowLeft, Check, ImageOff, X } from "lucide-react";
import { Alert, Button, VehiclePhotoViewer, formatDateTime } from "@carshow/carshow-components";
import type { PhotoModerationStatus, PhotoReviewItem } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { getPhotoReviewImageUrl } from "../api";

export function photoReviewVehicleTitle(photo: PhotoReviewItem) {
  const vehicle = photo.vehicleEntry;
  const nickname = vehicle.nickname ? ` - "${vehicle.nickname}"` : "";
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}${nickname}`;
}

export function photoReviewOwnerName(photo: PhotoReviewItem) {
  return `${photo.vehicleEntry.owner.firstName} ${photo.vehicleEntry.owner.lastName}`;
}

export function photoReviewStatusLabel(status: PhotoModerationStatus) {
  return status.replace("_", " ");
}

export function photoReviewStatusTone(status: PhotoModerationStatus) {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "HUMAN_REVIEW" || status === "FAILED") return "review";
  return "pending";
}

export function photoReviewLabelSummary(labels: unknown) {
  if (!labels) return "No AI labels recorded";
  if (typeof labels !== "object") return String(labels);
  const value = labels as {
    moderation?: Array<{ name?: string; Name?: string; confidence?: number }>;
    vehicle?: Array<{ name?: string; Name?: string; confidence?: number }>;
    error?: string;
  };
  if (value.error) return value.error;
  const labelName = (item: { name?: string; Name?: string }) => item.name ?? item.Name;
  const moderation = value.moderation?.slice(0, 3).map(labelName).filter(Boolean) ?? [];
  const vehicle = value.vehicle?.slice(0, 3).map(labelName).filter(Boolean) ?? [];
  const parts = [
    moderation.length ? `Moderation: ${moderation.join(", ")}` : "",
    vehicle.length ? `Vehicle: ${vehicle.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "No AI labels recorded";
}

export function PhotoPreview({ photo, large = false }: { photo: PhotoReviewItem; large?: boolean }) {
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
      <VehiclePhotoViewer
        photos={[{ id: photo.id, url: previewUrl, altText: photo.altText ?? photoReviewVehicleTitle(photo) }]}
        title={photoReviewVehicleTitle(photo)}
        autoAdvance={false}
        showThumbnails={false}
        className="photo-review-viewer"
        onImageError={handleImageError}
      />
    </div>
  );
}

export function PhotoReviewDrawer({
  photo,
  busy,
  error,
  onClose,
  onStatus,
}: {
  photo: PhotoReviewItem | null;
  busy: boolean;
  error?: string;
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
            <strong>Father&apos;s Day Car Show</strong>
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

        {error ? <div className="photo-review-drawer-alert"><Alert variant="danger">{error}</Alert></div> : null}
        <PhotoPreview photo={photo} large />

        <section className="photo-review-detail-section">
          <div className="photo-review-meta-row">
            <span className={`photo-status ${photoReviewStatusTone(photo.moderationStatus)}`}>
              {photoReviewStatusLabel(photo.moderationStatus)}
            </span>
            <span>{photo.source}</span>
          </div>
          <h3>{photoReviewVehicleTitle(photo)}</h3>
          <p>{photo.vehicleEntry.category.name} | {photo.vehicleEntry.exteriorColor ?? "No color listed"}</p>
        </section>

        <dl className="photo-review-facts">
          <div className="wide">
            <dt>Photo ID</dt>
            <dd>{photo.id}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{photoReviewOwnerName(photo)}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{photo.vehicleEntry.owner.phone || "Not listed"}</dd>
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
            <dd>{photoReviewLabelSummary(photo.moderationLabels)}</dd>
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
