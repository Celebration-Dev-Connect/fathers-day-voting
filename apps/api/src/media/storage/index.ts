import { config } from "../../config.js";
import { LocalFsPhotoStorage } from "./localFs.js";
import { S3PhotoStorage } from "./s3.js";
import type { PhotoStorage } from "./types.js";

/** Pick the storage backend from config (STORAGE_DRIVER). */
export function createStorage(): PhotoStorage {
  if (config.storage.driver === "s3") {
    return new S3PhotoStorage(config.aws.s3Bucket!, config.aws.region!, config.aws.cdnBaseUrl!);
  }
  return new LocalFsPhotoStorage(config.storage.localDir, config.storage.publicBaseUrl);
}

export type { PhotoStorage } from "./types.js";
export { pendingKey, publicKey } from "./types.js";
