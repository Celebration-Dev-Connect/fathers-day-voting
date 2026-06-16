import { useEffect, useMemo, useState } from "react";

export type VehiclePhotoViewerPhoto = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  altText?: string | null;
};

export function VehiclePhotoViewer({
  photos,
  title,
  autoAdvance = false,
  showThumbnails = true,
  selectedPhotoId,
  onSelectPhoto,
  uploadButton,
  emptyContent,
  className = "",
  onImageError,
}: {
  photos: VehiclePhotoViewerPhoto[];
  title: string;
  autoAdvance?: boolean;
  showThumbnails?: boolean;
  selectedPhotoId?: string | null;
  onSelectPhoto?: (photoId: string) => void;
  uploadButton?: React.ReactNode;
  emptyContent?: React.ReactNode;
  className?: string;
  onImageError?: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const photoSignature = useMemo(() => photos.map((photo) => photo.id).join("|"), [photos]);
  const selectedIndex = useMemo(
    () => photos.findIndex((photo) => photo.id === selectedPhotoId),
    [photos, selectedPhotoId],
  );
  const activeIndex = selectedIndex >= 0 ? selectedIndex : Math.min(photoIndex, Math.max(photos.length - 1, 0));
  const currentPhoto = photos[activeIndex];
  const currentLoaded = loadedIds.has(currentPhoto?.id ?? "");
  const shouldShowThumbStrip = showThumbnails && (photos.length > 1 || uploadButton !== undefined);

  useEffect(() => {
    setPhotoIndex(0);
  }, [photoSignature]);

  useEffect(() => {
    if (!autoAdvance || photos.length <= 1) return;
    const id = setInterval(() => {
      const nextIndex = (activeIndex + 1) % photos.length;
      const nextPhoto = photos[nextIndex];
      setPhotoIndex(nextIndex);
      if (nextPhoto && onSelectPhoto) onSelectPhoto(nextPhoto.id);
    }, 5000);
    return () => clearInterval(id);
  }, [activeIndex, autoAdvance, onSelectPhoto, photos]);

  function markLoaded(id: string) {
    setLoadedIds((prev) => new Set([...prev, id]));
  }

  function selectPhoto(index: number) {
    const photo = photos[index];
    setPhotoIndex(index);
    if (photo && onSelectPhoto) onSelectPhoto(photo.id);
  }

  return (
    <div className={`vehicle-profile-photos${className ? ` ${className}` : ""}`}>
      {photos.length > 0 && currentPhoto ? (
        <div className="vehicle-profile-photo-wrap">
          <div
            className="vehicle-profile-photo-bg"
            aria-hidden="true"
            style={{ backgroundImage: `url(${currentPhoto.url})` }}
          />
          {!currentLoaded && <div className="img-shimmer" aria-hidden="true" />}
          <img
            key={currentPhoto.id}
            className="vehicle-profile-main-photo"
            src={currentPhoto.url}
            alt={currentPhoto.altText ?? title}
            style={{ opacity: currentLoaded ? 1 : 0, transition: "opacity 0.3s ease" }}
            onLoad={() => markLoaded(currentPhoto.id)}
            onError={onImageError}
          />
        </div>
      ) : (
        <div className="vehicle-profile-no-photo">{emptyContent}</div>
      )}

      {shouldShowThumbStrip ? (
        <div className="vehicle-profile-thumb-row">
          <div className="vehicle-profile-thumbs">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                className={`vehicle-profile-thumb${index === activeIndex ? " active" : ""}`}
                onClick={() => selectPhoto(index)}
                aria-label={`Photo ${index + 1}`}
                type="button"
              >
                {!loadedIds.has(photo.id) && <div className="img-shimmer" aria-hidden="true" />}
                <img
                  src={photo.thumbUrl ?? photo.url}
                  alt=""
                  style={{ opacity: loadedIds.has(photo.id) ? 1 : 0, transition: "opacity 0.25s ease" }}
                  onLoad={() => markLoaded(photo.id)}
                />
              </button>
            ))}
          </div>
          {uploadButton}
        </div>
      ) : null}
    </div>
  );
}
