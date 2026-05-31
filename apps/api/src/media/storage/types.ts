export interface PhotoStorage {
  /** Store raw bytes under the pending prefix. */
  putPending(id: string, bytes: Buffer, contentType: string): Promise<{ storageKey: string }>;
  /** Read bytes back (used by the moderator, backend-agnostic). */
  getBytes(storageKey: string): Promise<Buffer>;
  /** Promote pending/<id> → public/<id>. */
  moveToPublic(id: string): Promise<{ storageKey: string }>;
  deletePending(id: string): Promise<void>;
  deletePublic(id: string): Promise<void>;
  /** How an APPROVED photo is served to the public. */
  publicUrl(storageKey: string): string;
}

export const pendingKey = (id: string) => `pending/${id}`;
export const publicKey = (id: string) => `public/${id}`;
