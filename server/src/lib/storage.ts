import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_BYTES = 32;
const SIGNED_URL_SECONDS = 60;

export type KycStorageProvider = "local" | "s3";

export interface ParsedDataUrl {
  mime: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  buffer: Buffer;
}

export interface StoredKycDocument {
  key: string;
  bytes: number;
  mime: ParsedDataUrl["mime"];
  provider: KycStorageProvider;
}

export type KycDocumentAccess =
  | { kind: "buffer"; buffer: Buffer; mime: string }
  | { kind: "url"; url: string; expiresInSeconds: number };

function startsWithBytes(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((value, index) => buffer[offset + index] === value);
}

function detectImage(buffer: Buffer): Pick<ParsedDataUrl, "mime" | "extension"> {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46])
    && startsWithBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  throw new Error("The uploaded file is not a valid JPG, PNG, or WEBP image");
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = /^data:([a-z0-9/+.-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("Invalid image data (expected a base64 data URL)");

  const declaredMime = match[1].toLowerCase() === "image/jpg"
    ? "image/jpeg"
    : match[1].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(declaredMime)) {
    throw new Error("Only JPG, PNG, or WEBP images are allowed");
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length < MIN_IMAGE_BYTES) throw new Error("Image data is incomplete");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image is too large (max 5MB)");

  const detected = detectImage(buffer);
  if (declaredMime !== detected.mime) {
    throw new Error("The image content does not match its declared file type");
  }

  return { ...detected, buffer };
}

export function kycStorageProvider(): KycStorageProvider {
  const configured = (process.env.KYC_STORAGE_PROVIDER || "").trim().toLowerCase();
  if (configured === "s3") return "s3";
  if (configured === "local") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local KYC storage is forbidden in production");
    }
    return "local";
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("KYC_STORAGE_PROVIDER=s3 is required in production");
  }
  return "local";
}

function localStorageRoot(): string {
  return path.resolve(process.env.KYC_STORAGE_DIR || "uploads/kyc");
}

function s3Bucket(): string {
  const bucket = process.env.KYC_S3_BUCKET?.trim() || "";
  if (!bucket) throw new Error("KYC_S3_BUCKET is required for S3 storage");
  return bucket;
}

function s3Client(): S3Client {
  const region = process.env.KYC_S3_REGION?.trim() || "";
  if (!region) throw new Error("KYC_S3_REGION is required for S3 storage");

  const accessKeyId = process.env.KYC_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.KYC_S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Both KYC_S3_ACCESS_KEY_ID and KYC_S3_SECRET_ACCESS_KEY must be provided together");
  }

  return new S3Client({
    region,
    endpoint: process.env.KYC_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.KYC_S3_FORCE_PATH_STYLE === "true",
    credentials: accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
  });
}

function objectKey(userId: string, side: "front" | "back", extension: string): string {
  const safeUserId = userId.replace(/[^a-z0-9-]/gi, "");
  if (!safeUserId) throw new Error("Invalid user identifier for document storage");
  return `kyc/${safeUserId}/${Date.now()}-${crypto.randomUUID()}-${side}.${extension}`;
}

function localAbsolutePath(key: string): string {
  const root = localStorageRoot();
  const absolute = path.resolve(root, key);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid KYC document key");
  }
  return absolute;
}

export async function saveKycImage(params: {
  userId: string;
  side: "front" | "back";
  dataUrl: string;
}): Promise<StoredKycDocument> {
  const parsed = parseDataUrl(params.dataUrl);
  const provider = kycStorageProvider();
  const key = objectKey(params.userId, params.side, parsed.extension);

  if (provider === "s3") {
    const kmsKeyId = process.env.KYC_S3_KMS_KEY_ID?.trim();
    await s3Client().send(new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.mime,
      ContentLength: parsed.buffer.length,
      ServerSideEncryption: kmsKeyId ? "aws:kms" : "AES256",
      SSEKMSKeyId: kmsKeyId || undefined,
      Metadata: {
        "kuula-data-class": "national-id",
        "kuula-document-side": params.side,
      },
    }));
  } else {
    const absolute = localAbsolutePath(key);
    await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await fs.writeFile(absolute, parsed.buffer, { mode: 0o600 });
  }

  return {
    key,
    bytes: parsed.buffer.length,
    mime: parsed.mime,
    provider,
  };
}

export async function deleteKycDocument(key: string): Promise<void> {
  const provider = kycStorageProvider();
  if (provider === "s3") {
    await s3Client().send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }));
    return;
  }
  await fs.rm(localAbsolutePath(key), { force: true });
}

export async function accessKycDocument(key: string, mime: string): Promise<KycDocumentAccess> {
  const provider = kycStorageProvider();
  if (provider === "s3") {
    const command = new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      ResponseContentType: mime,
      ResponseContentDisposition: "inline",
    });
    return {
      kind: "url",
      url: await getSignedUrl(s3Client(), command, { expiresIn: SIGNED_URL_SECONDS }),
      expiresInSeconds: SIGNED_URL_SECONDS,
    };
  }

  return {
    kind: "buffer",
    buffer: await fs.readFile(localAbsolutePath(key)),
    mime,
  };
}
