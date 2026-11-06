import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStorage } from '@kadence/storage';
import type { AppEnv } from '../config/env.js';

@Injectable()
export class StorageService {
  private readonly storage: ObjectStorage;

  constructor(config: ConfigService<AppEnv, true>) {
    this.storage = new ObjectStorage({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      bucket: config.get('S3_BUCKET', { infer: true }),
      accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    });
  }

  getObject(key: string): Promise<Uint8Array> {
    return this.storage.getObject(key);
  }

  presignGet(key: string, expiresInSec = 3600): Promise<string> {
    return this.storage.presignGet(key, expiresInSec);
  }
}
