export interface ImageModerator {
  /** Decide whether an image is safe for public viewing. Takes raw bytes so it is
   *  fully decoupled from the storage backend. */
  scan(image: { bytes: Buffer; contentType: string }): Promise<{ safe: boolean; labels: unknown }>;
}
