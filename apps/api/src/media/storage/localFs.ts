import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PhotoStorage } from "./types.js";
import { pendingKey, publicKey } from "./types.js";

/** Dev driver: stores photos on local disk under baseDir/{pending,public}/<id>. */
export class LocalFsPhotoStorage implements PhotoStorage {
  constructor(
    private readonly baseDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  private path(storageKey: string) {
    return join(this.baseDir, storageKey);
  }

  async putPending(id: string, bytes: Buffer, _contentType: string) {
    const storageKey = pendingKey(id);
    const dest = this.path(storageKey);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    return { storageKey };
  }

  async getBytes(storageKey: string) {
    return readFile(this.path(storageKey));
  }

  async moveToPublic(id: string) {
    const from = this.path(pendingKey(id));
    const storageKey = publicKey(id);
    const to = this.path(storageKey);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return { storageKey };
  }

  async deletePending(id: string) {
    await this.safeUnlink(this.path(pendingKey(id)));
  }

  async deletePublic(id: string) {
    await this.safeUnlink(this.path(publicKey(id)));
  }

  publicUrl(storageKey: string) {
    return `${this.publicBaseUrl}/media/${storageKey}`;
  }

  private async safeUnlink(target: string) {
    try {
      await unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
