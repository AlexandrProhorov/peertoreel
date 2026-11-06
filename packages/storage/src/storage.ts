import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const SAFE_NAME = /[^a-zA-Z0-9._-]/g;

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
