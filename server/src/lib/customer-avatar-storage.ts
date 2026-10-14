import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { kycStorageProvider, parseDataUrl } from "./storage.js";

function client() {
  const region = process.env.KYC_S3_REGION?.trim();
  if (!region) throw new Error("KYC_S3_REGION is required");
  const id = process.env.KYC_S3_ACCESS_KEY_ID?.trim();
  const secret = process.env.KYC_S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(id) !== Boolean(secret)) throw new Error("Incomplete S3 credentials");
  return new S3Client({
    region, endpoint: process.env.KYC_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.KYC_S3_FORCE_PATH_STYLE === "true",
    credentials: id && secret ? { accessKeyId: id, secretAccessKey: secret } : undefined,
  });
}
function bucket() {
  const name = process.env.KYC_S3_BUCKET?.trim();
  if (!name) throw new Error("KYC_S3_BUCKET is required");
  return name;
}
function safeKey(key: string) {
  if (!/^customer-avatars\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(key)) throw new Error("Invalid avatar key");
  return key;
}
function local(key: string) {
  const root = path.resolve(process.env.KYC_STORAGE_DIR || "uploads/kyc");
  const destination = path.resolve(root, safeKey(key));
  if (!destination.startsWith(root + path.sep)) throw new Error("Invalid avatar path");
  return destination;
}
export async function saveAvatar(userId: string, dataUrl: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error("Invalid user ID");
  const file = parseDataUrl(dataUrl);
  const key = `customer-avatars/${userId}/${crypto.randomUUID()}.${file.extension}`;
  if (kycStorageProvider() === "s3") {
    const kms = process.env.KYC_S3_KMS_KEY_ID?.trim();
    await client().send(new PutObjectCommand({
      Bucket: bucket(), Key: key, Body: file.buffer, ContentType: file.mime,
      ContentLength: file.buffer.length,
      ServerSideEncryption: kms ? "aws:kms" : "AES256", SSEKMSKeyId: kms || undefined,
      Metadata: { "kuula-data-class": "customer-profile-photo" },
    }));
  } else {
    const dest = local(key);
    await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    await fs.writeFile(dest, file.buffer, { mode: 0o600 });
  }
  return { key, mime: file.mime, bytes: file.buffer.length };
}
export async function accessAvatar(key: string, mime: string) {
  safeKey(key);
  if (kycStorageProvider() === "s3") {
    return { kind: "url" as const, url: await getSignedUrl(client(), new GetObjectCommand({
      Bucket: bucket(), Key: key, ResponseContentType: mime,
      ResponseContentDisposition: "inline",
    }), { expiresIn: 60 }) };
  }
  return { kind: "buffer" as const, buffer: await fs.readFile(local(key)), mime };
}
export async function deleteAvatar(key: string) {
  safeKey(key);
  if (kycStorageProvider() === "s3") await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  else await fs.rm(local(key), { force: true });
}
