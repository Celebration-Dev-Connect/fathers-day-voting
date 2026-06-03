import { X } from "lucide-react";
import { Button, vehicleName, type Registration, type VehiclePhoto } from "@carshow/carshow-components";

type PhotoWithUrl = VehiclePhoto & { url: string };

function hasPhotoUrl(photo: VehiclePhoto): photo is PhotoWithUrl {
  return Boolean(photo.url);
}

export function WinnerDrawer({ registration, onClose }: { registration: Registration; onClose: () => void }) {
  const photos = (registration.photos ?? []).filter(hasPhotoUrl);

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="winner-drawer" aria-label="Winner vehicle details">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Winner Detail</p>
            <h2>{vehicleName(registration)}</h2>
          </div>
          <Button variant="icon" light onClick={onClose} aria-label="Close winner details">
            <X size={20} />
          </Button>
        </div>

        <div className="winner-photo-grid">
          {photos.length ? (
            photos.map((photo) => (
              <img key={photo.id} src={photo.url} alt={photo.altText ?? vehicleName(registration)} />
            ))
          ) : (
            <div className="photo-empty">No photos loaded.</div>
          )}
        </div>

        <div className="winner-detail-grid">
          <div>
            <span>Entry</span>
            <strong>#{registration.entryNumber.toString().padStart(3, "0")}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{registration.category.name}</strong>
          </div>
          <div>
            <span>Owner</span>
            <strong>
              {registration.owner.firstName} {registration.owner.lastName}
            </strong>
          </div>
          <div>
            <span>Phone</span>
            <strong>{registration.owner.phone}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{registration.owner.email ?? "Not provided"}</strong>
          </div>
          <div>
            <span>QR</span>
            <strong>{registration.qrCard?.visibleCode ?? "No QR assigned"}</strong>
          </div>
          <div>
            <span>Color</span>
            <strong>{registration.exteriorColor ?? "Not set"}</strong>
          </div>
          <div>
            <span>Plate</span>
            <strong>{registration.plateNumber ?? "Not set"}</strong>
          </div>
        </div>

        {registration.nickname ? <div className="drawer-note">{registration.nickname}</div> : null}
        {registration.internalNotes ? <div className="drawer-note muted">{registration.internalNotes}</div> : null}
      </aside>
    </div>
  );
}
