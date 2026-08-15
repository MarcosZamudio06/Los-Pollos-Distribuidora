export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export type ObjectStoragePutInput = {
  key: string;
  body: Buffer;
  contentType: string;
  checksumSha256?: string;
};

export interface ObjectStoragePort {
  isConfigured(): boolean;
  putObject(input: ObjectStoragePutInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
