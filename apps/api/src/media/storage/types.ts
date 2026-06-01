export interface PhotoStorage {
  /** Store raw bytes under the pending prefix. */
  putPending(id: string, bytes: Buffer, contentType: string): Promise<{ storageKey: string }>;
  /** Read bytes back — used by the local driver for moderation. */
  getBytes(storageKey: string): Promise<Buffer>;
  /**
   * Return the S3 bucket + key for a storage key so Rekognition can read the
   * image directly without the bytes passing through this server.
   * Returns null for non-S3 drivers (local dev).
   */
  s3Location(storageKey: string): { bucket: string; key: string } | null;
  /** Promote pending/<id> → public/<id>. */
  moveToPublic(id: string): Promise<{ storageKey: string }>;
  deletePending(id: string): Promise<void>;
  deletePublic(id: string): Promise<void>;
  /** How an APPROVED photo is served to the public. */
  publicUrl(storageKey: string): string;
}

export const pendingKey = (id: string) => `pending/${id}`;
export const publicKey = (id: string) => `public/${id}`;
