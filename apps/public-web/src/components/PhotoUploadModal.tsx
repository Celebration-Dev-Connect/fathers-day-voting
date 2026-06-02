import { useRef, useState } from "react";
import { uploadVisitorPhoto } from "../api";

type Props = {
  vehicleId: string;
  vehicleTitle: string;
  onClose: () => void;
};

type Stage = "idle" | "previewing" | "uploading" | "success" | "error";

const ACCEPTED = "image/jpeg,image/png,image/webp";

export function PhotoUploadModal({ vehicleId, vehicleTitle, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    setStage("previewing");
  }

  function handleChooseDifferent() {
    setFile(null);
    setPreview(null);
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) return;
    setStage("uploading");
    try {
      await uploadVisitorPhoto(vehicleId, file);
      setStage("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setStage("error");
    }
  }

  function handleRetry() {
    setStage("previewing");
    setErrorMsg("");
  }

  return (
    <>
      <div className="upload-modal-backdrop" onClick={stage !== "uploading" ? onClose : undefined} aria-hidden="true" />
      <div className="upload-modal" role="dialog" aria-modal="true" aria-label="Upload a photo">
        <div className="upload-modal-header">
          <h2 className="upload-modal-title">Add Your Photo</h2>
          {stage !== "uploading" && (
            <button className="upload-modal-close" onClick={onClose} aria-label="Close">✕</button>
          )}
        </div>

        {stage === "idle" && (
          <div className="upload-modal-body">
            <p className="upload-modal-vehicle">{vehicleTitle}</p>
            <p className="upload-modal-instructions">
              Share your photo of this car. All photos are reviewed before appearing publicly — this usually takes a few minutes.
            </p>
            <button className="upload-modal-pick-btn" onClick={() => inputRef.current?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Choose Photo
            </button>
            <p className="upload-modal-hint">JPEG, PNG, or WebP · Max one photo per submission</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="upload-modal-file-input"
              onChange={handleFileChange}
              aria-hidden="true"
            />
          </div>
        )}

        {(stage === "previewing" || stage === "error") && preview && (
          <div className="upload-modal-body">
            <img src={preview} alt="Preview of your photo" className="upload-modal-preview" />
            {stage === "error" && (
              <p className="upload-modal-error">{errorMsg}</p>
            )}
            <div className="upload-modal-actions">
              <button className="upload-modal-submit-btn" onClick={handleUpload}>
                Upload Photo
              </button>
              <button className="upload-modal-secondary-btn" onClick={handleChooseDifferent}>
                Choose Different
              </button>
            </div>
            {stage === "error" && (
              <button className="upload-modal-retry-btn" onClick={handleRetry}>Try Again</button>
            )}
          </div>
        )}

        {stage === "uploading" && (
          <div className="upload-modal-body upload-modal-body--centered">
            <div className="upload-modal-spinner" aria-label="Uploading…" />
            <p className="upload-modal-status">Uploading your photo…</p>
          </div>
        )}

        {stage === "success" && (
          <div className="upload-modal-body upload-modal-body--centered">
            <p className="upload-modal-success-icon" aria-hidden="true">📸</p>
            <h3 className="upload-modal-success-title">Photo Submitted!</h3>
            <p className="upload-modal-instructions">
              Your photo is under review and will appear here once approved — usually within a few minutes.
            </p>
            <button className="upload-modal-submit-btn" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </>
  );
}
