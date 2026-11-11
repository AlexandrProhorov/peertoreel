import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildAssetObjectKey as contractAssetObjectKey } from '@peertoreel/contracts';

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const SAFE_NAME = /[^a-zA-Z0-9._-]/g;

/** AWS SDK shapes a missing key as `NotFound` (HEAD) or `NoSuchKey` (GET). */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  const status = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
    ?.httpStatusCode;

  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}

/** `runs/<runId>/<stage>/<name>` — one prefix per run, easy to wipe or audit. */
export function buildArtifactKey(
  runId: string,
  stage: string,
  name: string,
): string {
  const safeStage = stage.replace(SAFE_NAME, '_');
  const safeName = name.replace(SAFE_NAME, '_');

  if (!runId || !safeName) {
    throw new Error('Artifact key needs a run id and a file name');
  }

  return `runs/${runId}/${safeStage}/${safeName}`;
}

/**
 * Content-addressed key for a normalized asset (`assets/<hash[0..1]>/<hash>/<hash>.<ext>`).
 * The format is owned by `@peertoreel/contracts` so the resolver, the DB row and
 * this storage adapter cannot drift (ADR-0017 D1/D3).
 */
export function buildAssetObjectKey(
  contentHash: string,
  extension: string,
): string {
  return contractAssetObjectKey(contentHash, extension);
}

export class ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Object ${key} returned no body`);
    }

    return response.Body.transformToByteArray();
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }

  /**
   * Cheap existence probe for content-addressed keys (`HEAD`, no body).
   * Only a missing object is a `false`; auth/network errors propagate so a
   * transient failure cannot be mistaken for "not uploaded yet".
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );

      return true;
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Signed, time-limited URL for downloads (UI, TikTok PULL_FROM_URL later).
   * `downloadName` adds `Content-Disposition: attachment`, which is the only
   * way to force a download from a cross-origin presigned URL.
   */
  async presignGet(
    key: string,
    expiresInSec = 3600,
    downloadName?: string,
  ): Promise<string> {
    const safeDownloadName = downloadName?.replace(SAFE_NAME, '_');

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(safeDownloadName
          ? {
              ResponseContentDisposition: `attachment; filename="${safeDownloadName}"`,
            }
          : {}),
      }),
      { expiresIn: expiresInSec },
    );
  }
}
