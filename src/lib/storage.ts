import "server-only";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const USER_CONTENT_BUCKET = "user-content";

export function isObjectStorageConfigured() {
  return Boolean(
    process.env.AWS_ENDPOINT_URL_S3
      && process.env.AWS_REGION
      && process.env.AWS_ACCESS_KEY_ID
      && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

function storageClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("对象存储尚未配置");
  }
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export async function createUploadUrl(objectKey: string, mimeType: string) {
  return getSignedUrl(
    storageClient(),
    new PutObjectCommand({
      Bucket: USER_CONTENT_BUCKET,
      Key: objectKey,
      ContentType: mimeType,
    }),
    { expiresIn: 300 },
  );
}

export async function createDownloadUrl(objectKey: string) {
  return getSignedUrl(
    storageClient(),
    new GetObjectCommand({ Bucket: USER_CONTENT_BUCKET, Key: objectKey }),
    { expiresIn: 300 },
  );
}
