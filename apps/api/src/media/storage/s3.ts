import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { PhotoStorage } from "./types.js";
import { pendingKey, publicKey } from "./types.js";

/** Prod driver: stores photos in S3; APPROVED objects served via CloudFront. */
export class S3PhotoStorage implements PhotoStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    region: string,
    private readonly cdnBaseUrl: string,
  ) {
    this.client = new S3Client({ region });
  }

  async putPending(id: string, bytes: Buffer, contentType: string) {
    const storageKey = pendingKey(id);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: bytes, ContentType: contentType }),
    );
    return { storageKey };
  }

  async getBytes(storageKey: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    if (!res.Body) throw new Error(`S3 object ${storageKey} has no body`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  s3Location(storageKey: string) {
    return { bucket: this.bucket, key: storageKey };
  }

  async putPublicVariant(id: string, suffix: "medium" | "thumb", bytes: Buffer, contentType: string) {
    const storageKey = `public/${id}-${suffix}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: bytes, ContentType: contentType }),
    );
    return { storageKey };
  }

  async moveToPublic(id: string) {
    const from = pendingKey(id);
    const storageKey = publicKey(id);
    await this.client.send(
      new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${from}`, Key: storageKey }),
    );
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: from }));
    return { storageKey };
  }

  async deletePending(id: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: pendingKey(id) }));
  }

  async deletePublic(id: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: publicKey(id) }));
  }

  async deleteStorageKey(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }

  publicUrl(storageKey: string) {
    // CloudFront origin path is /public, so the public object id is the key without that prefix.
    const name = storageKey.replace(/^public\//, "");
    return `${this.cdnBaseUrl}/${name}`;
  }
}
